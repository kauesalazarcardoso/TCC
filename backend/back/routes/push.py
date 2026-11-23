import hashlib
from datetime import datetime

from flask import Blueprint, jsonify, request

import push
from database import get_conn
from routes.auth import login_required

push_bp = Blueprint('push', __name__)

_NOME_MAX = 60


def _limpar_nome(valor):
    """Nome do aparelho opcional: texto aparado, até _NOME_MAX caracteres.
    Retorna None se vazio ou ausente."""
    if not isinstance(valor, str):
        return None
    valor = valor.strip()[:_NOME_MAX]
    return valor or None


def _id_aparelho(endpoint):
    """Identificador estável e não sensível da inscrição. O endpoint em si
    funciona como credencial de envio, então ele nunca sai do servidor; o
    painel calcula o mesmo hash no navegador pra marcar "este aparelho"."""
    return hashlib.sha256(endpoint.encode("utf-8")).hexdigest()[:16]


@push_bp.route("/push/subscribe", methods=["POST"])
@login_required
def subscribe():
    data = request.get_json()
    if not data or "endpoint" not in data or "keys" not in data:
        return jsonify({"erro": "Inscrição inválida"}), 400

    if not push.endpoint_valido(data["endpoint"]):
        return jsonify({"erro": "Endpoint de push não reconhecido"}), 400

    keys = data["keys"]
    if not keys.get("p256dh") or not keys.get("auth"):
        return jsonify({"erro": "Inscrição inválida"}), 400

    nome = _limpar_nome(data.get("nome"))

    with get_conn() as conn:
        # Reativar num aparelho já inscrito só atualiza o nome (se veio um).
        conn.execute(
            "INSERT INTO push_subscriptions (endpoint, p256dh, auth, criado_em, nome) "
            "VALUES (%s, %s, %s, %s, %s) "
            "ON CONFLICT (endpoint) DO UPDATE "
            "SET nome = COALESCE(EXCLUDED.nome, push_subscriptions.nome)",
            (data["endpoint"], keys["p256dh"], keys["auth"], datetime.now().isoformat(), nome)
        )

    return jsonify({"ok": True}), 201


@push_bp.route("/push/dispositivos", methods=["GET"])
@login_required
def listar_dispositivos():
    with get_conn() as conn:
        linhas = conn.execute(
            "SELECT id, endpoint, nome, criado_em FROM push_subscriptions ORDER BY criado_em"
        ).fetchall()

    return jsonify([
        {
            "id": linha["id"],
            "nome": linha["nome"],
            "navegador": push.descrever_navegador(linha["endpoint"]),
            "criado_em": linha["criado_em"],
            "aparelho_id": _id_aparelho(linha["endpoint"]),
        }
        for linha in linhas
    ])


@push_bp.route("/push/dispositivos/<int:sub_id>", methods=["PATCH"])
@login_required
def renomear_dispositivo(sub_id):
    data = request.get_json(silent=True) or {}
    nome = _limpar_nome(data.get("nome"))
    if not nome:
        return jsonify({"erro": "Informe um nome para o aparelho"}), 400

    with get_conn() as conn:
        cur = conn.execute(
            "UPDATE push_subscriptions SET nome = %s WHERE id = %s", (nome, sub_id)
        )
        if cur.rowcount == 0:
            return jsonify({"erro": "Aparelho não encontrado"}), 404

    return jsonify({"ok": True})


@push_bp.route("/push/dispositivos/<int:sub_id>", methods=["DELETE"])
@login_required
def remover_dispositivo(sub_id):
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM push_subscriptions WHERE id = %s", (sub_id,))
        if cur.rowcount == 0:
            return jsonify({"erro": "Aparelho não encontrado"}), 404

    return jsonify({"ok": True})


@push_bp.route("/push/dispositivos/<int:sub_id>/teste", methods=["POST"])
@login_required
def testar_dispositivo(sub_id):
    with get_conn() as conn:
        sub = conn.execute(
            "SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE id = %s",
            (sub_id,)
        ).fetchone()
    if not sub:
        return jsonify({"erro": "Aparelho não encontrado"}), 404

    resultado = push.enviar_teste(sub)
    if resultado == "ok":
        return jsonify({"ok": True})
    if resultado == "expirada":
        return jsonify({
            "erro": "Este aparelho não está mais inscrito e foi removido da lista."
        }), 410
    return jsonify({"erro": "Não foi possível enviar a notificação de teste."}), 502


@push_bp.route("/push/dispositivos/teste", methods=["POST"])
@login_required
def testar_todos_dispositivos():
    with get_conn() as conn:
        subs = conn.execute(
            "SELECT id, endpoint, p256dh, auth, nome FROM push_subscriptions ORDER BY criado_em"
        ).fetchall()

    return jsonify([
        {
            "id": sub["id"],
            "nome": sub["nome"],
            "navegador": push.descrever_navegador(sub["endpoint"]),
            "resultado": push.enviar_teste(sub),
        }
        for sub in subs
    ])
