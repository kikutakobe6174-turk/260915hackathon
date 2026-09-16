import base64
import os
from io import BytesIO

from docx import Document

from fastapi.testclient import TestClient

from app.main import app
from app.providers import GeminiProvider, LLMProvider, LLMProviderError, QuotaTemplateProvider
from app.schemas import GeneratedProblem, TrendAnalysis, TrendDraftRequest, TrendItem


class FakeProvider(LLMProvider):
    name = "fake-gemini"
    model = "test-model"

    async def analyze_test(self, image_base64, media_type, units, formats):
        assert base64.b64decode(image_base64) == b"test image bytes"
        assert {unit["id"] for unit in units} == {1, 2, 3}
        return TrendAnalysis(total_points=20, items=[
            TrendItem(question_no="1", unit_id=1, format_id=1, points=5, difficulty=1, confidence=0.95),
            TrendItem(question_no="2", unit_id=2, format_id=3, points=10, difficulty=2, confidence=0.88),
            TrendItem(question_no="3", unit_id=2, format_id=3, points=5, difficulty=2, confidence=0.81),
        ])

    async def generate_problems(self, specifications, units, formats):
        result = []
        for specification in specifications:
            for index in range(specification["count"]):
                result.append(GeneratedProblem(
                    unit_id=specification["unit_id"], format_id=specification["format_id"],
                    difficulty=specification["difficulty"], body=f"新しい問題 {index + 1}",
                    answer="正答", explanation="解説", hints=["ヒント1", "ヒント2", "ヒント3"],
                ))
        return result


def test_image_analysis_to_problem_bank(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "flow.db"))
    provider = FakeProvider()
    app.dependency_overrides[__import__("app.main", fromlist=["get_provider"]).get_provider] = lambda: provider
    try:
        with TestClient(app) as client:
            encoded = base64.b64encode(b"test image bytes").decode()
            analysis = client.post("/llm/trend-draft", json={"test_id": 1, "user_id": 1, "image_base64": encoded, "media_type": "image/jpeg"})
            assert analysis.status_code == 200, analysis.text
            analysis_job_id = analysis.json()["job_id"]
            assert analysis.json()["image_discarded"] is True
            assert analysis.json()["total_points"] == 20

            edited = analysis.json()
            edited["items"][0]["confidence"] = 1
            response = client.put(f"/llm/trend-drafts/{analysis_job_id}", json={"user_id": 1, "total_points": 20, "items": edited["items"]})
            assert response.status_code == 200
            assert client.post(f"/llm/trend-drafts/{analysis_job_id}/confirm", json={"user_id": 1}).status_code == 200
            confirmed_trends = client.get("/tests/1/trends").json()["items"]
            assert confirmed_trends[0]["confidence"] == 1
            assert confirmed_trends[1]["confidence"] == 0.88

            generated = client.post(f"/llm/trend-drafts/{analysis_job_id}/generate", json={"user_id": 1})
            assert generated.status_code == 200, generated.text
            generation_job_id = generated.json()["job_id"]
            assert len(generated.json()["problems"]) == 3

            generated_pdf = client.post(f"/llm/problem-batches/{generation_job_id}/pdf", json={"duration_minutes": 50, "total_points": 20})
            assert generated_pdf.status_code == 200, generated_pdf.text
            assert generated_pdf.content.startswith(b"%PDF")
            generated_word = client.post(f"/llm/problem-batches/{generation_job_id}/word", json={"duration_minutes": 50, "total_points": 20})
            assert generated_word.status_code == 200, generated_word.text
            assert "第1問" in "\n".join(paragraph.text for paragraph in Document(BytesIO(generated_word.content)).paragraphs)

            drafts = generated.json()["problems"]
            drafts[0]["body"] = "利用者が修正した問題"
            saved = client.post(f"/llm/problem-batches/{generation_job_id}/save", json={"user_id": 1, "problems": drafts})
            assert saved.status_code == 200, saved.text
            assert saved.json()["saved"] == 3
            problems = client.get("/problems").json()
            assert len(problems) == 3
            assert problems[0]["source"] == "llm"
            assert problems[0]["llm_job_id"] == generation_job_id
            assert all(problem["analysis_job_id"] == analysis_job_id for problem in problems)
            assert any(problem["body"] == "利用者が修正した問題" for problem in problems)
    finally:
        app.dependency_overrides.clear()


def test_rejects_score_mismatch():
    try:
        TrendAnalysis(total_points=100, items=[TrendItem(question_no="1", unit_id=1, format_id=1, points=10, difficulty=1, confidence=1)])
    except ValueError as exc:
        assert "total_points" in str(exc)
    else:
        raise AssertionError("配点不整合を拒否しませんでした")


