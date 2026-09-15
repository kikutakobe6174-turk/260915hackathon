from app import models


def _add_trend_item(db, seed, question_no, difficulty, points=5):
    item = models.TrendItem(
        test_id=seed["test_id"],
        unit_id=seed["unit_a_id"],
        format_id=seed["format_id"],
        question_no=question_no,
        points=points,
        difficulty=difficulty,
        source="manual",
        reviewed=True,
    )
    db.add(item)
    db.commit()


def _confirm_prerequisite(db, seed):
    db.add(
        models.Prerequisite(
            unit_id=seed["unit_a_id"],
            prerequisite_unit_id=seed["unit_b_id"],
            source="manual",
            confirmed=True,
        )
    )
    db.commit()


def _valid_llm_item(i: int) -> dict:
    return {
        "body": f"問題{i}",
        "answer": f"答え{i}",
        "explanation": f"解説{i}",
        "hints": [
            {"step": 1, "body": "ヒント1"},
            {"step": 2, "body": "ヒント2"},
            {"step": 3, "body": "ヒント3"},
        ],
    }


def test_trend_problem_draft_happy_path(client, db, seed, gemini_queue):
    _add_trend_item(db, seed, "1(1)", difficulty=1)
    _add_trend_item(db, seed, "1(2)", difficulty=2)
    _confirm_prerequisite(db, seed)

    gemini_queue.append([_valid_llm_item(1), _valid_llm_item(2)])

    res = client.post(
        "/llm/trend-problem-draft",
        json={
            "user_id": seed["user_id"],
            "targets": [{"test_id": seed["test_id"], "unit_id": seed["unit_a_id"]}],
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert isinstance(body["job_id"], int)
    assert len(body["drafts"]) == 2
    for draft in body["drafts"]:
        assert draft["test_id"] == seed["test_id"]
        assert draft["unit_id"] == seed["unit_a_id"]
        assert draft["prerequisite_unit_ids"] == [seed["unit_b_id"]]
        assert len(draft["hints"]) == 3
        assert draft["difficulty"] in (1, 2)


def test_trend_problem_draft_discards_incomplete_hints(client, db, seed, gemini_queue):
    _add_trend_item(db, seed, "1(1)", difficulty=1)
    _add_trend_item(db, seed, "1(2)", difficulty=2)

    incomplete = _valid_llm_item(1)
    incomplete["hints"] = incomplete["hints"][:2]  # 2段しかない不正な案
    gemini_queue.append([incomplete, _valid_llm_item(2)])

    res = client.post(
        "/llm/trend-problem-draft",
        json={
            "user_id": seed["user_id"],
            "targets": [{"test_id": seed["test_id"], "unit_id": seed["unit_a_id"]}],
        },
    )
    assert res.status_code == 200
    drafts = res.json()["drafts"]
    assert len(drafts) == 1


def test_trend_problem_draft_no_trend_data(client, seed):
    res = client.post(
        "/llm/trend-problem-draft",
        json={
            "user_id": seed["user_id"],
            "targets": [{"test_id": seed["test_id"], "unit_id": seed["unit_b_id"]}],
        },
    )
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "NO_TREND_DATA"
