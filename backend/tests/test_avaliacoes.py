import json


def _criar_pedido(client):
    resp = client.post("/pedidos", json={
        "cliente": {"nome": "Kauê"},
        "itens": [{"nome": "Açaí", "quantidade": 1}],
        "bairro": "Centro",
        "total": 20.0,
        "forma_pagamento": "dinheiro",
    })
    assert resp.status_code == 201
    return json.loads(resp.data)["token"]


def _avaliar(client, **dados):
    return client.post("/avaliacoes/recomendacoes", json=dados)


def test_avaliar_recomendacoes_sucesso(client):
    token = _criar_pedido(client)

    resp = _avaliar(client, pedido_token=token, nota=5, usou_recomendacao=True)

    assert resp.status_code == 201


def test_avaliar_mesmo_pedido_duas_vezes_falha(client):
    token = _criar_pedido(client)
    _avaliar(client, pedido_token=token, nota=4)

    resp = _avaliar(client, pedido_token=token, nota=1)

    assert resp.status_code == 409


def test_avaliar_pedido_inexistente_falha(client):
    resp = _avaliar(client, pedido_token="token-que-nao-existe", nota=5)

    assert resp.status_code == 404


def test_avaliar_nota_invalida_falha(client):
    token = _criar_pedido(client)

    for nota in (0, 6, 3.5, "5", True, None):
        resp = _avaliar(client, pedido_token=token, nota=nota)
        assert resp.status_code == 400, nota


def test_avaliar_sem_token_falha(client):
    assert _avaliar(client, nota=5).status_code == 400


def test_avaliar_sem_json_falha(client):
    resp = client.post("/avaliacoes/recomendacoes", data="nota=5", content_type="text/plain")

    assert resp.status_code == 400


def test_resumo_exige_login(client):
    assert client.get("/avaliacoes/recomendacoes/resumo").status_code == 401


def test_resumo_calcula_media_e_distribuicao(client, auth_headers):
    _avaliar(client, pedido_token=_criar_pedido(client), nota=5, usou_recomendacao=True)
    _avaliar(client, pedido_token=_criar_pedido(client), nota=4, usou_recomendacao=True)
    _avaliar(client, pedido_token=_criar_pedido(client), nota=3)

    data = json.loads(client.get("/avaliacoes/recomendacoes/resumo", headers=auth_headers).data)

    assert data["total"] == 3
    assert data["media"] == 4.0
    assert data["distribuicao"] == {"1": 0, "2": 0, "3": 1, "4": 1, "5": 1}
    assert data["total_que_usou_recomendacao"] == 2


def test_resumo_sem_avaliacoes(client, auth_headers):
    data = json.loads(client.get("/avaliacoes/recomendacoes/resumo", headers=auth_headers).data)

    assert data["total"] == 0
    assert data["media"] is None
