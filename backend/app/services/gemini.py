import json
import os
from typing import Any

from app.errors import ApiException

MODEL_NAME = "gemini-3.6-flash"


class GeminiClient:
    """Gemini呼び出しの薄いラッパー。

    テストでは差し替え可能なように、FastAPIの dependency override
    （`app.main.app.dependency_overrides[get_gemini_client]`）でモックに置き換える想定。
    """

    def __init__(self, api_key: str | None = None):
        self._api_key = api_key or os.environ.get("GEMINI_API_KEY")

    @property
    def available(self) -> bool:
        return bool(self._api_key)

    def generate_json(self, prompt: str) -> Any:
        """promptを渡してGeminiにJSONを生成させ、パース済みの値(list/dict)を返す。

        APIキー未設定、呼び出し失敗、JSONパース失敗の場合は ApiException(502) を送出する。
        """
        if not self._api_key:
            raise ApiException(
                502,
                "LLM_UNAVAILABLE",
                "GEMINI_API_KEYが設定されていないため、LLM機能を利用できません。",
            )

        try:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=self._api_key)
            response = client.models.generate_content(
                model=MODEL_NAME,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                ),
            )
            text = response.text
        except ApiException:
            raise
        except Exception as err:  # noqa: BLE001 - 外部API呼び出しの失敗を一律502に変換する
            raise ApiException(502, "LLM_REQUEST_FAILED", f"LLM呼び出しに失敗しました: {err}") from err

        try:
            return json.loads(text)
        except (TypeError, ValueError) as err:
            raise ApiException(502, "LLM_BAD_RESPONSE", "LLMの応答をJSONとして解釈できませんでした。") from err

    def generate_json_from_image(self, prompt: str, image_base64: str, media_type: str) -> Any:
        if not self._api_key:
            raise ApiException(
                502,
                "LLM_UNAVAILABLE",
                "GEMINI_API_KEYが設定されていないため、LLM機能を利用できません。",
            )

        try:
            import base64

            from google import genai
            from google.genai import types

            client = genai.Client(api_key=self._api_key)
            image_bytes = base64.b64decode(image_base64)
            response = client.models.generate_content(
                model=MODEL_NAME,
                contents=[
                    types.Part.from_bytes(data=image_bytes, mime_type=media_type),
                    prompt,
                ],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                ),
            )
            text = response.text
        except ApiException:
            raise
        except Exception as err:  # noqa: BLE001
            raise ApiException(502, "LLM_REQUEST_FAILED", f"LLM呼び出しに失敗しました: {err}") from err

        try:
            return json.loads(text)
        except (TypeError, ValueError) as err:
            raise ApiException(502, "LLM_BAD_RESPONSE", "LLMの応答をJSONとして解釈できませんでした。") from err


_default_client = GeminiClient()


def get_gemini_client() -> GeminiClient:
    return _default_client
