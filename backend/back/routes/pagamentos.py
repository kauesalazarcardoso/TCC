import re
import secrets
from datetime import datetime

from flask import Blueprint, jsonify, request

from database import get_conn

pagamentos_bp = Blueprint('pagamentos', __name__)

VALIDADE_REGEX = re.compile(r"^(0[1-9]|1[0-2])/(\d{2})$")


def _detectar_bandeira(numero):
    if numero.startswith("4"):
        return "Visa"
    if numero.startswith("5"):
        return "Mastercard"
    return "Outro"


def _validar_cartao(data):
    if not data or not all(k in data for k in ("nome_titular", "numero", "validade", "cvv")):
        return "Dados do cartão incompletos"

    nome_titular = str(data["nome_titular"]).strip()
    if not nome_titular:
        return "Nome do titular não pode ser vazio"

    numero = re.sub(r"[\s-]", "", str(data["numero"]))
    if not numero.isdigit() or not (13 <= len(numero) <= 19):
        return "Número do cartão inválido"

    validade = str(data["validade"]).strip()
    match = VALIDADE_REGEX.match(validade)
    if not match:
        return "Validade deve estar no formato MM/AA"

    mes, ano = int(match.group(1)), int("20" + match.group(2))
    agora = datetime.now()
    if (ano, mes) < (agora.year, agora.month):
        return "Cartão expirado"

    cvv = str(data["cvv"]).strip()
    if not cvv.isdigit() or not (3 <= len(cvv) <= 4):
        return "CVV inválido"

    return None


@pagamentos_bp.route("/pagamentos/cartao", methods=["POST"])
def tokenizar_cartao():
    data = request.get_json()

    erro = _validar_cartao(data)
    if erro:
        return jsonify({"erro": erro}), 400

    numero = re.sub(r"[\s-]", "", str(data["numero"]))
    nome_titular = str(data["nome_titular"]).strip()
    validade = str(data["validade"]).strip()
    ultimos4 = numero[-4:]
    bandeira = _detectar_bandeira(numero)
    token = "tok_" + secrets.token_hex(8)
    criado_em = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    with get_conn() as conn:
        conn.execute(
            "INSERT INTO cartoes (token, nome_titular, ultimos4, bandeira, validade, criado_em) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (token, nome_titular, ultimos4, bandeira, validade, criado_em)
        )

    return jsonify({"token": token, "ultimos4": ultimos4, "bandeira": bandeira}), 201
