import json
import os
from abc import ABC, abstractmethod
from collections import Counter

import httpx
from pydantic import ValidationError

from .schemas import GeminiProblemOutput, GeminiTrendOutput, GeneratedProblem, TrendAnalysis


class LLMProviderError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 502):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


class LLMProvider(ABC):
    name = "unknown"

    @abstractmethod
    async def analyze_test(self, image_base64: str, media_type: str, units: list[dict], formats: list[dict]) -> TrendAnalysis: ...

    @abstractmethod
    async def generate_problems(self, specifications: list[dict], units: list[dict], formats: list[dict]) -> list[GeneratedProblem]: ...


class GeminiProvider(LLMProvider):
    name = "gemini"

    def __init__(self, api_key: str | None = None, model: str | None = None, client: httpx.AsyncClient | None = None):
        self.api_key = api_key or os.getenv("GEMINI_API_KEY", "")
        self.model = model or os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
        self.client = client

    async def _request(self, parts: list[dict], schema: dict) -> dict:
        if not self.api_key:
            raise LLMProviderError("GEMINI_API_KEY_MISSING", "Gemini APIキーが未設定です。backend/.env の GEMINI_API_KEY を設定して再起動してください。", 503)
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent"
        payload = {
            "contents": [{"parts": parts}],
            "generationConfig": {"responseMimeType": "application/json", "responseJsonSchema": schema, "temperature": 0.2},
        }
        owns_client = self.client is None
        client = self.client or httpx.AsyncClient(timeout=90)
        try:
            response = await client.post(url, headers={"x-goog-api-key": self.api_key}, json=payload)
            if response.status_code == 429:
                raise LLMProviderError("GEMINI_QUOTA_EXCEEDED", "Gemini APIの無料枠またはレート上限に達しました。時間をおいて再試行するか、Google AI Studioで使用量を確認してください。", 429)
            if response.status_code in (401, 403):
                raise LLMProviderError("GEMINI_AUTH_ERROR", "Gemini APIキーが無効か、このモデルを利用できません。APIキーとGEMINI_MODELを確認してください。", 502)
            if response.is_error:
                try:
                    provider_message = str(response.json().get("error", {}).get("message", ""))[:600]
                except (ValueError, AttributeError):
                    provider_message = ""
                suffix = f" 詳細: {provider_message}" if provider_message else ""
                raise LLMProviderError(
                    "GEMINI_REQUEST_ERROR",
                    f"Gemini APIがリクエストを受理しませんでした（HTTP {response.status_code}）。GEMINI_MODELと出力schemaを確認してください。{suffix}",
                )
            response.raise_for_status()
            data = response.json()
            text = data["candidates"][0]["content"]["parts"][0]["text"]
            return json.loads(text)
        except LLMProviderError:
            raise
        except (httpx.TimeoutException, httpx.NetworkError) as exc:
            raise LLMProviderError("GEMINI_NETWORK_ERROR", "Gemini APIへ接続できませんでした。ネットワーク接続を確認して再試行してください。") from exc
        except (httpx.HTTPError, KeyError, IndexError, json.JSONDecodeError) as exc:
            raise LLMProviderError("GEMINI_INVALID_RESPONSE", "Gemini APIから有効な構造化JSONを取得できませんでした。再試行してください。") from exc
        finally:
            if owns_client:
                await client.aclose()

    async def analyze_test(self, image_base64: str, media_type: str, units: list[dict], formats: list[dict]) -> TrendAnalysis:
        prompt = (
            "日本の学校テストの画像またはPDFを、全ページ確認して小問単位で解析してください。小問番号、最も適切な単元ID、問題形式ID、配点、"
            "難易度(1基礎/2標準/3発展)、確信度(0〜1)を返してください。資料に明記された総配点をtotal_pointsへ入れ、"
            "itemsの配点合計と必ず一致させてください。大問番号が同じでも、グラフと値域、計算と説明など、別々に配点された解答欄は"
            "それぞれ独立した小問に分けてください。採点済み答案では、解答欄付近の赤丸で囲まれた数字も配点として読み取ってください。"
            "推測で存在しないIDを作らないでください。\n"
            f"利用可能な単元: {json.dumps(units, ensure_ascii=False)}\n利用可能な形式: {json.dumps(formats, ensure_ascii=False)}"
        )
        document_part = {"inlineData": {"mimeType": media_type, "data": image_base64}}
        raw = await self._request([{"text": prompt}, document_part], GeminiTrendOutput.model_json_schema())
        try:
            return TrendAnalysis.model_validate(raw)
        except ValidationError as first_error:
            try:
                parsed = GeminiTrendOutput.model_validate(raw)
            except ValidationError as exc:
                raise LLMProviderError(
                    "GEMINI_SCHEMA_ERROR",
                    "解析結果に必須項目の欠落または不正な値がありました。元PDF・画像が鮮明か確認して再試行してください。",
                ) from exc

            item_sum = sum(item.points for item in parsed.items)
            retry_prompt = (
                f"前回の解析は総配点{parsed.total_points}点に対し、小問の合計が{item_sum}点で一致しませんでした。"
                "元の全ページをもう一度確認し、欠けた解答欄または誤った配点を修正してください。"
                "同じ大問内でも別々に配点が書かれた『グラフ』『値域』『最大値・最小値』等は、"
                "小問番号を『2(グラフ)』『2(値域)』のように分けてください。"
                "total_pointsとitemsのpoints合計を必ず一致させてください。\n"
                f"利用可能な単元: {json.dumps(units, ensure_ascii=False)}\n"
                f"利用可能な形式: {json.dumps(formats, ensure_ascii=False)}"
            )
            repaired = await self._request([{"text": retry_prompt}, document_part], GeminiTrendOutput.model_json_schema())
            try:
                return TrendAnalysis.model_validate(repaired)
            except ValidationError as exc:
                try:
                    failed = GeminiTrendOutput.model_validate(repaired)
                    failed_sum = sum(item.points for item in failed.items)
                    detail = f"総配点は{failed.total_points}点、小問の配点合計は{failed_sum}点でした。"
                except ValidationError:
                    detail = "必須項目の欠落または不正な値が残っています。"
                raise LLMProviderError(
                    "GEMINI_SCHEMA_ERROR",
                    f"再解析後も検証条件を満たしませんでした。{detail} 配点表示が見えるPDF・画像か確認してください。",
                ) from exc

    async def generate_problems(self, specifications: list[dict], units: list[dict], formats: list[dict]) -> list[GeneratedProblem]:
        generated = []
        for specification in specifications:
            remaining = specification["count"]
            while remaining:
                batch_count = min(8, remaining)
                batch = [{**specification, "count": batch_count}]
                generated.extend(await self._generate_problem_batch(batch, units, formats))
                remaining -= batch_count
        return generated

    async def _generate_problem_batch(self, specifications: list[dict], units: list[dict], formats: list[dict]) -> list[GeneratedProblem]:
        prompt = (
            "次の仕様1件につきcount個、日本の学校テスト対策問題を作成してください。問題文、正答、解説、"
            "易しい順に3段階のヒントを必ず含め、指定したunit_id/format_id/difficultyを変えないでください。"
            "元テストの文面は複製せず、同じ出題構成の新しい問題にしてください。各問は必ず最後まで解き直し、"
            "問題文の条件・正答・解説が数学的に一致することを確認してください。解説には最終的な正しい解法だけを書き、"
            "『あれ』『待てよ』『見直す』『別な問題にする』等の思考途中・自己訂正・問題変更を含めないでください。\n"
            f"仕様: {json.dumps(specifications, ensure_ascii=False)}\n単元: {json.dumps(units, ensure_ascii=False)}\n形式: {json.dumps(formats, ensure_ascii=False)}"
        )
        raw = await self._request([{"text": prompt}], GeminiProblemOutput.model_json_schema())
        try:
            self._validate_generated_problems(raw, specifications)
            candidate = raw
        except (ValidationError, ValueError):
            repair_prompt = (
                "前回の生成には、空欄、ヒント不足、または解説中の自己訂正がありました。全問を最初から解き直し、"
                "問題文・正答・解説が一致する完成稿だけを返してください。問題文の条件や点を解説途中で変更してはいけません。"
                "『あれ』『待てよ』『見直す』『別な点』『こちらを正解』のような途中思考は禁止です。\n"
                f"仕様: {json.dumps(specifications, ensure_ascii=False)}\n単元: {json.dumps(units, ensure_ascii=False)}\n"
                f"形式: {json.dumps(formats, ensure_ascii=False)}\n前回出力: {json.dumps(raw, ensure_ascii=False)}"
            )
            repaired = await self._request([{"text": repair_prompt}], GeminiProblemOutput.model_json_schema())
            try:
                self._validate_generated_problems(repaired, specifications)
                candidate = repaired
            except (ValidationError, ValueError) as exc:
                raise LLMProviderError("GEMINI_SCHEMA_ERROR", "再生成後も問題文・正答・解説の検証条件を満たしませんでした。内容を変えて再試行してください。") from exc

        review_prompt = (
            "次の問題セットを数学の校閲者として全問独立に解き直してください。問題文の条件、正答、解説の計算が"
            "完全に一致するか検算し、誤りがあれば修正した完成稿を同じJSON構造で返してください。"
            "問題文に解がない、囲まれた図形ができない、答えと解説が異なる場合は、問題文も含めて数学的に成立する一問へ修正します。"
            "途中思考、自己訂正、検算の実況、代替問題の提案は書かず、最終的な解法だけを残してください。"
            "unit_id、format_id、difficulty、問題数は変更してはいけません。\n"
            f"仕様: {json.dumps(specifications, ensure_ascii=False)}\n校閲対象: {json.dumps(candidate, ensure_ascii=False)}"
        )
        reviewed = await self._request([{"text": review_prompt}], GeminiProblemOutput.model_json_schema())
        try:
            return self._validate_generated_problems(reviewed, specifications)
        except (ValidationError, ValueError) as exc:
            raise LLMProviderError("GEMINI_SCHEMA_ERROR", "数学校閲後も問題文・正答・解説の検証条件を満たしませんでした。再試行してください。") from exc

    @staticmethod
    def _validate_generated_problems(raw: dict, specifications: list[dict]) -> list[GeneratedProblem]:
        validated = GeminiProblemOutput.model_validate(raw)
        problems = [GeneratedProblem.model_validate(problem.model_dump()) for problem in validated.problems]
        expected = Counter((spec["unit_id"], spec["format_id"], spec["difficulty"]) for spec in specifications for _ in range(spec["count"]))
        actual = Counter((problem.unit_id, problem.format_id, problem.difficulty) for problem in problems)
        if actual != expected:
            raise ValueError("指定された構成または問題数と一致しません")
        unfinished_markers = (
            "あれ", "待て", "見直す", "別な点", "別な問題", "こちらを正解", "計算確認", "再確認",
            "訂正", "問題の意図", "念のため", "もう一度", "計算ミス", "修正する", "変更する",
        )
        if any(marker in f"{problem.body}\n{problem.answer}\n{problem.explanation}" for problem in problems for marker in unfinished_markers):
            raise ValueError("思考途中または自己訂正を含む問題です")
        return problems


