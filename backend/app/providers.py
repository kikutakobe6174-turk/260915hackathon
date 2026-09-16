import json
import logging
import os
import re
from abc import ABC, abstractmethod
from collections import Counter

import httpx
from pydantic import ValidationError

from .schemas import GeminiProblemOutput, GeminiTrendOutput, GeneratedProblem, TrendAnalysis


logger = logging.getLogger(__name__)


def relaxed_validation_enabled() -> bool:
    """デモ用の緩和モード（環境変数 DEMO_RELAXED_VALIDATION）。

    ONのとき、内容面の厳しい検証（思考途中マーカー、構成・問題数の一致、
    総配点の一致）で落ちても処理を止めず、警告ログだけ残して結果を通す。
    JSONが壊れている、必須フィールドが欠けている、問題文・正答・解説が空、
    という致命的な場合は ON/OFF によらず従来どおりエラーにする。
    OFF（既定）にすれば従来の厳格検証に戻る。
    """
    return os.getenv("DEMO_RELAXED_VALIDATION", "false").lower() in {"1", "true", "yes", "on"}


# 未完成だった問題を1問ずつ作り直す上限回数。
MAX_PROBLEM_REGENERATIONS = 2


# 生成が完了していないことが明らかな痕跡だけを弾く。数学の解説に普通に出る
# 「確認」「訂正」「もう一度」のような一般語は対象にしない（誤検知の原因だったため）。
UNFINISHED_PATTERNS = [
    # 英語のプレースホルダ。数式の変数と衝突しないよう、英字に挟まれた場合は無視する。
    (re.compile(r"(?<![A-Za-z])(TODO|TBD|FIXME|PLACEHOLDER|LOREM IPSUM)(?![A-Za-z])", re.IGNORECASE), "プレースホルダが残っています"),
    # 「ここに問題を入力」「ここに解答を記入」など、雛形のまま返ってきたもの。
    (re.compile(r"ここに.{0,8}(入力|記入|記述|挿入)"), "入力欄の雛形が残っています"),
    # 指示文がそのまま本文に出力されたもの。
    (re.compile(r"(問題文|問題|解答|正答|解説|ヒント)を(生成|作成|入力|記入)してください"), "指示文がそのまま出力されています"),
    # 未置換のテンプレート変数。
    (re.compile(r"\{\{.*?\}\}|\[\[.*?\]\]|＜＜.*?＞＞|<<.*?>>"), "未置換のテンプレート変数が残っています"),
    # 完成稿には現れない独り言・謝罪。自己訂正の途中経過がそのまま残った出力を拾う。
    (re.compile(r"おっと|あっ、|すみません|失礼しました|申し訳(あり|ござ)"), "思考途中の独り言が残っています"),
]


