def test_trends_put_get_roundtrip(client, seed):
    test_id = seed["test_id"]
    payload = {
        "user_id": seed["user_id"],
        "items": [
            {
                "unit_id": seed["unit_a_id"],
                "format_id": seed["format_id"],
                "question_no": "1(1)",
                "points": 5,
                "difficulty": 1,
                "source": "manual",
            },
            {
                "unit_id": seed["unit_a_id"],
                "format_id": seed["format_id"],
                "question_no": "1(2)",
                "points": 10,
                "difficulty": 2,
                "source": "manual",
            },
        ],
    }
    put_res = client.put(f"/tests/{test_id}/trends", json=payload)
    assert put_res.status_code == 200
    put_body = put_res.json()
    assert len(put_body["items"]) == 2
    # PUT時点で確認済み(reviewed)扱いになる
    assert all(item["reviewed"] for item in put_body["items"])
    assert len(put_body["summary"]) == 1
    assert put_body["summary"][0]["unit_id"] == seed["unit_a_id"]
    assert put_body["summary"][0]["question_count"] == 2

    get_res = client.get(f"/tests/{test_id}/trends")
    assert get_res.status_code == 200
    get_body = get_res.json()
    assert len(get_body["items"]) == 2
    assert {i["question_no"] for i in get_body["items"]} == {"1(1)", "1(2)"}


def test_trends_get_unknown_test_404(client, seed):
    res = client.get("/tests/999999/trends")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "NOT_FOUND"
