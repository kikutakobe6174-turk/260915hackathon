def _problem_payload(seed, **overrides):
    payload = {
        "unit_id": seed["unit_a_id"],
        "format_id": seed["format_id"],
        "difficulty": 1,
        "body": "$1+1=?$",
        "answer": "2",
        "explanation": "足し算",
        "is_return": False,
        "hints": ["ヒント1", "ヒント2", "ヒント3"],
        "prerequisite_unit_ids": [],
    }
    payload.update(overrides)
    return payload


def test_create_then_list_problem(client, seed):
    create_res = client.post("/problems", json=_problem_payload(seed))
    assert create_res.status_code == 200
    created = create_res.json()
    assert created["status"] == "draft"
    assert created["unit_name"] == "単元A"
    assert [h["body"] for h in created["hints"]] == ["ヒント1", "ヒント2", "ヒント3"]

    list_res = client.get("/problems", params={"unit_id": seed["unit_a_id"]})
    assert list_res.status_code == 200
    items = list_res.json()
    assert len(items) == 1
    assert items[0]["id"] == created["id"]


def test_create_problem_requires_three_hints(client, seed):
    res = client.post("/problems", json=_problem_payload(seed, hints=["", "", ""]))
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "INVALID_HINTS"


def test_review_problem(client, seed):
    created = client.post("/problems", json=_problem_payload(seed)).json()
    res = client.post(f"/problems/{created['id']}/review", json={"user_id": seed["user_id"]})
    assert res.status_code == 200
    assert res.json()["status"] == "reviewed"
