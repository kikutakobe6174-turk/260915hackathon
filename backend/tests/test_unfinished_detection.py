"""未完成な生成物の検出ルールと、NGだった問題だけの部分再生成。

「確認」「訂正」「もう一度」のような一般語は正常な数学の解説にも現れるため、
単純な部分文字列一致をやめたことを固定する回帰テスト。
"""
import asyncio
import json

import pytest

from app.providers import MAX_PROBLEM_REGENERATIONS, GeminiProvider, LLMProviderError
from app.schemas import GeneratedProblem

SPECS = [{"unit_id": 204, "format_id": 1, "difficulty": 1, "count": 1}]
UNITS = [{"id": 204, "name": "指数関数・対数関数"}]
FORMATS = [{"id": 1, "name": "計算"}]


def make(**overrides) -> GeneratedProblem:
    fields = {
        "unit_id": 204, "format_id": 1, "difficulty": 1,
        "body": "2^x = 8 を解きなさい。", "answer": "x = 3",
        "explanation": "8 = 2^3 なので指数を比較します。",
        "hints": ["底をそろえる", "8を累乗で表す", "指数を比較する"],
    }
    fields.update(overrides)
    return GeneratedProblem(**fields)


# --- 正常扱いすべきもの（旧ルールの誤検知） -------------------------------------

@pytest.mark.parametrize(
    "problem",
    [
        pytest.param(make(explanation="計算結果を確認してください。"), id="確認してください"),
        pytest.param(make(explanation="念のため再確認すると、両辺は等しくなります。"), id="再確認・念のため"),
        pytest.param(make(body="次の誤りを訂正すると、正しい式はどれか。"), id="訂正すると"),
        pytest.param(make(explanation="もう一度計算すると x = 3 になります。"), id="もう一度計算すると"),
        pytest.param(make(explanation="符号の計算ミスに注意しましょう。"), id="計算ミスに注意"),
        pytest.param(make(explanation="式を修正すると 2x = 6 となります。"), id="修正すると"),
        pytest.param(make(body="待てば海路の日和あり、という問題ではない。"), id="待て"),
        pytest.param(make(body="x < 3 かつ y > 1 を満たす x を求めよ。"), id="不等号を含む問題文"),
        pytest.param(make(answer="x = TODOS"), id="英単語の一部がTODO"),
    ],
)
def test_normal_math_wording_is_not_rejected(problem):
    assert GeminiProvider._defect_of(problem) is None


# --- 未完成として弾くべきもの ---------------------------------------------------

@pytest.mark.parametrize(
    "problem",
    [
        pytest.param(make(explanation="TODO: 解説をあとで書く"), id="TODO"),
        pytest.param(make(body="PLACEHOLDER"), id="PLACEHOLDER"),
        pytest.param(make(answer="TBD"), id="TBD"),
        pytest.param(make(explanation="FIXME 検算する"), id="FIXME"),
        pytest.param(make(body="ここに問題を入力"), id="入力欄の雛形"),
        pytest.param(make(answer="ここに解答を記入してください"), id="解答欄の雛形"),
        pytest.param(make(explanation="解説を生成してください"), id="指示文がそのまま"),
        pytest.param(make(body="{{problem_body}} を解きなさい。"), id="未置換テンプレート"),
        pytest.param(make(explanation="おっと、正しくは x = 2 でした。"), id="独り言"),
        pytest.param(make(hints=["底をそろえる", "TODO", "指数を比較する"]), id="ヒントにTODO"),
    ],
)
def test_unfinished_output_is_rejected(problem):
    assert GeminiProvider._defect_of(problem) is not None


@pytest.mark.parametrize(
    "overrides",
    [
        pytest.param({"answer": ""}, id="空answer"),
        pytest.param({"answer": "   "}, id="空白だけのanswer"),
        pytest.param({"explanation": ""}, id="空explanation"),
        pytest.param({"body": ""}, id="空body"),
        pytest.param({"hints": ["a", "", "c"]}, id="空ヒント"),
    ],
)
def test_empty_fields_are_still_rejected_by_schema(overrides):
    """空フィールドは従来どおりスキーマ側で弾かれる（緩和モードでも通さない）。"""
    with pytest.raises(ValueError):
        make(**overrides)


# --- 部分再生成 -----------------------------------------------------------------

class PartialFailureProvider(GeminiProvider):
    """1バッチ4問のうち1問だけが未完成。再生成リクエストには完成した1問を返す。"""

    SLOT = {"unit_id": 204, "format_id": 1, "difficulty": 1}

    def __init__(self, fix_after: int = 1):
        super().__init__(api_key="test-key")
        self.batch_calls = 0
        self.review_calls = 0
        self.regeneration_calls = 0
        self.fix_after = fix_after

    async def _request(self, parts, schema):
        text = parts[0]["text"]
        if "作り直す問題" in text:
            self.regeneration_calls += 1
            fixed = self.regeneration_calls >= self.fix_after
            return {"problems": [{
                **self.SLOT,
                "body": "3^x = 27 を解きなさい。", "answer": "x = 3",
                "explanation": "27 = 3^3 なので指数を比較します。" if fixed else "TODO: あとで書く",
                "hints": ["底をそろえる", "27を累乗で表す", "指数を比較する"],
            }]}
        if "校閲対象" in text:
            # 実際の校閲パスと同じく、渡された完成稿をそのまま返す。
            self.review_calls += 1
            return json.loads(text.split("校閲対象: ", 1)[1])
        self.batch_calls += 1
        problems = []
        for index in range(4):
            broken = index == 2
            problems.append({
                **self.SLOT,
                "body": "PLACEHOLDER" if broken else f"2^x = {2 ** (index + 1)} を解きなさい。",
                "answer": f"x = {index + 1}",
                "explanation": "指数を比較します。",
                "hints": ["底をそろえる", "累乗で表す", "指数を比較する"],
            })
        return {"problems": problems}


BATCH_SPECS = [{"unit_id": 204, "format_id": 1, "difficulty": 1, "count": 4}]


def test_only_the_defective_problem_is_regenerated(monkeypatch):
    monkeypatch.delenv("DEMO_RELAXED_VALIDATION", raising=False)
    provider = PartialFailureProvider()
    problems = asyncio.run(provider.generate_problems(BATCH_SPECS, UNITS, FORMATS))

    assert len(problems) == 4
    assert all(GeminiProvider._defect_of(problem) is None for problem in problems)
    # 差し替わったのは3問目だけで、他の3問はそのまま残っている
    assert problems[2].body == "3^x = 27 を解きなさい。"
    assert problems[0].body.startswith("2^x =")
    # 作り直したのは1問だけ。バッチ全体の作り直しは起きていない。
    assert provider.regeneration_calls == 1
    assert provider.batch_calls == 1
    assert provider.review_calls == 1


def test_regeneration_has_a_retry_limit(monkeypatch):
    """上限まで作り直しても直らなければ、従来どおりエラーにする。"""
    monkeypatch.delenv("DEMO_RELAXED_VALIDATION", raising=False)
    provider = PartialFailureProvider(fix_after=99)
    with pytest.raises(LLMProviderError) as excinfo:
        asyncio.run(provider.generate_problems(BATCH_SPECS, UNITS, FORMATS))

    assert excinfo.value.code == "GEMINI_SCHEMA_ERROR"
    # 初回検証とバッチ再生成後の2段で、それぞれ上限回数まで試して打ち切る（無限リトライしない）。
    assert provider.regeneration_calls == MAX_PROBLEM_REGENERATIONS * 2
