from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


Difficulty = Literal[1, 2, 3]


class TrendItem(BaseModel):
    question_no: str = Field(min_length=1, max_length=40)
    unit_id: int = Field(gt=0)
    format_id: int = Field(gt=0)
    points: int = Field(gt=0, le=1000)
    difficulty: Difficulty
    confidence: float = Field(ge=0, le=1)

    @field_validator("question_no")
    @classmethod
    def strip_question_no(cls, value: str) -> str:
        return value.strip()


class TrendAnalysis(BaseModel):
    total_points: int = Field(gt=0, le=10000)
    items: list[TrendItem] = Field(min_length=1, max_length=200)

    @model_validator(mode="after")
    def points_must_match(self):
        if sum(item.points for item in self.items) != self.total_points:
            raise ValueError("小問の配点合計がtotal_pointsと一致しません")
        if len({item.question_no for item in self.items}) != len(self.items):
            raise ValueError("小問番号が重複しています")
        return self


class TrendDraftRequest(BaseModel):
    test_id: int = Field(gt=0)
    user_id: int = Field(gt=0)
    image_base64: str = Field(min_length=16)
    media_type: Literal["image/jpeg", "image/png", "image/webp", "application/pdf"]


class TrendDraftResponse(BaseModel):
    job_id: int
    image_discarded: bool = True
    status: str = "draft"
    total_points: int
    items: list[TrendItem]
    fallback_mode: Literal["quota_template"] | None = None
    notice: str | None = None


class TrendDraftUpdate(BaseModel):
    user_id: int = Field(gt=0)
    total_points: int = Field(gt=0)
    items: list[TrendItem] = Field(min_length=1)

    @model_validator(mode="after")
    def points_must_match(self):
        if sum(item.points for item in self.items) != self.total_points:
            raise ValueError("小問の配点合計が総配点と一致しません")
        return self


class JobAction(BaseModel):
    user_id: int = Field(gt=0)


class GeneratedProblem(BaseModel):
    id: int | None = None
    unit_id: int = Field(gt=0)
    format_id: int = Field(gt=0)
    difficulty: Difficulty
    body: str = Field(min_length=1)
    answer: str = Field(min_length=1)
    explanation: str = Field(min_length=1)
    hints: list[str] = Field(min_length=3, max_length=3)

    @field_validator("body", "answer", "explanation")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("空の問題・正答・解説は保存できません")
        return value

    @field_validator("hints")
    @classmethod
    def validate_hints(cls, value: list[str]) -> list[str]:
        cleaned = [hint.strip() for hint in value]
        if any(not hint for hint in cleaned):
            raise ValueError("ヒントは3段すべて必要です")
        return cleaned


class GeminiGeneratedProblem(BaseModel):
    unit_id: int = Field(gt=0)
    format_id: int = Field(gt=0)
    difficulty: Difficulty
    body: str = Field(min_length=1)
    answer: str = Field(min_length=1)
    explanation: str = Field(min_length=1)
    hints: list[str] = Field(min_length=3, max_length=3)


class GenerationPayload(BaseModel):
    problems: list[GeneratedProblem] = Field(min_length=1, max_length=200)


class GenerationJobResponse(BaseModel):
    job_id: int
    analysis_job_id: int
    status: str
    problems: list[GeneratedProblem]
    fallback_mode: Literal["quota_template"] | None = None
    notice: str | None = None


class SaveGenerationRequest(BaseModel):
    user_id: int = Field(gt=0)
    problems: list[GeneratedProblem] = Field(min_length=1)


class LoginRequest(BaseModel):
    login_id: str
    password: str


class TestCreate(BaseModel):
    school_id: int
    textbook_id: int
    year: int
    grade: str
    term: str
    kind: Literal["past", "target"]
    unit_ids: list[int] = []


class TrendPutItem(BaseModel):
    id: int | None = None
    unit_id: int
    format_id: int
    question_no: str
    points: int = Field(gt=0)
    difficulty: Difficulty
    confidence: float | None = Field(default=None, ge=0, le=1)
    source: Literal["manual", "llm"]
    llm_job_id: int | None = None


class TrendPutRequest(BaseModel):
    user_id: int
    items: list[TrendPutItem]


class ProblemCreate(BaseModel):
    unit_id: int
    format_id: int
    difficulty: Difficulty
    body: str = Field(min_length=1)
    answer: str = Field(min_length=1)
    explanation: str | None = None
    is_return: bool = False
    hints: list[str] = Field(min_length=3, max_length=3)
    prerequisite_unit_ids: list[int] = []
    source: Literal["manual", "llm"] = "manual"
    llm_job_id: int | None = None


class GeminiTrendOutput(BaseModel):
    total_points: int
    items: list[TrendItem]


class GeminiProblemOutput(BaseModel):
    problems: list[GeminiGeneratedProblem]


class PrerequisiteItem(BaseModel):
    prerequisite_unit_id: int = Field(gt=0)
    reason: str | None = None
    source: Literal["manual", "llm"] = "manual"
    llm_job_id: int | None = None


class PrerequisitePutRequest(BaseModel):
    user_id: int = Field(gt=0)
    items: list[PrerequisiteItem]


class PrerequisiteReviewRequest(BaseModel):
    user_id: int = Field(gt=0)
    confirmed: bool
    teacher_note: str | None = None


class WorksheetItemIn(BaseModel):
    problem_id: int = Field(gt=0)
    is_return: bool = False
    parent_index: int | None = Field(default=None, ge=0)


class WorksheetCreateRequest(BaseModel):
    level: Literal["A", "B", "C"]
    items: list[WorksheetItemIn]


class PdfExportRequest(BaseModel):
    problem_ids: list[int] = Field(min_length=1, max_length=100)
    duration_minutes: int = Field(default=50, ge=1, le=300)
    total_points: int = Field(default=100, ge=1, le=1000)
    title: str | None = Field(default=None, max_length=80)


class GenerationExportRequest(BaseModel):
    duration_minutes: int = Field(default=50, ge=1, le=300)
    total_points: int = Field(default=100, ge=1, le=1000)
    title: str | None = Field(default=None, max_length=80)
