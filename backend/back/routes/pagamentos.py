import re
import secrets
from datetime import datetime

from flask import Blueprint, jsonify, request

from database import get_conn

pagamentos_bp = Blueprint('pagamentos', __name__)

VALIDADE_REGEX = re.compile(r"^(0[1-9]|1[0-2])/(\d{2})$")

PIX_CHAVE  = "acaiexpress@example.com"
PIX_NOME   = "ACAI EXPRESS"
PIX_CIDADE = "ROLANTE"


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


def _crc16(payload):
    crc = 0xFFFF
    for byte in payload.encode("utf-8"):
        crc ^= byte << 8
        for _ in range(8):
            if crc & 0x8000:
                crc = ((crc << 1) ^ 0x1021) & 0xFFFF
            else:
                crc = (crc << 1) & 0xFFFF
    return format(crc, "04X")


def _tlv(id_, valor):
    return f"{id_}{len(valor):02d}{valor}"


def _gerar_payload_pix(valor, txid):
    merchant_account = _tlv("00", "br.gov.bcb.pix") + _tlv("01", PIX_CHAVE)
    additional_data  = _tlv("05", txid)

    payload = (
        _tlv("00", "01") +
        _tlv("26", merchant_account) +
        _tlv("52", "0000") +
        _tlv("53", "986") +
        _tlv("54", f"{valor:.2f}") +
        _tlv("58", "BR") +
        _tlv("59", PIX_NOME) +
        _tlv("60", PIX_CIDADE) +
        _tlv("62", additional_data)
    )

    payload_sem_crc = payload + "6304"
    return payload_sem_crc + _crc16(payload_sem_crc)


@pagamentos_bp.route("/pagamentos/pix", methods=["POST"])
def gerar_cobranca_pix():
    data = request.get_json()

    if not data or "valor" not in data:
        return jsonify({"erro": "Campo 'valor' é obrigatório"}), 400

    valor = data["valor"]
    if not isinstance(valor, (int, float)) or valor <= 0:
        return jsonify({"erro": "Valor inválido"}), 400

    txid = "PIX" + secrets.token_hex(4).upper()
    copia_cola = _gerar_payload_pix(valor, txid)
    criado_em = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    with get_conn() as conn:
        conn.execute(
            "INSERT INTO pix_cobrancas (txid, valor, copia_cola, criado_em) VALUES (?, ?, ?, ?)",
            (txid, valor, copia_cola, criado_em)
        )

    return jsonify({"txid": txid, "copia_cola": copia_cola}), 201
