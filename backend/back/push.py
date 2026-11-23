import json
import logging
import os
from urllib.parse import urlparse

from pywebpush import webpush, WebPushException

from database import get_conn

logger = logging.getLogger(__name__)

VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY")
VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY")
VAPID_CONTATO = os.environ.get("VAPID_CONTATO", "mailto:contato@example.com")

# Hosts conhecidos dos serviços de push dos navegadores. Qualquer endpoint de
# inscrição fora dessa lista é rejeitado — sem isso, um endpoint arbitrário
# vindo do cliente viraria alvo de requisição HTTP feita pelo próprio
# servidor (SSRF) toda vez que um pedido novo disparasse uma notificação.
_HOSTS_PUSH_PERMITIDOS = {
    "fcm.googleapis.com",
    "android.googleapis.com",
    "updates.push.services.mozilla.com",
    "web.push.apple.com",
}


def endpoint_valido(endpoint):
    if not isinstance(endpoint, str):
        return False
    try:
        partes = urlparse(endpoint)
    except ValueError:
        return False
    if partes.scheme != "https":
        return False
    host = partes.hostname or ""
    if host in _HOSTS_PUSH_PERMITIDOS:
        return True
    return host.endswith(".notify.windows.com")


def descrever_navegador(endpoint):
    """Nome amigável do serviço de push, deduzido do host do endpoint."""
    host = (urlparse(endpoint).hostname or "") if isinstance(endpoint, str) else ""
    if host in ("fcm.googleapis.com", "android.googleapis.com"):
        return "Chrome (PC ou Android)"
    if host.endswith(".notify.windows.com"):
        return "Edge (Windows)"
    if host == "web.push.apple.com":
        return "Safari (iPhone/Mac)"
    if host == "updates.push.services.mozilla.com":
        return "Firefox"
    return "Outro"


def _enviar(sub, payload):
    """Envia o payload pra uma inscrição. Retorna "ok", "expirada" (o
    serviço de push disse que ela não existe mais e ela foi apagada) ou
    "erro". Nunca levanta exceção."""
    if not endpoint_valido(sub["endpoint"]):
        logger.warning("Inscrição de push com endpoint não reconhecido, ignorando (id=%s)", sub["id"])
        return "erro"
    try:
        webpush(
            subscription_info={
                "endpoint": sub["endpoint"],
                "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]},
            },
            data=payload,
            # TTL explícito é obrigatório pro WNS (push do Edge/Windows) —
            # sem isso ele recusa com 400 Bad Request sem corpo, mesmo
            # com VAPID correto. FCM/Mozilla toleram TTL 0, WNS não.
            ttl=3600,
            # Prioridade alta: sem isso o Android em economia de bateria
            # pode segurar o aviso por vários minutos antes de entregar.
            headers={"Urgency": "high"},
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims={"sub": VAPID_CONTATO},
        )
        return "ok"
    except WebPushException as e:
        status = e.response.status_code if e.response is not None else None
        if status in (404, 410):
            try:
                with get_conn() as conn:
                    conn.execute(
                        "DELETE FROM push_subscriptions WHERE id = %s", (sub["id"],)
                    )
            except Exception:
                logger.exception("Erro ao remover inscrição de push expirada")
            return "expirada"
        logger.exception("Erro ao enviar push (endpoint=%s)", sub["endpoint"])
        return "erro"
    except Exception:
        logger.exception("Erro inesperado ao enviar push (endpoint=%s)", sub["endpoint"])
        return "erro"


def enviar_para_todos(titulo, corpo, tag):
    """Envia uma push notification pra todos os dispositivos inscritos.
    Best-effort: nunca levanta exceção, pra nunca derrubar a criação de
    um pedido por causa de uma falha no envio do push."""
    if not VAPID_PRIVATE_KEY:
        return

    try:
        with get_conn() as conn:
            subs = conn.execute(
                "SELECT id, endpoint, p256dh, auth FROM push_subscriptions"
            ).fetchall()
    except Exception:
        logger.exception("Erro ao buscar inscrições de push")
        return

    payload = json.dumps({"title": titulo, "body": corpo, "tag": tag})
    for sub in subs:
        _enviar(sub, payload)


def enviar_teste(sub):
    """Manda uma notificação de teste pra uma inscrição específica."""
    if not VAPID_PRIVATE_KEY:
        return "erro"
    payload = json.dumps({
        "title": "🔔 Teste de notificação",
        "body": "Este aparelho está recebendo os avisos de pedido novo.",
        "tag": f"teste-{sub['id']}",
    })
    return _enviar(sub, payload)
