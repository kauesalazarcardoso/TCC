import os

from flask import Flask, jsonify
from flask_cors import CORS
from database import init_db
from routes.pedidos import pedidos_bp
from routes.cardapio import cardapio_bp
from routes.pagamentos import pagamentos_bp
from routes.auth import auth_bp

app = Flask(__name__)
CORS(app)

app.register_blueprint(pedidos_bp)
app.register_blueprint(cardapio_bp)
app.register_blueprint(pagamentos_bp)
app.register_blueprint(auth_bp)
init_db()


@app.route("/", methods=["GET"])
def health():
    return jsonify({"status": "ok", "mensagem": "Backend Açaí Express rodando!"})


@app.route("/config", methods=["GET"])
def config():
    return jsonify({"mp_public_key": os.environ.get("MP_PUBLIC_KEY", "")})


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
