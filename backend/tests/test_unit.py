import json
import pytest

import mercado_pago


def test_payer_sem_nome():
    assert mercado_pago._payer("cliente@teste.com") == {"email": "cliente@teste.com"}


def test_payer_com_nome_completo():
    payer = mercado_pago._payer("cliente@teste.com", "João Silva")
    assert payer == {"email": "cliente@teste.com", "first_name": "João", "last_name": "Silva"}


def test_payer_com_nome_unico():
    payer = mercado_pago._payer("cliente@teste.com", "APRO")
    assert payer == {"email": "cliente@teste.com", "first_name": "APRO"}


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


def test_lista_pedidos_retorna_json(client, auth_headers):

    response = client.get("/pedidos", headers=auth_headers)

    assert response.content_type == "application/json"
