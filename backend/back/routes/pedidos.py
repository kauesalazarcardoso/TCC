from flask import Blueprint, jsonify, request
import json
import time
from datetime import datetime
from database import get_conn

pedidos_bp = Blueprint('pedidos', __name__)

ORDEM_STATUS = ['aguardando', 'confirmado', 'a_caminho', 'entregue']


@pedidos_bp.route("/pedidos", methods=["GET"])
def listar_pedidos():
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, cliente, itens, total, status, hora FROM pedidos ORDER BY id DESC"
        ).fetchall()
    return jsonify([{
        "id":      r["id"],
        "cliente": json.loads(r["cliente"]),
        "itens":   json.loads(r["itens"]),
        "total":   r["total"],
        "status":  r["status"],
        "hora":    r["hora"],
    } for r in rows])


@pedidos_bp.route("/pedidos/<int:pedido_id>", methods=["GET"])
def buscar_pedido(pedido_id):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id, cliente, itens, total, status, hora FROM pedidos WHERE id = ?",
            (pedido_id,)
        ).fetchone()

    if not row:
        return jsonify({"erro": "Pedido não encontrado"}), 404

    return jsonify({
        "id":      row["id"],
        "cliente": json.loads(row["cliente"]),
        "itens":   json.loads(row["itens"]),
        "total":   row["total"],
        "status":  row["status"],
        "hora":    row["hora"],
    })


@pedidos_bp.route("/pedidos", methods=["POST"])
def criar_pedido():
    data = request.get_json()

    if not data or not all(k in data for k in ("cliente", "itens", "total")):
        return jsonify({"erro": "Dados incompletos"}), 400

    if not isinstance(data["total"], (int, float)):
        return jsonify({"erro": "Campo 'total' deve ser numérico"}), 400

    pedido_id = int(time.time() * 1000)
    hora      = datetime.now().strftime("%H:%M")

    with get_conn() as conn:
        conn.execute(
            "INSERT INTO pedidos (id, cliente, itens, total, status, hora) VALUES (?, ?, ?, ?, 'aguardando', ?)",
            (
                pedido_id,
                json.dumps(data["cliente"], ensure_ascii=False),
                json.dumps(data["itens"],   ensure_ascii=False),
                data["total"],
                hora,
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
