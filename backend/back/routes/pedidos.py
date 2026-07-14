from flask import Blueprint, jsonify, request
import json
import time
from datetime import datetime
from database import get_conn

pedidos_bp = Blueprint('pedidos', __name__)

ORDEM_STATUS = ['aguardando', 'confirmado', 'a_caminho', 'entregue']
FORMAS_PAGAMENTO = ('pix', 'cartao')
TAXA_ENTREGA = 3.0

_COLUNAS_PEDIDO = (
    "id, cliente, itens, total, status, hora, forma_pagamento, taxa_entrega, "
    "cartao_ultimos4, cartao_bandeira, pix_txid"
)


def _serializar_pedido(row):
    return {
        "id":              row["id"],
        "cliente":         json.loads(row["cliente"]),
        "itens":           json.loads(row["itens"]),
        "total":           row["total"],
        "status":          row["status"],
        "hora":            row["hora"],
        "forma_pagamento": row["forma_pagamento"],
        "taxa_entrega":    row["taxa_entrega"],
        "cartao_ultimos4": row["cartao_ultimos4"],
        "cartao_bandeira": row["cartao_bandeira"],
        "pix_txid":        row["pix_txid"],
    }


@pedidos_bp.route("/pedidos", methods=["GET"])
def listar_pedidos():
    with get_conn() as conn:
        rows = conn.execute(
            f"SELECT {_COLUNAS_PEDIDO} FROM pedidos ORDER BY id DESC"
        ).fetchall()
    return jsonify([_serializar_pedido(r) for r in rows])


@pedidos_bp.route("/pedidos/<int:pedido_id>", methods=["GET"])
def buscar_pedido(pedido_id):
    with get_conn() as conn:
        row = conn.execute(
            f"SELECT {_COLUNAS_PEDIDO} FROM pedidos WHERE id = ?",
            (pedido_id,)
        ).fetchone()

    if not row:
        return jsonify({"erro": "Pedido não encontrado"}), 404

    return jsonify(_serializar_pedido(row))


@pedidos_bp.route("/pedidos", methods=["POST"])
def criar_pedido():
    data = request.get_json()

    if not data or not all(k in data for k in ("cliente", "itens", "total", "forma_pagamento")):
        return jsonify({"erro": "Dados incompletos"}), 400

    if not isinstance(data["total"], (int, float)):
        return jsonify({"erro": "Campo 'total' deve ser numérico"}), 400

    forma_pagamento = data["forma_pagamento"]
    if forma_pagamento not in FORMAS_PAGAMENTO:
        return jsonify({"erro": "Forma de pagamento inválida"}), 400

    cartao_ultimos4 = None
    cartao_bandeira = None
    pix_txid        = None

    if forma_pagamento == "cartao":
        if not data.get("pagamento_token"):
            return jsonify({"erro": "Token de cartão é obrigatório"}), 400

        with get_conn() as conn:
            cartao = conn.execute(
                "SELECT ultimos4, bandeira FROM cartoes WHERE token = ?",
                (data["pagamento_token"],)
            ).fetchone()

        if not cartao:
            return jsonify({"erro": "Token de cartão inválido"}), 400

        cartao_ultimos4 = cartao["ultimos4"]
        cartao_bandeira = cartao["bandeira"]

    elif forma_pagamento == "pix":
        if not data.get("pagamento_referencia"):
            return jsonify({"erro": "Referência de pagamento Pix é obrigatória"}), 400

        with get_conn() as conn:
            cobranca = conn.execute(
                "SELECT txid FROM pix_cobrancas WHERE txid = ?",
                (data["pagamento_referencia"],)
            ).fetchone()

        if not cobranca:
            return jsonify({"erro": "Referência de pagamento Pix inválida"}), 400

        pix_txid = cobranca["txid"]

    pedido_id = int(time.time() * 1000)
    hora      = datetime.now().strftime("%H:%M")

    with get_conn() as conn:
        conn.execute(
            "INSERT INTO pedidos "
            "(id, cliente, itens, total, status, hora, forma_pagamento, taxa_entrega, "
            "cartao_ultimos4, cartao_bandeira, pix_txid) "
            "VALUES (?, ?, ?, ?, 'aguardando', ?, ?, ?, ?, ?, ?)",
            (
                pedido_id,
                json.dumps(data["cliente"], ensure_ascii=False),
                json.dumps(data["itens"],   ensure_ascii=False),
                data["total"],
                hora,
                forma_pagamento,
                TAXA_ENTREGA,
                cartao_ultimos4,
                cartao_bandeira,
                pix_txid,
            )
        )

    return jsonify({"id": pedido_id, "hora": hora, "status": "aguardando"}), 201


@pedidos_bp.route("/pedidos/<int:pedido_id>/status", methods=["PATCH"])
def avancar_status(pedido_id):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT status FROM pedidos WHERE id = ?", (pedido_id,)
        ).fetchone()

        if not row:
            return jsonify({"erro": "Pedido não encontrado"}), 404

        if row["status"] not in ORDEM_STATUS:
            return jsonify({"erro": "Status inválido no banco"}), 500

        idx = ORDEM_STATUS.index(row["status"])

        if idx >= len(ORDEM_STATUS) - 1:
            return jsonify({"erro": "Pedido já está no status final"}), 400

        novo_status = ORDEM_STATUS[idx + 1]
        conn.execute(
            "UPDATE pedidos SET status = ? WHERE id = ?", (novo_status, pedido_id)
        )

    return jsonify({"id": pedido_id, "status": novo_status})


@pedidos_bp.route("/pedidos/entregues", methods=["DELETE"])
def limpar_entregues():
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM pedidos WHERE status = 'entregue'")
        deletados = cur.rowcount

    return jsonify({"deletados": deletados})
