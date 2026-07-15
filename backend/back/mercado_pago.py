import os
import time
import uuid

import requests

API_BASE = "https://api.mercadopago.com/v1"

# A Mercado Pago às vezes leva alguns segundos para gerar o QR Code do Pix
# depois de criar a order (fica em status "processing"/"in_process" até lá).
_PIX_QR_TENTATIVAS = 10
_PIX_QR_INTERVALO_SEGUNDOS = 2


def _access_token():
    return os.environ["MP_ACCESS_TOKEN"]


def _headers():
    return {
        "Authorization": f"Bearer {_access_token()}",
        "Content-Type": "application/json",
        "X-Idempotency-Key": str(uuid.uuid4()),
    }


def _normalizar(resp_json):
    return resp_json.get("data", resp_json)


def criar_order_pix(valor, email, external_reference):
    body = {
        "type": "online",
        "processing_mode": "automatic",
        "total_amount": f"{valor:.2f}",
        "external_reference": external_reference,
        "payer": {"email": email},
        "transactions": {
            "payments": [
                {
                    "amount": f"{valor:.2f}",
                    "payment_method": {"id": "pix", "type": "bank_transfer"},
                }
            ]
        },
    }
    resp = requests.post(f"{API_BASE}/orders", json=body, headers=_headers(), timeout=15)
    order = _normalizar(resp.json())

    for _ in range(_PIX_QR_TENTATIVAS):
        if "errors" in order or "transactions" not in order:
            break
        payment_method = order["transactions"]["payments"][0].get("payment_method", {})
        if payment_method.get("qr_code"):
            break
        time.sleep(_PIX_QR_INTERVALO_SEGUNDOS)
        order = buscar_order(order["id"])

    return order


def criar_order_cartao(valor, email, token, payment_method_id, installments, external_reference):
    body = {
        "type": "online",
        "processing_mode": "automatic",
        "total_amount": f"{valor:.2f}",
        "external_reference": external_reference,
        "payer": {"email": email},
        "transactions": {
            "payments": [
                {
                    "amount": f"{valor:.2f}",
                    "payment_method": {
                        "id": payment_method_id,
                        "type": "credit_card",
                        "token": token,
                        "installments": installments,
                    },
                }
            ]
        },
    }
    resp = requests.post(f"{API_BASE}/orders", json=body, headers=_headers(), timeout=15)
    return _normalizar(resp.json())


def buscar_order(mp_order_id):
    resp = requests.get(
        f"{API_BASE}/orders/{mp_order_id}",
        headers={"Authorization": f"Bearer {_access_token()}"},
        timeout=15,
    )
    return _normalizar(resp.json())


def order_aprovada(order):
    return order.get("status") == "processed" and order.get("status_detail") == "accredited"


def order_pix_pendente(order):
    return order.get("status") == "action_required"
