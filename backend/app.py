from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app) 

pedidos = []  

@app.route("/pedidos", methods=["GET"])
def listar_pedidos():
    return jsonify(pedidos)

# Criar novo pedido
@app.route("/pedidos", methods=["POST"])
def criar_pedido():
    pedido = request.json
    pedidos.append(pedido)
    return jsonify(pedido), 201

# Atualizar status do pedido
@app.route("/pedidos/<int:pedido_id>", methods=["PATCH"])
def atualizar_status(pedido_id):
    pedido = next((p for p in pedidos if p["id"] == pedido_id), None)
    if not pedido:
        return jsonify({"erro": "Pedido não encontrado"}), 404
    pedido["status"] = request.json["status"]
    return jsonify(pedido)

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0")