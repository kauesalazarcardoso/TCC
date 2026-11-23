import time
import uuid
from datetime import datetime, timedelta
from functools import wraps

from flask import Blueprint, jsonify, request
from werkzeug.security import check_password_hash

from database import get_conn

auth_bp = Blueprint('auth', __name__)

# Bloqueio de força bruta no /login: contador em memória, por usuário.
# Funciona em produção porque o Gunicorn roda com um único worker (mesma
# premissa já documentada em database.py pro pool de conexões) — não precisa
# de tabela no banco nem de um cache externo (Redis etc) só pra isso.
_LIMITE_TENTATIVAS = 5
_BLOQUEIO_SEGUNDOS = 15 * 60
_tentativas_login = {}  # usuario -> {"falhas": int, "bloqueado_ate": float | None}

# Sessão expira depois de 30 dias SEM USO (não 30 dias desde o login): o painel
# do estabelecimento faz polling a cada 5s, então quem está usando nunca é
# deslogado no meio do expediente. Pra não gravar no banco a cada requisição,
# o "último uso" (coluna criado_em) só é renovado se tiver mais de 1 dia.
_SESSAO_EXPIRA_APOS = timedelta(days=30)
_SESSAO_RENOVA_APOS = timedelta(days=1)


def _registrar_falha_login(usuario):
    estado = _tentativas_login.setdefault(usuario, {"falhas": 0, "bloqueado_ate": None})
    estado["falhas"] += 1
    if estado["falhas"] >= _LIMITE_TENTATIVAS:
        estado["bloqueado_ate"] = time.monotonic() + _BLOQUEIO_SEGUNDOS


def _limpar_tentativas_login(usuario):
    _tentativas_login.pop(usuario, None)


def _segundos_bloqueado(usuario):
    """Quantos segundos ainda faltam de bloqueio pra esse usuário (0 se não
    está bloqueado). Também limpa o estado sozinho quando o bloqueio já
    expirou, pra não deixar entradas velhas acumulando pra sempre."""
    estado = _tentativas_login.get(usuario)
    if not estado or not estado["bloqueado_ate"]:
        return 0
    restante = estado["bloqueado_ate"] - time.monotonic()
    if restante <= 0:
        _limpar_tentativas_login(usuario)
        return 0
    return int(restante) + 1


def _token_da_requisicao():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    return header[len("Bearer "):].strip()


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        token = _token_da_requisicao()
        if not token:
            return jsonify({"erro": "Autenticação necessária"}), 401
        agora = datetime.now()
        with get_conn() as conn:
            sessao = conn.execute(
                "SELECT usuario, criado_em FROM sessoes WHERE token = %s", (token,)
            ).fetchone()
            if not sessao:
                return jsonify({"erro": "Sessão inválida ou expirada"}), 401
            ultimo_uso = datetime.fromisoformat(sessao["criado_em"])
            if agora - ultimo_uso > _SESSAO_EXPIRA_APOS:
                conn.execute("DELETE FROM sessoes WHERE token = %s", (token,))
                return jsonify({"erro": "Sessão inválida ou expirada"}), 401
            if agora - ultimo_uso > _SESSAO_RENOVA_APOS:
                conn.execute(
                    "UPDATE sessoes SET criado_em = %s WHERE token = %s",
                    (agora.isoformat(), token)
                )
        return fn(*args, **kwargs)
    return wrapper


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not data.get("usuario") or not data.get("senha"):
        return jsonify({"erro": "Usuário e senha são obrigatórios"}), 400

    usuario_informado = str(data["usuario"]).strip()

    bloqueado_por = _segundos_bloqueado(usuario_informado)
    if bloqueado_por > 0:
        return jsonify({
            "erro": "Muitas tentativas incorretas. Tente novamente mais tarde.",
            "bloqueado_por_segundos": bloqueado_por,
        }), 429

    with get_conn() as conn:
        row = conn.execute(
            "SELECT usuario, senha_hash FROM usuarios WHERE usuario = %s",
            (usuario_informado,)
        ).fetchone()

        if not row or not check_password_hash(row["senha_hash"], str(data["senha"])):
            _registrar_falha_login(usuario_informado)
            return jsonify({"erro": "Usuário ou senha incorretos"}), 401

        _limpar_tentativas_login(usuario_informado)

        token = uuid.uuid4().hex
        conn.execute(
            "INSERT INTO sessoes (token, usuario, criado_em) VALUES (%s, %s, %s)",
            (token, row["usuario"], datetime.now().isoformat())
        )

    return jsonify({"token": token, "usuario": row["usuario"]})


@auth_bp.route("/logout", methods=["POST"])
def logout():
    token = _token_da_requisicao()
    if token:
        with get_conn() as conn:
            conn.execute("DELETE FROM sessoes WHERE token = %s", (token,))
    return jsonify({"ok": True})
