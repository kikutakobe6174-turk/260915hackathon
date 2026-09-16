"""DEMO_RELAXED_VALIDATION のON/OFF挙動。

ONでもデモが止まらないこと、かつ致命的な壊れ方は従来どおりエラーになることを固定する。
"""
import asyncio

import pytest

from app.providers import GeminiProvider, LLMProviderError

SPECS = [{"unit_id": 204, "format_id": 1, "difficulty": 1, "count": 1}]
UNITS = [{"id": 204, "name": "指数関数・対数関数"}]
FORMATS = [{"id": 1, "name": "計算"}]


def _problem(**overrides):
    problem = {
        "unit_id": 204, "format_id": 1, "difficulty": 1,
        "body": "2^x = 8 を解きなさい。", "answer": "x = 3",
        # 「おっと」は完成稿に現れない独り言なので、厳格モードでは未完成として弾かれる
        "explanation": "8 = 2^3 なので指数を比較します。おっと、書き直します。",
        "hints": ["底をそろえる", "8を累乗で表す", "指数を比較する"],
    }
    problem.update(overrides)
    return problem


class StubProvider(GeminiProvider):
    """常に同じ出力を返す。校閲パスまで含めて3回呼ばれる。"""

    def __init__(self, payload):
        super().__init__(api_key="test-key")
        self.payload = payload
        self.calls = 0

    async def _request(self, parts, schema):
        self.calls += 1
        return self.payload


def _generate(provider):
    return asyncio.run(provider.generate_problems(SPECS, UNITS, FORMATS))


def test_strict_mode_rejects_unfinished_output(monkeypatch):
    monkeypatch.delenv("DEMO_RELAXED_VALIDATION", raising=False)
    provider = StubProvider({"problems": [_problem()]})
    with pytest.raises(LLMProviderError) as excinfo:
        _generate(provider)
    assert excinfo.value.code == "GEMINI_SCHEMA_ERROR"


def test_relaxed_mode_accepts_unfinished_output(monkeypatch):
    monkeypatch.setenv("DEMO_RELAXED_VALIDATION", "true")
    provider = StubProvider({"problems": [_problem()]})
    problems = _generate(provider)
    assert len(problems) == 1
    assert problems[0].answer == "x = 3"
    assert len(problems[0].hints) == 3


def test_relaxed_mode_accepts_count_mismatch(monkeypatch):
    """構成・問題数がずれても止めない（内容が揃っていれば通す）。"""
    monkeypatch.setenv("DEMO_RELAXED_VALIDATION", "true")
    provider = StubProvider({"problems": [_problem(), _problem(body="3^x = 9 を解きなさい。", answer="x = 2")]})
    assert len(_generate(provider)) == 2


@pytest.mark.parametrize(
    "payload",
    [
        pytest.param({"problems": [_problem(body="   ")]}, id="問題文が空"),
        pytest.param({"problems": [_problem(answer="")]}, id="正答が空"),
        pytest.param({"problems": [_problem(explanation="")]}, id="解説が空"),
        pytest.param({"problems": []}, id="問題が0件"),
        pytest.param({"items": [_problem()]}, id="JSON構造が違う"),
        pytest.param({"problems": [{"unit_id": 204, "format_id": 1, "difficulty": 1, "body": "x"}]}, id="必須フィールド欠落"),
        pytest.param({"problems": [_problem(hints=["1段だけ"])]}, id="ヒントが3段ない"),
    ],
)
def test_relaxed_mode_still_rejects_broken_output(monkeypatch, payload):
    monkeypatch.setenv("DEMO_RELAXED_VALIDATION", "true")
    provider = StubProvider(payload)
    with pytest.raises(LLMProviderError) as excinfo:
        _generate(provider)
    assert excinfo.value.code == "GEMINI_SCHEMA_ERROR"


def test_relaxed_mode_reconciles_trend_total_points(monkeypatch):
    """解析の総配点が合わなくても、小問合計へ寄せて解析を成立させる。"""
    monkeypatch.setenv("DEMO_RELAXED_VALIDATION", "true")
    provider = StubProvider({
        "total_points": 100,
        "items": [
            {"question_no": "1", "unit_id": 204, "format_id": 1, "points": 40, "difficulty": 2, "confidence": 0.9},
            {"question_no": "2", "unit_id": 204, "format_id": 1, "points": 30, "difficulty": 2, "confidence": 0.9},
        ],
    })
    analysis = asyncio.run(provider.analyze_test("encoded", "application/pdf", UNITS, FORMATS))
    assert analysis.total_points == 70
    assert [item.points for item in analysis.items] == [40, 30]


def test_strict_mode_rejects_trend_total_points(monkeypatch):
    monkeypatch.delenv("DEMO_RELAXED_VALIDATION", raising=False)
    provider = StubProvider({
        "total_points": 100,
        "items": [{"question_no": "1", "unit_id": 204, "format_id": 1, "points": 40, "difficulty": 2, "confidence": 0.9}],
    })
    with pytest.raises(LLMProviderError) as excinfo:
        asyncio.run(provider.analyze_test("encoded", "application/pdf", UNITS, FORMATS))
    assert excinfo.value.code == "GEMINI_SCHEMA_ERROR"
