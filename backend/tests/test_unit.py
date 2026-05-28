import sys
import os
import json
import pytest

sys.path.append(
    os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..")
    )
)

from app import app


@pytest.fixture
def client():

    app.config['TESTING'] = True

    with app.test_client() as client:
        yield client


def test_health_check(client):

    response = client.get("/")

    assert response.status_code == 200

    data = json.loads(response.data)

    assert data["status"] == "ok"


def test_rota_inexistente(client):

    response = client.get("/rota-que-nao-existe")

    assert response.status_code == 404


def test_pedido_nao_encontrado(client):

    response = client.get("/pedidos/999999")

    assert response.status_code == 404

    data = json.loads(response.data)

    assert "erro" in data

def test_metodo_invalido(client):

    response = client.post("/")

    assert response.status_code == 405

def test_lista_pedidos_retorna_json(client):

    response = client.get("/pedidos")

    assert response.content_type == "application/json"