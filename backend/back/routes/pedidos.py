from flask import Blueprint, jsonify, request
import json
import time
from datetime import datetime
from database import get_conn
import mercado_pago

pedidos_bp = Blueprint('pedidos', __name__)

ORDEM_STATUS = ['aguardando', 'confirmado', 'a_caminho', 'entregue']
FORMAS_PAGAMENTO = ('pix', 'cartao')
TAXA_ENTREGA = 3.0
STATUS_PENDENTE_PAGAMENTO = 'pendente_pagamento'

_COLUNAS_PEDIDO = (
    "id, cliente, itens, total, status, hora, forma_pagamento, taxa_entrega, "
    "cartao_ultimos4, cartao_bandeira, mp_order_id, pix_qr_base64, pix_copia_cola"
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
        "pix_qr_base64":   row["pix_qr_base64"],
        "pix_copia_cola":  row["pix_copia_cola"],
    }


def _sincronizar_pagamento_pendente(row):
    """Se o pedido ainda está pendente_pagamento (Pix), consulta a Mercado
    Pago e atualiza o status local caso já tenha sido aprovado."""
    if row["status"] != STATUS_PENDENTE_PAGAMENTO or not row["mp_order_id"]:
        return row

    order = mercado_pago.buscar_order(row["mp_order_id"])
    if not mercado_pago.order_aprovada(order):
        return row

    with get_conn() as conn:
        conn.execute(
            "UPDATE pedidos SET status = 'aguardando' WHERE id = ?", (row["id"],)
        )
        row = conn.execute(
            f"SELECT {_COLUNAS_PEDIDO} FROM pedidos WHERE id = ?", (row["id"],)
        ).fetchone()

    return row


@pedidos_bp.route("/pedidos", methods=["GET"])
def listar_pedidos():
    with get_conn() as conn:
        rows = conn.execute(
            f"SELECT {_COLUNAS_PEDIDO} FROM pedidos "
            "WHERE status != ? ORDER BY id DESC",
            (STATUS_PENDENTE_PAGAMENTO,)
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

    row = _sincronizar_pagamento_pendente(row)

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

    if not data.get("mp_order_id"):
        return jsonify({"erro": "mp_order_id é obrigatório"}), 400

    order = mercado_pago.buscar_order(data["mp_order_id"])
    if not order or order.get("status") == "failed":
        return jsonify({"erro": "Cobrança não encontrada ou inválida"}), 400

    cartao_ultimos4 = None
    cartao_bandeira = None
    pix_qr_base64   = None
    pix_copia_cola  = None

    if forma_pagamento == "cartao":
        if not mercado_pago.order_aprovada(order):
            return jsonify({"erro": "Pagamento com cartão ainda não foi aprovado"}), 400
        payment_method = order["transactions"]["payments"][0]["payment_method"]
        cartao_bandeira = payment_method.get("id")
        status_pedido = "aguardando"

    else:  # pix
        payment_method = order["transactions"]["payments"][0]["payment_method"]
        pix_qr_base64  = payment_method.get("qr_code_base64")
        pix_copia_cola = payment_method.get("qr_code")
        status_pedido = "aguardando" if mercado_pago.order_aprovada(order) else STATUS_PENDENTE_PAGAMENTO

    pedido_id = int(time.time() * 1000)
    hora      = datetime.now().strftime("%H:%M")

    with get_conn() as conn:
        conn.execute(
            "INSERT INTO pedidos "
            "(id, cliente, itens, total, status, hora, forma_pagamento, taxa_entrega, "
            "cartao_ultimos4, cartao_bandeira, mp_order_id, pix_qr_base64, pix_copia_cola) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                pedido_id,
                json.dumps(data["cliente"], ensure_ascii=False),
                json.dumps(data["itens"],   ensure_ascii=False),
                data["total"],
                status_pedido,
                hora,
                forma_pagamento,
                TAXA_ENTREGA,
                cartao_ultimos4,
                cartao_bandeira,
                data["mp_order_id"],
                pix_qr_base64,
                pix_copia_cola,
            )
        )

    return jsonify({"id": pedido_id, "hora": hora, "status": status_pedido}), 201


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