def test_missing_api_key_has_actionable_japanese_message(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    provider = GeminiProvider(api_key="")
    try:
        import asyncio
        asyncio.run(provider._request([], {}))
    except LLMProviderError as exc:
        assert exc.code == "GEMINI_API_KEY_MISSING"
        assert "GEMINI_API_KEY" in exc.message
    else:
        raise AssertionError("APIキー未設定を拒否しませんでした")


def test_pdf_is_accepted_as_trend_source():
    request = TrendDraftRequest(
        test_id=1,
        user_id=1,
        image_base64=base64.b64encode(b"minimal pdf bytes").decode(),
        media_type="application/pdf",
    )
    assert request.media_type == "application/pdf"


def test_quota_only_uses_editable_template():
    class QuotaProvider(LLMProvider):
        name = "gemini"
        model = "test"

        async def analyze_test(self, image_base64, media_type, units, formats):
            raise LLMProviderError("GEMINI_QUOTA_EXCEEDED", "quota", 429)

        async def generate_problems(self, specifications, units, formats):
            raise LLMProviderError("GEMINI_QUOTA_EXCEEDED", "quota", 429)

    import asyncio
    provider = QuotaTemplateProvider(QuotaProvider())
    units = [{"id": 204, "name": "指数関数・対数関数"}, {"id": 206, "name": "微分法"}]
    formats = [{"id": 1, "name": "計算"}, {"id": 3, "name": "記述"}]
    analysis = asyncio.run(provider.analyze_test("encoded", "application/pdf", units, formats))
    assert provider.name == "quota-template"
    assert analysis.total_points == 100
    assert all(item.confidence == 0 for item in analysis.items)
    generated = asyncio.run(provider.generate_problems(
        [{"unit_id": 204, "format_id": 1, "difficulty": 2, "count": 2}], units, formats,
    ))
    assert len(generated) == 2
    assert all(problem.body and problem.answer and len(problem.hints) == 3 for problem in generated)


def test_non_quota_error_does_not_use_template():
    class NetworkProvider(LLMProvider):
        name = "gemini"

        async def analyze_test(self, image_base64, media_type, units, formats):
            raise LLMProviderError("GEMINI_NETWORK_ERROR", "network")

        async def generate_problems(self, specifications, units, formats):
            raise LLMProviderError("GEMINI_NETWORK_ERROR", "network")

    import asyncio
    provider = QuotaTemplateProvider(NetworkProvider())
    try:
        asyncio.run(provider.analyze_test("encoded", "application/pdf", [{"id": 1, "name": "式"}], [{"id": 1, "name": "計算"}]))
    except LLMProviderError as exc:
        assert exc.code == "GEMINI_NETWORK_ERROR"
    else:
        raise AssertionError("無料枠超過以外でテンプレートへ切り替わりました")


def test_score_mismatch_is_reanalyzed_once():
    class RepairProvider(GeminiProvider):
        def __init__(self):
            super().__init__(api_key="test-key")
            self.calls = 0

        async def _request(self, parts, schema):
            self.calls += 1
            if self.calls == 1:
                return {
                    "total_points": 100,
                    "items": [
                        {"question_no": "1", "unit_id": 1, "format_id": 1, "points": 96, "difficulty": 2, "confidence": 0.9}
                    ],
                }
            return {
                "total_points": 100,
                "items": [
                    {"question_no": "1", "unit_id": 1, "format_id": 1, "points": 96, "difficulty": 2, "confidence": 0.9},
                    {"question_no": "2(値域)", "unit_id": 1, "format_id": 3, "points": 4, "difficulty": 2, "confidence": 0.8},
                ],
            }

    provider = RepairProvider()
    import asyncio
    result = asyncio.run(provider.analyze_test(
        "encoded-document",
        "application/pdf",
        [{"id": 1, "name": "指数関数・対数関数"}],
        [{"id": 1, "name": "計算"}, {"id": 3, "name": "記述"}],
    ))
    assert provider.calls == 2
    assert result.total_points == 100
    assert sum(item.points for item in result.items) == 100


def test_generation_with_self_correction_is_regenerated_once():
    class RepairGenerationProvider(GeminiProvider):
        def __init__(self):
            super().__init__(api_key="test-key")
            self.calls = 0

        async def _request(self, parts, schema):
            self.calls += 1
            explanation = "おっと、計算が違う。正しくは別の値だった。" if self.calls == 1 else "2^3=8なので、指数を比較してx=3です。"
            return {"problems": [{
                "unit_id": 204, "format_id": 1, "difficulty": 1,
                "body": "2^x=8を解きなさい。", "answer": "x=3", "explanation": explanation,
                "hints": ["底を見る", "8を累乗で表す", "指数を比較する"],
            }]}

    provider = RepairGenerationProvider()
    import asyncio
    result = asyncio.run(provider.generate_problems(
        [{"unit_id": 204, "format_id": 1, "difficulty": 1, "count": 1}],
        [{"id": 204, "name": "指数関数・対数関数"}], [{"id": 1, "name": "計算"}],
    ))
    assert provider.calls == 3
    assert result[0].answer == "x=3"
    assert "おっと" not in result[0].explanation
