from flask import Flask, jsonify, request
from flask_cors import CORS
import sqlite3
import json
import os
import time
from datetime import datetime

app = Flask(__name__)
CORS(app)

DB_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'db', 'pedidos.db')

ORDEM_STATUS = ['aguardando', 'confirmado', 'a_caminho', 'entregue']


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # retorna linhas como dicionário
    return conn


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = get_conn()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS pedidos (
            id      INTEGER PRIMARY KEY,
            cliente TEXT    NOT NULL,
            itens   TEXT    NOT NULL,
            total   REAL    NOT NULL,
            status  TEXT    NOT NULL DEFAULT 'aguardando',
            hora    TEXT    NOT NULL
        )
    """)
    conn.commit()
    conn.close()
    print("✅ Banco SQLite inicializado!")


# ── ROTAS ─────────────────────────────────────────────────────

@app.route("/", methods=["GET"])
def health():
    return jsonify({"status": "ok", "mensagem": "Backend Açaí Express rodando!"})


@app.route("/pedidos", methods=["GET"])
def listar_pedidos():
    conn = get_conn()
    rows = conn.execute(
        "SELECT id, cliente, itens, total, status, hora FROM pedidos ORDER BY id DESC"
    ).fetchall()
    conn.close()
    return jsonify([{
        "id":      r["id"],
        "cliente": json.loads(r["cliente"]),
        "itens":   json.loads(r["itens"]),
        "total":   r["total"],
        "status":  r["status"],
        "hora":    r["hora"],
    } for r in rows])


@app.route("/pedidos/<int:pedido_id>", methods=["GET"])
def buscar_pedido(pedido_id):
    conn = get_conn()
    row  = conn.execute(
        "SELECT id, cliente, itens, total, status, hora FROM pedidos WHERE id = ?",
        (pedido_id,)
    ).fetchone()
    conn.close()

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


@app.route("/pedidos", methods=["POST"])
def criar_pedido():
    data = request.get_json()

    if not data or not all(k in data for k in ("cliente", "itens", "total")):
        return jsonify({"erro": "Dados incompletos"}), 400

    pedido_id = int(time.time() * 1000)
    hora      = datetime.now().strftime("%H:%M")

    conn = get_conn()
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
    conn.commit()
    conn.close()

    return jsonify({"id": pedido_id, "hora": hora, "status": "aguardando"}), 201


@app.route("/pedidos/<int:pedido_id>/status", methods=["PATCH"])
def avancar_status(pedido_id):
    conn = get_conn()
    row  = conn.execute(
        "SELECT status FROM pedidos WHERE id = ?", (pedido_id,)
    ).fetchone()

    if not row:
        conn.close()
        return jsonify({"erro": "Pedido não encontrado"}), 404

    idx = ORDEM_STATUS.index(row["status"])

    if idx >= len(ORDEM_STATUS) - 1:
        conn.close()
        return jsonify({"erro": "Pedido já está no status final"}), 400

    novo_status = ORDEM_STATUS[idx + 1]
    conn.execute(
        "UPDATE pedidos SET status = ? WHERE id = ?", (novo_status, pedido_id)
    )
    conn.commit()
    conn.close()

    return jsonify({"id": pedido_id, "status": novo_status})


@app.route("/pedidos/entregues", methods=["DELETE"])
def limpar_entregues():
    conn = get_conn()
    cur  = conn.execute("DELETE FROM pedidos WHERE status = 'entregue'")
    deletados = cur.rowcount
    conn.commit()
    conn.close()

    return jsonify({"deletados": deletados})


# ── INICIALIZAÇÃO ─────────────────────────────────────────────
if __name__ == "__main__":
    init_db()
    app.run(debug=True, host="0.0.0.0", port=5000)
