import json
import pytest

import mercado_pago


def _fake_order(id_, status, status_detail, payment_method=None, valor=20.0):
    return {
        "id": id_,
        "status": status,
        "status_detail": status_detail,
        "total_amount": f"{valor:.2f}",
        "transactions": {
            "payments": [
                {
                    "id": "PAY_FAKE",
                    "status": status,
                    "status_detail": status_detail,
                    "payment_method": payment_method or {},
                }
            ]
        },
    }


def _mockar_pix_pendente(monkeypatch, order_id="ORDTST_PIX_PENDENTE", valor=20.0):
    order = _fake_order(
        order_id, "action_required", "waiting_transfer",
        payment_method={"id": "pix", "type": "bank_transfer",
                         "qr_code": "00020126...copia-cola-fake...6304ABCD",
                         "qr_code_base64": "iVBORw0KGgo="},
        valor=valor
    )
    monkeypatch.setattr(mercado_pago, "criar_order_pix", lambda *a, **k: order)
    monkeypatch.setattr(mercado_pago, "buscar_order", lambda mp_order_id: order)
    return order


def _mockar_pix_aprovado(monkeypatch, order_id="ORDTST_PIX_APROVADO", valor=20.0):
    order = _fake_order(
        order_id, "processed", "accredited",
        payment_method={"id": "pix", "type": "bank_transfer",
                         "qr_code": "00020126...copia-cola-fake...6304ABCD",
                         "qr_code_base64": "iVBORw0KGgo="},
        valor=valor
    )
    monkeypatch.setattr(mercado_pago, "criar_order_pix", lambda *a, **k: order)
    monkeypatch.setattr(mercado_pago, "buscar_order", lambda mp_order_id: order)
    return order


def _mockar_cartao_aprovado(monkeypatch, order_id="ORDTST_CARTAO_APROVADO", valor=20.0):
    order = _fake_order(
        order_id, "processed", "accredited",
        payment_method={"id": "visa", "type": "credit_card"},
        valor=valor
    )
    monkeypatch.setattr(mercado_pago, "criar_order_cartao", lambda *a, **k: order)
    monkeypatch.setattr(mercado_pago, "buscar_order", lambda mp_order_id: order)
    return order


def _mockar_cartao_recusado(monkeypatch, valor=20.0):
    order = _fake_order(
        "ORDTST_CARTAO_RECUSADO", "failed", "failed",
        payment_method={"id": "visa", "type": "credit_card"},
        valor=valor
    )
    order["transactions"]["payments"][0]["status_detail"] = "rejected_by_issuer"
    monkeypatch.setattr(mercado_pago, "criar_order_cartao", lambda *a, **k: order)
    return order


def _criar_pedido_pix_aprovado(client, monkeypatch, valor=20.0):
    _mockar_pix_aprovado(monkeypatch, valor=valor)
    resp_pix = client.post("/pagamentos/pix", json={"valor": valor, "email": "comprador@testuser.com"})
    mp_order_id = json.loads(resp_pix.data)["mp_order_id"]

    pedido = {
        "cliente": {"nome": "Kauê"},
        "itens": [{"nome": "Açaí", "quantidade": 1}],
        "total": valor,
        "forma_pagamento": "pix",
        "mp_order_id": mp_order_id
    }
    return client.post("/pedidos", json=pedido)


def test_criar_pedido(client, monkeypatch):
    response = _criar_pedido_pix_aprovado(client, monkeypatch, valor=30.0)

    assert response.status_code == 201

    data = json.loads(response.data)

    assert data["status"] == "aguardando"


def test_listar_pedidos(client, monkeypatch):
    _criar_pedido_pix_aprovado(client, monkeypatch, valor=15.0)

    response = client.get("/pedidos")

    assert response.status_code == 200

    data = json.loads(response.data)

    assert isinstance(data, list)


