import json
import pytest


def test_criar_pedido(client):

    pedido = {
        "cliente": {
            "nome": "Kauê"
        },
        "itens": [
            {
                "nome": "Açaí",
                "quantidade": 1
            }
        ],
        "total": 30.0
    }

    response = client.post(
        "/pedidos",
        json=pedido
    )

    assert response.status_code == 201

    data = json.loads(response.data)

    assert data["status"] == "aguardando"


def test_listar_pedidos(client):

    response = client.get("/pedidos")

    assert response.status_code == 200

    data = json.loads(response.data)

    assert isinstance(data, list)


def test_avancar_status(client):

    pedido = {
        "cliente": {
            "nome": "Teste"
        },
        "itens": [
            {
                "nome": "Açaí",
                "quantidade": 1
            }
        ],
        "total": 25
    }

    criar = client.post(
        "/pedidos",
        json=pedido
    )

    pedido_data = json.loads(criar.data)

    pedido_id = pedido_data["id"]

    response = client.patch(
        f"/pedidos/{pedido_id}/status"
    )

    assert response.status_code == 200

    data = json.loads(response.data)

    assert data["status"] == "confirmado"


def test_limpar_entregues(client):

    response = client.delete("/pedidos/entregues")

    assert response.status_code == 200


def test_buscar_pedido_por_id(client):

    pedido = {
        "cliente": {"nome": "Kauê"},
        "itens": [{"nome": "Açaí", "quantidade": 1}],
        "total": 20
    }

    criar = client.post("/pedidos", json=pedido)

    pedido_id = json.loads(criar.data)["id"]

    response = client.get(f"/pedidos/{pedido_id}")

    assert response.status_code == 200
