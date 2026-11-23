import json
from datetime import datetime, timedelta

import database

from conftest import OWNER_USUARIO_PADRAO, OWNER_SENHA_PADRAO
from routes.auth import _LIMITE_TENTATIVAS


def test_login_sucesso(client):
    response = client.post("/login", json={
        "usuario": OWNER_USUARIO_PADRAO, "senha": OWNER_SENHA_PADRAO
    })

    assert response.status_code == 200

    data = json.loads(response.data)

    assert data["token"]


def test_login_senha_incorreta(client):
    response = client.post("/login", json={
        "usuario": OWNER_USUARIO_PADRAO, "senha": "senha-errada"
    })

    assert response.status_code == 401


def test_login_usuario_inexistente(client):
    response = client.post("/login", json={
        "usuario": "ladrao", "senha": "qualquer"
    })

    assert response.status_code == 401


def test_login_dados_incompletos(client):
    response = client.post("/login", json={"usuario": OWNER_USUARIO_PADRAO})

    assert response.status_code == 400


def test_rota_protegida_sem_token(client):
    response = client.get("/pedidos")

    assert response.status_code == 401


def test_rota_protegida_com_token_invalido(client):
    response = client.get("/pedidos", headers={"Authorization": "Bearer token-invalido"})

    assert response.status_code == 401


def test_rota_protegida_com_token_valido(client, auth_headers):
    response = client.get("/pedidos", headers=auth_headers)

    assert response.status_code == 200


def test_logout_invalida_token(client, auth_headers):
    resp_logout = client.post("/logout", headers=auth_headers)
    assert resp_logout.status_code == 200

    response = client.get("/pedidos", headers=auth_headers)
    assert response.status_code == 401


def test_cardapio_post_exige_login(client):
    response = client.post("/cardapio", json={"nome": "Item Teste", "preco": 10, "categoria": "Cupuaçu"})

    assert response.status_code == 401


def test_cardapio_post_com_login_funciona(client, auth_headers):
    response = client.post(
        "/cardapio", json={"nome": "Item Teste", "preco": 10, "categoria": "Cupuaçu"}, headers=auth_headers
    )

    assert response.status_code == 201


# ── Bloqueio de força bruta no /login ──────────────────────────────

def test_login_bloqueia_apos_muitas_tentativas_erradas(client):
    for _ in range(_LIMITE_TENTATIVAS):
        resp = client.post("/login", json={
            "usuario": OWNER_USUARIO_PADRAO, "senha": "senha-errada"
        })
        assert resp.status_code == 401

    bloqueado = client.post("/login", json={
        "usuario": OWNER_USUARIO_PADRAO, "senha": OWNER_SENHA_PADRAO
    })

    assert bloqueado.status_code == 429
    assert json.loads(bloqueado.data)["bloqueado_por_segundos"] > 0


def test_login_sucesso_reseta_contador_de_tentativas(client):
    for _ in range(_LIMITE_TENTATIVAS - 1):
        resp = client.post("/login", json={
            "usuario": OWNER_USUARIO_PADRAO, "senha": "senha-errada"
        })
        assert resp.status_code == 401

    sucesso = client.post("/login", json={
        "usuario": OWNER_USUARIO_PADRAO, "senha": OWNER_SENHA_PADRAO
    })
    assert sucesso.status_code == 200

    resp = client.post("/login", json={
        "usuario": OWNER_USUARIO_PADRAO, "senha": "senha-errada"
    })
    assert resp.status_code == 401


def test_login_bloqueio_nao_afeta_outros_usuarios(client):
    for _ in range(_LIMITE_TENTATIVAS):
        client.post("/login", json={"usuario": OWNER_USUARIO_PADRAO, "senha": "senha-errada"})

    resp = client.post("/login", json={"usuario": "outro-usuario", "senha": "qualquer"})
    assert resp.status_code == 401


def test_login_sem_json_retorna_400(client):
    response = client.post("/login", data="usuario=admin", content_type="text/plain")

    assert response.status_code == 400


# ── Expiração de sessão ────────────────────────────────────────────

def _envelhecer_sessao(auth_headers, dias):
    token = auth_headers["Authorization"].split(" ", 1)[1]
    with database.get_conn() as conn:
        conn.execute(
            "UPDATE sessoes SET criado_em = %s WHERE token = %s",
            ((datetime.now() - timedelta(days=dias)).isoformat(), token)
        )
    return token


def test_sessao_expira_apos_30_dias_sem_uso(client, auth_headers):
    token = _envelhecer_sessao(auth_headers, dias=31)

    response = client.get("/pedidos", headers=auth_headers)

    assert response.status_code == 401
    with database.get_conn() as conn:
        assert conn.execute("SELECT 1 FROM sessoes WHERE token = %s", (token,)).fetchone() is None


def test_sessao_em_uso_e_renovada_e_nao_expira(client, auth_headers):
    token = _envelhecer_sessao(auth_headers, dias=29)

    assert client.get("/pedidos", headers=auth_headers).status_code == 200

    with database.get_conn() as conn:
        criado_em = conn.execute(
            "SELECT criado_em FROM sessoes WHERE token = %s", (token,)
        ).fetchone()["criado_em"]
    assert datetime.now() - datetime.fromisoformat(criado_em) < timedelta(minutes=1)


def test_sessao_recente_nao_e_regravada_a_cada_requisicao(client, auth_headers):
    token = _envelhecer_sessao(auth_headers, dias=0)
    with database.get_conn() as conn:
        antes = conn.execute("SELECT criado_em FROM sessoes WHERE token = %s", (token,)).fetchone()["criado_em"]

    client.get("/pedidos", headers=auth_headers)

    with database.get_conn() as conn:
        depois = conn.execute("SELECT criado_em FROM sessoes WHERE token = %s", (token,)).fetchone()["criado_em"]
    assert antes == depois