class QuotaTemplateProvider(LLMProvider):
    """Use deterministic, editable templates only when Gemini explicitly returns quota exhaustion."""

    name = "gemini"
    model = "gemini"

    def __init__(self, primary: LLMProvider):
        self.primary = primary
        self.name = primary.name
        self.model = getattr(primary, "model", "gemini")

    def _activate(self):
        self.name = "quota-template"
        self.model = "local-template-v1"

    async def analyze_test(self, image_base64: str, media_type: str, units: list[dict], formats: list[dict]) -> TrendAnalysis:
        try:
            return await self.primary.analyze_test(image_base64, media_type, units, formats)
        except LLMProviderError as exc:
            if exc.code != "GEMINI_QUOTA_EXCEEDED":
                raise
        self._activate()
        count = min(8, max(4, len(units) * 2))
        base, remainder = divmod(100, count)
        items = []
        for index in range(count):
            items.append({
                "question_no": str(index + 1),
                "unit_id": units[index % len(units)]["id"],
                "format_id": formats[index % len(formats)]["id"],
                "points": base + (1 if index < remainder else 0),
                "difficulty": (1, 2, 2, 3)[index % 4],
                "confidence": 0,
            })
        return TrendAnalysis.model_validate({"total_points": 100, "items": items})

    @staticmethod
    def _template_problem(unit: dict, format_id: int, difficulty: int, serial: int) -> GeneratedProblem:
        name = unit["name"]
        n = serial + difficulty + 1
        if "微分" in name:
            body, answer, explanation = f"関数 f(x) = x^2 + {n}x の導関数を求めなさい。", f"f'(x) = 2x + {n}", "x^2の導関数は2x、一次項の導関数は係数です。"
        elif "対数" in name:
            body, answer, explanation = f"log_2 {2 ** min(n, 6)} の値を求めなさい。", str(min(n, 6)), f"2^{min(n, 6)} = {2 ** min(n, 6)} なので、対数の値は{min(n, 6)}です。"
        elif "指数" in name:
            exponent = min(n, 6)
            body, answer, explanation = f"方程式 2^x = {2 ** exponent} を解きなさい。", f"x = {exponent}", f"右辺を2の累乗で表すと 2^{exponent} なので、指数を比較します。"
        elif "三角" in name or "図形" in name:
            body, answer, explanation = "sin 30° の値を求めなさい。", "1/2", "30°-60°-90°の直角三角形の辺の比から求めます。"
        else:
            body, answer, explanation = f"方程式 {n}x + {n} = {n * 3} を解きなさい。", "x = 2", f"両辺から{n}を引いて{n}で割ります。"
        return GeneratedProblem(
            unit_id=unit["id"], format_id=format_id, difficulty=difficulty,
            body=body, answer=answer, explanation=explanation,
            hints=["使う公式または定義を確認します。", "同じ底・同じ次数の形へ整理します。", "式を整理し、代入して確かめます。"],
        )

    async def generate_problems(self, specifications: list[dict], units: list[dict], formats: list[dict]) -> list[GeneratedProblem]:
        try:
            return await self.primary.generate_problems(specifications, units, formats)
        except LLMProviderError as exc:
            if exc.code != "GEMINI_QUOTA_EXCEEDED":
                raise
        self._activate()
        units_by_id = {unit["id"]: unit for unit in units}
        result = []
        serial = 0
        for specification in specifications:
            for _ in range(specification["count"]):
                result.append(self._template_problem(units_by_id[specification["unit_id"]], specification["format_id"], specification["difficulty"], serial))
                serial += 1
        return result


def get_provider() -> LLMProvider:
    provider = GeminiProvider()
    enabled = os.getenv("GEMINI_QUOTA_TEMPLATE_FALLBACK", "true").lower() in {"1", "true", "yes", "on"}
    return QuotaTemplateProvider(provider) if enabled else provider