def test_avancar_status(client, monkeypatch):
    criar = _criar_pedido_pix_aprovado(client, monkeypatch, valor=25.0)
    pedido_id = json.loads(criar.data)["id"]

    response = client.patch(f"/pedidos/{pedido_id}/status")

    assert response.status_code == 200

    data = json.loads(response.data)

    assert data["status"] == "confirmado"


def test_limpar_entregues(client):

    response = client.delete("/pedidos/entregues")

    assert response.status_code == 200


def test_buscar_pedido_por_id(client, monkeypatch):
    criar = _criar_pedido_pix_aprovado(client, monkeypatch, valor=20.0)
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


def test_criar_pedido_sem_mp_order_id(client):

    pedido = {
        "cliente": {"nome": "Kauê"},
        "itens": [{"nome": "Açaí", "quantidade": 1}],
        "total": 20,
        "forma_pagamento": "pix"
    }

    response = client.post("/pedidos", json=pedido)

    assert response.status_code == 400


def test_criar_pedido_mp_order_id_invalido(client, monkeypatch):
    monkeypatch.setattr(mercado_pago, "buscar_order",
                         lambda mp_order_id: _fake_order(mp_order_id, "failed", "failed"))

    pedido = {
        "cliente": {"nome": "Kauê"},
        "itens": [{"nome": "Açaí", "quantidade": 1}],
        "total": 20,
        "forma_pagamento": "pix",
        "mp_order_id": "ORDTST_INEXISTENTE"
    }

    response = client.post("/pedidos", json=pedido)

    assert response.status_code == 400


def test_gerar_pix_sucesso(client, monkeypatch):
    _mockar_pix_pendente(monkeypatch, valor=21.0)

    response = client.post("/pagamentos/pix", json={"valor": 21.0, "email": "comprador@testuser.com"})

    assert response.status_code == 201

    data = json.loads(response.data)

    assert data["mp_order_id"] == "ORDTST_PIX_PENDENTE"
    assert data["qr_code_base64"]
    assert data["qr_code"]


def test_gerar_pix_valor_invalido(client):

    response = client.post("/pagamentos/pix", json={"valor": -5, "email": "comprador@testuser.com"})

    assert response.status_code == 400


def test_gerar_pix_sem_email(client):

    response = client.post("/pagamentos/pix", json={"valor": 20})

    assert response.status_code == 400


def test_criar_pedido_pix_pendente_nao_aparece_em_listar(client, monkeypatch):
    _mockar_pix_pendente(monkeypatch, valor=20.0)

    resp_pix = client.post("/pagamentos/pix", json={"valor": 20.0, "email": "comprador@testuser.com"})
    mp_order_id = json.loads(resp_pix.data)["mp_order_id"]

    pedido = {
        "cliente": {"nome": "Kauê"},
        "itens": [{"nome": "Açaí", "quantidade": 1}],
        "total": 20.0,
        "forma_pagamento": "pix",
        "mp_order_id": mp_order_id
    }
    criar = client.post("/pedidos", json=pedido)
    assert criar.status_code == 201

    dados_criacao = json.loads(criar.data)
    assert dados_criacao["status"] == "pendente_pagamento"

    pedido_id = dados_criacao["id"]

    listagem = client.get("/pedidos")
    ids_listados = [p["id"] for p in json.loads(listagem.data)]
    assert pedido_id not in ids_listados

    busca = client.get(f"/pedidos/{pedido_id}")
    dados_busca = json.loads(busca.data)
    assert dados_busca["status"] == "pendente_pagamento"
    assert dados_busca["pix_qr_base64"]
    assert dados_busca["pix_copia_cola"]


