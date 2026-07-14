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
        "total": 30.0,
        "forma_pagamento": "pix"
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
        "total": 25,
        "forma_pagamento": "pix"
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
        "total": 20,
        "forma_pagamento": "pix"
    }

    criar = client.post("/pedidos", json=pedido)

    pedido_id = json.loads(criar.data)["id"]

    response = client.get(f"/pedidos/{pedido_id}")

    assert response.status_code == 200

    data = json.loads(response.data)

    assert data["forma_pagamento"] == "pix"
    assert data["taxa_entrega"] == 3.0


def test_criar_pedido_sem_forma_pagamento(client):

    pedido = {
        "cliente": {"nome": "Kauê"},
        "itens": [{"nome": "Açaí", "quantidade": 1}],
        "total": 20
    }

    response = client.post("/pedidos", json=pedido)

    assert response.status_code == 400


def test_criar_pedido_forma_pagamento_invalida(client):

    pedido = {
        "cliente": {"nome": "Kauê"},
        "itens": [{"nome": "Açaí", "quantidade": 1}],
        "total": 20,
        "forma_pagamento": "boleto"
    }

    response = client.post("/pedidos", json=pedido)

    assert response.status_code == 400


def test_criar_pedido_cartao_sem_token(client):

    pedido = {
        "cliente": {"nome": "Kauê"},
        "itens": [{"nome": "Açaí", "quantidade": 1}],
        "total": 20,
        "forma_pagamento": "cartao"
    }

    response = client.post("/pedidos", json=pedido)

    assert response.status_code == 400


def test_tokenizar_cartao_sucesso(client):

    cartao = {
        "nome_titular": "Kauê Salazar",
        "numero": "4111 1111 1111 1111",
        "validade": "12/30",
        "cvv": "123"
    }

    response = client.post("/pagamentos/cartao", json=cartao)

    assert response.status_code == 201

    data = json.loads(response.data)

    assert data["token"].startswith("tok_")
    assert data["ultimos4"] == "1111"
    assert data["bandeira"] == "Visa"
    assert "numero" not in data
    assert "cvv" not in data


def test_tokenizar_cartao_dados_invalidos(client):

    cartao = {
        "nome_titular": "Kauê Salazar",
        "numero": "123",
        "validade": "12/30",
        "cvv": "123"
    }

    response = client.post("/pagamentos/cartao", json=cartao)

    assert response.status_code == 400


def test_criar_pedido_com_cartao_fluxo_completo(client):

    cartao = {
        "nome_titular": "Kauê Salazar",
        "numero": "5500 0000 0000 0004",
        "validade": "12/30",
        "cvv": "123"
    }

    resp_cartao = client.post("/pagamentos/cartao", json=cartao)
    token = json.loads(resp_cartao.data)["token"]

    pedido = {
        "cliente": {"nome": "Kauê"},
        "itens": [{"nome": "Açaí", "quantidade": 1}],
        "total": 20,
        "forma_pagamento": "cartao",
        "pagamento_token": token
    }

    criar = client.post("/pedidos", json=pedido)
    assert criar.status_code == 201

    pedido_id = json.loads(criar.data)["id"]

    response = client.get(f"/pedidos/{pedido_id}")
    data = json.loads(response.data)

    assert data["forma_pagamento"] == "cartao"
    assert data["cartao_ultimos4"] == "0004"
    assert data["cartao_bandeira"] == "Mastercard"