class UnfinishedProblemsError(ValueError):
    """バッチ内の一部の問題だけが未完成だったことを、対象の番号つきで伝える。"""

    def __init__(self, problems: list[GeneratedProblem], defects: dict[int, str]):
        super().__init__("; ".join(f"#{index + 1}: {reason}" for index, reason in sorted(defects.items())))
        self.problems = problems
        self.defects = defects


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
                else:
                    if relaxed_validation_enabled():
                        # 小問の配点はそのまま使い、総配点だけ合計へ寄せて成立させる。
                        # 小問番号の重複などで組み直せない場合は、従来どおりエラーにする。
                        try:
                            reconciled = TrendAnalysis.model_validate(
                                {"total_points": failed_sum, "items": [item.model_dump() for item in failed.items]}
                            )
                        except ValidationError:
                            pass
                        else:
                            logger.warning("relaxed validation accepted: trend analysis (%s)", detail)
                            return reconciled
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
        accepted, _ = await self._accept_or_regenerate(raw, specifications, units, formats)
        if accepted is not None:
            candidate = self._as_payload(accepted)
        else:
            repair_prompt = (
                "前回の生成には、空欄、ヒント不足、または未完成の痕跡がありました。全問を最初から解き直し、"
                "問題文・正答・解説が一致する完成稿だけを返してください。問題文の条件や点を解説途中で変更してはいけません。"
                "TODO・未入力の雛形・指示文・独り言を残してはいけません。\n"
                f"仕様: {json.dumps(specifications, ensure_ascii=False)}\n単元: {json.dumps(units, ensure_ascii=False)}\n"
                f"形式: {json.dumps(formats, ensure_ascii=False)}\n前回出力: {json.dumps(raw, ensure_ascii=False)}"
            )
            repaired = await self._request([{"text": repair_prompt}], GeminiProblemOutput.model_json_schema())
            accepted, error = await self._accept_or_regenerate(repaired, specifications, units, formats)
            if accepted is not None:
                candidate = self._as_payload(accepted)
            elif relaxed_validation_enabled() and self._minimally_valid_problems(repaired) is not None:
                logger.warning("relaxed validation accepted: problem generation (%s)", error)
                candidate = repaired
            else:
                raise LLMProviderError("GEMINI_SCHEMA_ERROR", "再生成後も問題文・正答・解説の検証条件を満たしませんでした。内容を変えて再試行してください。") from error

        review_prompt = (
            "次の問題セットを数学の校閲者として全問独立に解き直してください。問題文の条件、正答、解説の計算が"
            "完全に一致するか検算し、誤りがあれば修正した完成稿を同じJSON構造で返してください。"
            "問題文に解がない、囲まれた図形ができない、答えと解説が異なる場合は、問題文も含めて数学的に成立する一問へ修正します。"
            "途中思考、自己訂正、検算の実況、代替問題の提案は書かず、最終的な解法だけを残してください。"
            "unit_id、format_id、difficulty、問題数は変更してはいけません。\n"
            f"仕様: {json.dumps(specifications, ensure_ascii=False)}\n校閲対象: {json.dumps(candidate, ensure_ascii=False)}"
        )
        reviewed = await self._request([{"text": review_prompt}], GeminiProblemOutput.model_json_schema())
        accepted, error = await self._accept_or_regenerate(reviewed, specifications, units, formats)
        if accepted is not None:
            return accepted
        if relaxed_validation_enabled():
            # 校閲後の出力を優先し、それが構造的に壊れていれば校閲前の完成稿へ戻す。
            fallback = self._minimally_valid_problems(reviewed) or self._minimally_valid_problems(candidate)
            if fallback is not None:
                logger.warning("relaxed validation accepted: math review (%s)", error)
                return fallback
        raise LLMProviderError("GEMINI_SCHEMA_ERROR", "数学校閲後も問題文・正答・解説の検証条件を満たしませんでした。再試行してください。") from error

    @staticmethod
    def _as_payload(problems: list[GeneratedProblem]) -> dict:
        return {"problems": [problem.model_dump(exclude={"id"}) for problem in problems]}

    async def _accept_or_regenerate(
        self,
        raw: dict,
        specifications: list[dict],
        units: list[dict],
        formats: list[dict],
    ) -> tuple[list[GeneratedProblem] | None, Exception | None]:
        """検証を通ればその問題群を返す。

        一部の問題だけが未完成だった場合は、バッチ全体を捨てずにその問題だけ作り直す。
        構造が壊れている・構成が仕様と合わない場合は (None, 例外) を返し、
        呼び出し側のバッチ再生成やエラー処理へ委ねる。
        """
        try:
            return self._validate_generated_problems(raw, specifications), None
        except UnfinishedProblemsError as exc:
            regenerated = await self._regenerate_defective(exc.problems, exc.defects, units, formats)
            return regenerated, None if regenerated is not None else exc
        except (ValidationError, ValueError) as exc:
            return None, exc
        except (ValidationError, ValueError) as exc:
            if relaxed_validation_enabled():
                # 校閲後の出力を優先し、それが構造的に壊れていれば校閲前の完成稿へ戻す。
                fallback = self._minimally_valid_problems(reviewed) or self._minimally_valid_problems(candidate)
                if fallback is not None:
                    logger.warning("relaxed validation accepted: math review (%s)", exc)
                    return fallback
            raise LLMProviderError("GEMINI_SCHEMA_ERROR", "数学校閲後も問題文・正答・解説の検証条件を満たしませんでした。再試行してください。") from exc

    async def _regenerate_defective(
        self,
        problems: list[GeneratedProblem],
        defects: dict[int, str],
        units: list[dict],
        formats: list[dict],
    ) -> list[GeneratedProblem] | None:
        """未完成だった問題だけを1問ずつ作り直す。全問そろえば差し替え済みの一覧を返す。

        MAX_PROBLEM_REGENERATIONS 回試しても直らない問題が残った場合は None を返し、
        呼び出し側に従来のエラー（または緩和モードの判断）を任せる。
        """
        repaired = list(problems)
        for index, reason in sorted(defects.items()):
            target = repaired[index]
            for attempt in range(1, MAX_PROBLEM_REGENERATIONS + 1):
                logger.warning(
                    "regenerating unfinished problem #%s (%s) attempt %s/%s",
                    index + 1, reason, attempt, MAX_PROBLEM_REGENERATIONS,
                )
                replacement = await self._regenerate_one(target, units, formats, reason)
                if replacement is not None:
                    repaired[index] = replacement
                    break
            else:
                logger.warning("gave up regenerating problem #%s (%s)", index + 1, reason)
                return None
        return repaired

    async def _regenerate_one(
        self,
        target: GeneratedProblem,
        units: list[dict],
        formats: list[dict],
        reason: str,
    ) -> GeneratedProblem | None:
        """1問だけ作り直す。単元・形式・難易度は変えない。"""
        prompt = (
            f"次の問題は{reason}。同じunit_id/format_id/difficultyのまま、完成した問題を1問だけ作り直してください。"
            "問題文、正答、解説、易しい順に3段階のヒントをすべて埋め、最後まで解き直して"
            "問題文の条件・正答・解説が数学的に一致することを確認してください。"
            "TODO・未入力の雛形・指示文・独り言は残さず、完成稿だけを返してください。\n"
            f"作り直す問題: {json.dumps(target.model_dump(exclude={'id'}), ensure_ascii=False)}\n"
            f"単元: {json.dumps(units, ensure_ascii=False)}\n形式: {json.dumps(formats, ensure_ascii=False)}"
        )
        # LLMProviderError（無料枠超過・認証エラー等）はそのまま伝播させ、
        # QuotaTemplateProvider のフォールバック判定を壊さないようにする。
        raw = await self._request([{"text": prompt}], GeminiProblemOutput.model_json_schema())
        try:
            validated = GeminiProblemOutput.model_validate(raw)
            candidates = [GeneratedProblem.model_validate(problem.model_dump()) for problem in validated.problems]
        except ValidationError as exc:
            logger.warning("regenerated problem was not usable (%s)", exc)
            return None
        for candidate in candidates:
            same_slot = (candidate.unit_id, candidate.format_id, candidate.difficulty) == (target.unit_id, target.format_id, target.difficulty)
            if same_slot and self._defect_of(candidate) is None:
                return candidate
        return None

    @staticmethod
    def _minimally_valid_problems(raw: dict) -> list[GeneratedProblem] | None:
        """デモ緩和モード用の最低限の検証。

        JSONとして GeminiProblemOutput の形をしていること、必須フィールドが揃っていること、
        問題文・正答・解説が空でないこと（空文字は GeneratedProblem 側で弾かれる）だけを確認し、
        満たさなければ None を返して呼び出し側に従来のエラーを投げさせる。
        思考途中マーカーや構成・問題数の一致はここでは見ない。
        """
        try:
            validated = GeminiProblemOutput.model_validate(raw)
            problems = [GeneratedProblem.model_validate(problem.model_dump()) for problem in validated.problems]
        except ValidationError:
            return None
        return problems or None

    @staticmethod
    def _defect_of(problem: GeneratedProblem) -> str | None:
        """未完成な生成物だけを検出する。正常な数学の言い回しには反応させない。

        「確認してください」「訂正すると」「もう一度計算すると」のような一般語は、
        完成した解説にも普通に現れるため検出対象にしない。プレースホルダが残っている、
        指示文がそのまま出力されている、独り言が混ざっている、といった
        「生成が完了していないことが明らかな痕跡」だけを弾く。
        """
        text = "\n".join([problem.body, problem.answer, problem.explanation, *problem.hints])
        for pattern, reason in UNFINISHED_PATTERNS:
            if pattern.search(text):
                return reason
        return None

    @staticmethod
    def _validate_generated_problems(raw: dict, specifications: list[dict]) -> list[GeneratedProblem]:
        validated = GeminiProblemOutput.model_validate(raw)
        problems = [GeneratedProblem.model_validate(problem.model_dump()) for problem in validated.problems]
        expected = Counter((spec["unit_id"], spec["format_id"], spec["difficulty"]) for spec in specifications for _ in range(spec["count"]))
        actual = Counter((problem.unit_id, problem.format_id, problem.difficulty) for problem in problems)
        if actual != expected:
            raise ValueError("指定された構成または問題数と一致しません")
        defects = {index: defect for index, problem in enumerate(problems) if (defect := GeminiProvider._defect_of(problem))}
        if defects:
            raise UnfinishedProblemsError(problems, defects)
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
