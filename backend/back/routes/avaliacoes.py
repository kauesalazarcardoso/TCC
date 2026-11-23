from datetime import datetime

from flask import Blueprint, jsonify, request

from database import get_conn
from extensions import limiter
from routes.auth import login_required

avaliacoes_bp = Blueprint('avaliacoes', __name__)


@avaliacoes_bp.route("/avaliacoes/recomendacoes", methods=["POST"])
@limiter.limit("10 per minute")
def avaliar_recomendacoes():
    """Nota (1 a 5) que o cliente dá às sugestões de complementos, pedida na
    tela de acompanhamento logo depois do pedido. Vinculada ao token do
    pedido — só quem fez o pedido tem o token, e cada pedido avalia uma vez."""
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"erro": "Dados inválidos"}), 400

    token = data.get("pedido_token")
    nota = data.get("nota")
    if not isinstance(token, str) or not token:
        return jsonify({"erro": "pedido_token é obrigatório"}), 400
    if isinstance(nota, bool) or not isinstance(nota, int) or not 1 <= nota <= 5:
        return jsonify({"erro": "nota deve ser um inteiro de 1 a 5"}), 400
    usou = data.get("usou_recomendacao") is True

    with get_conn() as conn:
        pedido = conn.execute("SELECT 1 FROM pedidos WHERE token = %s", (token,)).fetchone()
        if not pedido:
            return jsonify({"erro": "Pedido não encontrado"}), 404
        inserida = conn.execute(
            "INSERT INTO avaliacoes_recomendacao (pedido_token, nota, usou_recomendacao, criado_em) "
            "VALUES (%s, %s, %s, %s) ON CONFLICT (pedido_token) DO NOTHING RETURNING id",
            (token, nota, usou, datetime.now().isoformat())
        ).fetchone()
    if not inserida:
        return jsonify({"erro": "Este pedido já foi avaliado"}), 409

    return jsonify({"ok": True}), 201


@avaliacoes_bp.route("/avaliacoes/recomendacoes/resumo", methods=["GET"])
@login_required
def resumo_avaliacoes():
    with get_conn() as conn:
        linhas = conn.execute(
            "SELECT nota, usou_recomendacao, COUNT(*) AS qtd FROM avaliacoes_recomendacao "
            "GROUP BY nota, usou_recomendacao"
        ).fetchall()

    distribuicao = {str(n): 0 for n in range(1, 6)}
    total = soma = total_usou = 0
    for l in linhas:
        distribuicao[str(l["nota"])] += l["qtd"]
        total += l["qtd"]
        soma += l["nota"] * l["qtd"]
        if l["usou_recomendacao"]:
            total_usou += l["qtd"]

    return jsonify({
        "total": total,
        "media": round(soma / total, 2) if total else None,
        "distribuicao": distribuicao,
        "total_que_usou_recomendacao": total_usou,
    })