def test_pedido_pix_atualiza_status_quando_pagamento_confirma(client, monkeypatch):
    _mockar_pix_pendente(monkeypatch, order_id="ORDTST_PIX_CONFIRMA", valor=20.0)

    resp_pix = client.post("/pagamentos/pix", json={"valor": 20.0, "email": "comprador@testuser.com"})
    mp_order_id = json.loads(resp_pix.data)["mp_order_id"]

    pedido = {
        "cliente": {"nome": "Kauê"},
        "itens": [{"nome": "Açaí", "quantidade": 1}],
        "total": 20.0,
        "forma_pagamento": "pix",
        "mp_order_id": mp_order_id
    }
    criar = client.post("/pedidos", json=pedido)
    pedido_id = json.loads(criar.data)["id"]

    # o pagamento agora "cai": a Mercado Pago passa a reportar aprovado
    order_aprovado = _fake_order(mp_order_id, "processed", "accredited")
    monkeypatch.setattr(mercado_pago, "buscar_order", lambda oid: order_aprovado)

    busca = client.get(f"/pedidos/{pedido_id}")
    dados = json.loads(busca.data)
    assert dados["status"] == "aguardando"

    listagem = client.get("/pedidos")
    ids_listados = [p["id"] for p in json.loads(listagem.data)]
    assert pedido_id in ids_listados


def test_processar_cartao_aprovado(client, monkeypatch):
    _mockar_cartao_aprovado(monkeypatch, valor=20.0)

    response = client.post("/pagamentos/cartao", json={
        "valor": 20.0, "email": "comprador@testuser.com",
        "token": "tok_fake", "payment_method_id": "visa", "installments": 1
    })

    assert response.status_code == 201

    data = json.loads(response.data)

    assert data["aprovado"] is True
    assert data["mp_order_id"] == "ORDTST_CARTAO_APROVADO"


def test_processar_cartao_recusado(client, monkeypatch):
    _mockar_cartao_recusado(monkeypatch, valor=20.0)

    response = client.post("/pagamentos/cartao", json={
        "valor": 20.0, "email": "comprador@testuser.com",
        "token": "tok_fake", "payment_method_id": "visa", "installments": 1
    })

    assert response.status_code == 400

    data = json.loads(response.data)

    assert data["aprovado"] is False


def test_processar_cartao_dados_incompletos(client):

    response = client.post("/pagamentos/cartao", json={"valor": 20.0, "email": "comprador@testuser.com"})

    assert response.status_code == 400


def test_criar_pedido_com_cartao_fluxo_completo(client, monkeypatch):
    _mockar_cartao_aprovado(monkeypatch, order_id="ORDTST_CARTAO_FLUXO", valor=20.0)

    resp_cartao = client.post("/pagamentos/cartao", json={
        "valor": 20.0, "email": "comprador@testuser.com",
        "token": "tok_fake", "payment_method_id": "visa", "installments": 1
    })
    mp_order_id = json.loads(resp_cartao.data)["mp_order_id"]

    pedido = {
        "cliente": {"nome": "Kauê"},
        "itens": [{"nome": "Açaí", "quantidade": 1}],
        "total": 20,
        "forma_pagamento": "cartao",
        "mp_order_id": mp_order_id
    }

    criar = client.post("/pedidos", json=pedido)
    assert criar.status_code == 201

    pedido_id = json.loads(criar.data)["id"]

    response = client.get(f"/pedidos/{pedido_id}")
    data = json.loads(response.data)

    assert data["forma_pagamento"] == "cartao"
    assert data["status"] == "aguardando"
    assert data["cartao_bandeira"] == "visa"


def test_criar_pedido_cartao_nao_aprovado(client, monkeypatch):
    order_pendente = _fake_order(
        "ORDTST_CARTAO_PENDENTE", "action_required", "pending_review",
        payment_method={"id": "visa", "type": "credit_card"}
    )
    monkeypatch.setattr(mercado_pago, "buscar_order", lambda oid: order_pendente)

    pedido = {
        "cliente": {"nome": "Kauê"},
        "itens": [{"nome": "Açaí", "quantidade": 1}],
        "total": 20,
        "forma_pagamento": "cartao",
        "mp_order_id": "ORDTST_CARTAO_PENDENTE"
    }

    response = client.post("/pedidos", json=pedido)

    assert response.status_code == 400
