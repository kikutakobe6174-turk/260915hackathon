def test_login_success(client, seed):
    res = client.post("/auth/login", json={"login_id": "op1", "password": "secret123"})
    assert res.status_code == 200
    body = res.json()
    assert body["user"]["role"] == "operator"
    assert body["user"]["id"] == seed["user_id"]


def test_login_failure(client, seed):
    res = client.post("/auth/login", json={"login_id": "op1", "password": "wrong"})
    assert res.status_code == 401
    body = res.json()
    assert body["error"]["code"] == "INVALID_CREDENTIALS"
