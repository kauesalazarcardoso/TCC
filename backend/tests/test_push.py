import hashlib

import push

ENDPOINT_CHROME = "https://fcm.googleapis.com/fcm/send/abc123"
ENDPOINT_EDGE = "https://wns2-par02p.notify.windows.com/w/?token=xyz"


def _inscrever(client, auth_headers, endpoint=ENDPOINT_CHROME, nome=None):
    corpo = {"endpoint": endpoint, "keys": {"p256dh": "chave", "auth": "segredo"}}
    if nome is not None:
        corpo["nome"] = nome
    return client.post("/push/subscribe", json=corpo, headers=auth_headers)


def _listar(client, auth_headers):
    resp = client.get("/push/dispositivos", headers=auth_headers)
    assert resp.status_code == 200
    return resp.get_json()


def test_listar_exige_login(client):
    assert client.get("/push/dispositivos").status_code == 401


def test_listar_dispositivos_com_nome_e_navegador(client, auth_headers):
    _inscrever(client, auth_headers, ENDPOINT_CHROME, nome="  PC da loja  ")
    _inscrever(client, auth_headers, ENDPOINT_EDGE)

    lista = _listar(client, auth_headers)

    assert [d["nome"] for d in lista] == ["PC da loja", None]
    assert [d["navegador"] for d in lista] == ["Chrome (PC ou Android)", "Edge (Windows)"]
    esperado = hashlib.sha256(ENDPOINT_CHROME.encode()).hexdigest()[:16]
    assert lista[0]["aparelho_id"] == esperado
    # O endpoint funciona como credencial de envio: não pode vazar na listagem.
    assert all("endpoint" not in d for d in lista)


def test_reinscrever_atualiza_nome_sem_duplicar(client, auth_headers):
    _inscrever(client, auth_headers, nome="Celular")
    _inscrever(client, auth_headers, nome="Celular do Kauê")
    _inscrever(client, auth_headers)  # sem nome: mantém o anterior

    lista = _listar(client, auth_headers)

    assert len(lista) == 1
    assert lista[0]["nome"] == "Celular do Kauê"


def test_renomear_dispositivo(client, auth_headers):
    _inscrever(client, auth_headers)
    sub_id = _listar(client, auth_headers)[0]["id"]

    resp = client.patch(f"/push/dispositivos/{sub_id}", json={"nome": "Tablet"}, headers=auth_headers)

    assert resp.status_code == 200
    assert _listar(client, auth_headers)[0]["nome"] == "Tablet"


def test_renomear_com_nome_vazio_falha(client, auth_headers):
    _inscrever(client, auth_headers)
    sub_id = _listar(client, auth_headers)[0]["id"]

    resp = client.patch(f"/push/dispositivos/{sub_id}", json={"nome": "   "}, headers=auth_headers)

    assert resp.status_code == 400


def test_remover_dispositivo(client, auth_headers):
    _inscrever(client, auth_headers)
    sub_id = _listar(client, auth_headers)[0]["id"]

    assert client.delete(f"/push/dispositivos/{sub_id}", headers=auth_headers).status_code == 200
    assert _listar(client, auth_headers) == []
    assert client.delete(f"/push/dispositivos/{sub_id}", headers=auth_headers).status_code == 404


def test_remover_exige_login(client, auth_headers):
    _inscrever(client, auth_headers)
    sub_id = _listar(client, auth_headers)[0]["id"]

    assert client.delete(f"/push/dispositivos/{sub_id}").status_code == 401


def test_testar_dispositivo(client, auth_headers, monkeypatch):
    enviados = []
    monkeypatch.setattr(push, "enviar_teste", lambda sub: enviados.append(sub["endpoint"]) or "ok")
    _inscrever(client, auth_headers)
    sub_id = _listar(client, auth_headers)[0]["id"]

    resp = client.post(f"/push/dispositivos/{sub_id}/teste", headers=auth_headers)

    assert resp.status_code == 200
    assert enviados == [ENDPOINT_CHROME]


def test_testar_dispositivo_expirado(client, auth_headers, monkeypatch):
    monkeypatch.setattr(push, "enviar_teste", lambda sub: "expirada")
    _inscrever(client, auth_headers)
    sub_id = _listar(client, auth_headers)[0]["id"]

    resp = client.post(f"/push/dispositivos/{sub_id}/teste", headers=auth_headers)

    assert resp.status_code == 410


def test_testar_dispositivo_inexistente(client, auth_headers):
    assert client.post("/push/dispositivos/999/teste", headers=auth_headers).status_code == 404


def test_testar_todos_dispositivos(client, auth_headers, monkeypatch):
    resultados = {ENDPOINT_CHROME: "ok", ENDPOINT_EDGE: "expirada"}
    monkeypatch.setattr(push, "enviar_teste", lambda sub: resultados[sub["endpoint"]])
    _inscrever(client, auth_headers, ENDPOINT_CHROME, nome="PC da loja")
    _inscrever(client, auth_headers, ENDPOINT_EDGE)

    resp = client.post("/push/dispositivos/teste", headers=auth_headers)

    assert resp.status_code == 200
    assert [(r["nome"], r["resultado"]) for r in resp.get_json()] == [
        ("PC da loja", "ok"), (None, "expirada"),
    ]


def test_testar_todos_exige_login(client):
    assert client.post("/push/dispositivos/teste").status_code == 401
