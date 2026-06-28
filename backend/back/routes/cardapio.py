from flask import Blueprint, jsonify, request
from database import get_conn

cardapio_bp = Blueprint('cardapio', __name__)


@cardapio_bp.route("/cardapio", methods=["GET"])
def listar_cardapio():
    with get_conn() as conn:
        rows = conn.execute("SELECT id, nome, preco FROM cardapio ORDER BY id").fetchall()
    return jsonify([{"id": r["id"], "nome": r["nome"], "preco": r["preco"]} for r in rows])


@cardapio_bp.route("/cardapio", methods=["POST"])
def criar_item():
    data = request.get_json()
    if not data or not all(k in data for k in ("nome", "preco")):
        return jsonify({"erro": "Campos 'nome' e 'preco' são obrigatórios"}), 400
    if not isinstance(data["preco"], (int, float)) or data["preco"] <= 0:
        return jsonify({"erro": "Preço inválido"}), 400
    nome = str(data["nome"]).strip()
    if not nome:
        return jsonify({"erro": "Nome não pode ser vazio"}), 400
    with get_conn() as conn:
        cur = conn.execute("INSERT INTO cardapio (nome, preco) VALUES (?, ?)", (nome, data["preco"]))
        item_id = cur.lastrowid
    return jsonify({"id": item_id, "nome": nome, "preco": data["preco"]}), 201


@cardapio_bp.route("/cardapio/<int:item_id>", methods=["PUT"])
def editar_item(item_id):
    data = request.get_json()
    if not data or not all(k in data for k in ("nome", "preco")):
        return jsonify({"erro": "Campos 'nome' e 'preco' são obrigatórios"}), 400
    if not isinstance(data["preco"], (int, float)) or data["preco"] <= 0:
        return jsonify({"erro": "Preço inválido"}), 400
    nome = str(data["nome"]).strip()
    if not nome:
        return jsonify({"erro": "Nome não pode ser vazio"}), 400
    with get_conn() as conn:
        cur = conn.execute(
            "UPDATE cardapio SET nome = ?, preco = ? WHERE id = ?",
            (nome, data["preco"], item_id)
        )
        if cur.rowcount == 0:
            return jsonify({"erro": "Item não encontrado"}), 404
    return jsonify({"id": item_id, "nome": nome, "preco": data["preco"]})


@cardapio_bp.route("/cardapio/<int:item_id>", methods=["DELETE"])
def remover_item(item_id):
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM cardapio WHERE id = ?", (item_id,))
        if cur.rowcount == 0:
            return jsonify({"erro": "Item não encontrado"}), 404
    return jsonify({"deletado": item_id})


@cardapio_bp.route("/complementos", methods=["GET"])
def listar_complementos():
    with get_conn() as conn:
        rows = conn.execute("SELECT id, nome FROM complementos ORDER BY id").fetchall()
    return jsonify([{"id": r["id"], "nome": r["nome"]} for r in rows])


@cardapio_bp.route("/complementos", methods=["POST"])
def criar_complemento():
    data = request.get_json()
    if not data or not data.get("nome", "").strip():
        return jsonify({"erro": "Campo 'nome' é obrigatório"}), 400
    nome = data["nome"].strip()
    try:
        with get_conn() as conn:
            cur = conn.execute("INSERT INTO complementos (nome) VALUES (?)", (nome,))
            return jsonify({"id": cur.lastrowid, "nome": nome}), 201
    except Exception:
        return jsonify({"erro": "Complemento já existe"}), 409


@cardapio_bp.route("/complementos/<int:comp_id>", methods=["DELETE"])
def remover_complemento(comp_id):
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM complementos WHERE id = ?", (comp_id,))
        if cur.rowcount == 0:
            return jsonify({"erro": "Complemento não encontrado"}), 404
    return jsonify({"deletado": comp_id})
