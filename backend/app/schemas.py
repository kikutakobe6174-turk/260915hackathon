from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict

Role = Literal["operator", "teacher"]
TestKind = Literal["past", "target"]
Level = Literal["A", "B", "C"]
Difficulty = Literal[1, 2, 3]
HintStep = Literal[0, 1, 2, 3]
SourceType = Literal["manual", "llm"]
ProblemStatus = Literal["draft", "reviewed"]
AnswerSheetStatus = Literal["empty", "in_progress", "llm_draft", "confirmed"]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---- 認証 ----


class LoginRequest(BaseModel):
    login_id: str
    password: str


class LoginResponseUser(BaseModel):
    id: int
    name: str
    role: Role


class LoginResponse(BaseModel):
    user: LoginResponseUser


# ---- CSV取込共通 ----


class ImportRowError(BaseModel):
    row: int
    message: str


class ImportResult(BaseModel):
    created: int
    errors: list[ImportRowError]


# ---- 単元・マスタ ----


class School(ORMModel):
    id: int
    name: str


class SchoolCreate(BaseModel):
    name: str


class Textbook(ORMModel):
    id: int
    publisher: str
    title: str
    subject: str


class TextbookCreate(BaseModel):
    publisher: str
    title: str
    subject: str


class Format(ORMModel):
    id: int
    name: str


class FormatCreate(BaseModel):
    name: str


class Unit(ORMModel):
    id: int
    textbook_id: int
    name: str
    order_no: int


class UnitCreateRequest(BaseModel):
    name: str
    order_no: int


class UnitUpdateRequest(UnitCreateRequest):
    pass


class UnitImportRow(BaseModel):
    name: str
    order_no: int


class UnitImportRequest(BaseModel):
    rows: list[UnitImportRow]


# ---- 生徒 ----


class Student(ORMModel):
    id: int
    student_code: str
    school_id: int
    grade: str
    level: Level
    active: bool


class StudentCreateRequest(BaseModel):
    student_code: str
    school_id: int
    grade: str
    level: Level
    active: bool


class StudentUpdateRequest(StudentCreateRequest):
    pass


class StudentImportRow(BaseModel):
    student_code: str
    school_name: str
    grade: str
    level: Level


class StudentImportRequest(BaseModel):
    rows: list[StudentImportRow]


# ---- テスト ----


class Test(ORMModel):
    id: int
    school_id: int
    textbook_id: int
    year: int
    grade: str
    term: str
    kind: TestKind
    image_discarded_at: Optional[datetime] = None
    unit_ids: list[int]


class CreateTestRequest(BaseModel):
    school_id: int
    textbook_id: int
    year: int
    grade: str
    term: str
    kind: TestKind
    unit_ids: list[int]


# ---- 出題傾向 ----


class TrendItemIn(BaseModel):
    id: Optional[int] = None
    unit_id: Optional[int] = None
    format_id: int
    question_no: str
    points: int
    difficulty: Difficulty
    source: SourceType
    llm_job_id: Optional[int] = None


class PutTrendsRequest(BaseModel):
    user_id: int
    items: list[TrendItemIn]


class TrendItemOut(BaseModel):
    id: int
    test_id: int
    unit_id: Optional[int]
    unit_name: Optional[str]
    format_id: int
    format_name: str
    question_no: str
    points: int
    difficulty: Difficulty
    source: SourceType
    llm_job_id: Optional[int]
    reviewed: bool
    reviewed_by: Optional[int]
    reviewed_at: Optional[datetime]


class UnitTrendSummary(BaseModel):
    unit_id: int
    unit_name: str
    question_count: int
    point_ratio: float


class TestTrendsOut(BaseModel):
    test_id: int
    items: list[TrendItemOut]
    summary: list[UnitTrendSummary]


# ---- 前提単元 ----


class PrerequisiteItemIn(BaseModel):
    prerequisite_unit_id: int
    reason: Optional[str] = None
    source: SourceType = "manual"
    llm_job_id: Optional[int] = None


class PutUnitPrerequisitesRequest(BaseModel):
    user_id: int
    items: list[PrerequisiteItemIn]


class PrerequisiteReviewRequest(BaseModel):
    user_id: int
    confirmed: bool
    teacher_note: Optional[str] = None


class PrerequisiteOut(BaseModel):
    unit_id: int
    prerequisite_unit_id: int
    prerequisite_unit_name: str
    reason: Optional[str]
    teacher_note: Optional[str]
    source: SourceType
    llm_job_id: Optional[int]
    confirmed: bool
    reviewed_by: Optional[int]
    reviewed_at: Optional[datetime]


class UnitPrerequisiteGroup(BaseModel):
    unit_id: int
    unit_name: str
    confirmed: bool
    prerequisites: list[PrerequisiteOut]


class TestPrerequisitesOut(BaseModel):
    test_id: int
    units: list[UnitPrerequisiteGroup]


# ---- 問題 ----


class ProblemInRequest(BaseModel):
    unit_id: int
    format_id: int
    difficulty: Difficulty
    body: str
    answer: str
    explanation: Optional[str] = None
    is_return: bool
    hints: tuple[str, str, str]
    prerequisite_unit_ids: list[int]
    source: SourceType = "manual"
    llm_job_id: Optional[int] = None


class HintOut(BaseModel):
    step: Literal[1, 2, 3]
    body: str


class ProblemOut(BaseModel):
    id: int
    unit_id: int
    unit_name: str
    format_id: int
    format_name: str
    difficulty: Difficulty
    body: str
    answer: str
    explanation: Optional[str]
    is_return: bool
    status: ProblemStatus
    source: SourceType
    llm_job_id: Optional[int]
    reviewed_by: Optional[int]
    reviewed_at: Optional[datetime]
    hints: list[HintOut]
    prerequisite_unit_ids: list[int]
    prerequisites_missing_return: list[int]


class ProblemReviewRequest(BaseModel):
    user_id: int


class ProblemListQuery(BaseModel):
    unit_id: Optional[int] = None
    format_id: Optional[int] = None
    difficulty: Optional[int] = None
    status: Optional[ProblemStatus] = None
    is_return: Optional[bool] = None


# ---- 問題バンク ----


class CoverageCell(BaseModel):
    unit_id: int
    format_id: int
    difficulty: Difficulty
    required: int
    reviewed: int
    draft: int


class CoverageOut(BaseModel):
    multiplier: int
    cells: list[CoverageCell]
    return_missing_unit_ids: list[int]


class ProblemStatsItem(BaseModel):
    problem_id: int
    attempts: int
    correct_no_hint: int
    correct_by_hint: dict[str, int]
    wrong_after_hint3: int
    correct_by_round: dict[str, int]
    flags: list[str]


class ProblemStatsOut(BaseModel):
    items: list[ProblemStatsItem]


# ---- 冊子 ----


class WorksheetItemIn(BaseModel):
    problem_id: int
    is_return: bool
    parent_index: Optional[int] = None


class WorksheetCreateRequest(BaseModel):
    level: Level
    items: list[WorksheetItemIn]


class WorksheetItemOut(BaseModel):
    id: int
    item_no: str
    sort_order: int
    problem_id: int
    is_return: bool
    parent_item_id: Optional[int]


class WorksheetOut(BaseModel):
    id: int
    test_id: int
    level: Level
    version: int
    printed_at: Optional[datetime]
    locked: bool
    items: list[WorksheetItemOut]


# ---- 授業回・解答用紙一覧 ----


class CreateLessonRequest(BaseModel):
    test_id: int
    lesson_date: date
    class_name: str
    round: int


class Lesson(ORMModel):
    id: int
    test_id: int
    lesson_date: date
    class_name: str
    round: int


class AnswerSheetListItem(BaseModel):
    id: int
    student_id: int
    student_code: str
    school_name: str
    worksheet_id: int
    worksheet_level: Level
    status: AnswerSheetStatus
    red_card_count: int


class AnswerSheetAssignmentIn(BaseModel):
    student_id: int
    worksheet_id: int


class CreateAnswerSheetsRequest(BaseModel):
    assignments: list[AnswerSheetAssignmentIn]


# ---- 解答記録 ----


class AttemptOut(BaseModel):
    is_correct: bool
    hint_step: HintStep
    went_return: bool
    red_card: bool
    memo: Optional[str]


class AnswerSheetItemDetail(BaseModel):
    worksheet_item_id: int
    item_no: str
    sort_order: int
    problem_id: int
    is_return: bool
    parent_item_id: Optional[int]
    unit_id: int
    unit_name: str
    attempt: Optional[AttemptOut]


class AnswerSheetDetail(BaseModel):
    id: int
    student_id: int
    student_code: str
    lesson_id: int
    worksheet_id: int
    status: AnswerSheetStatus
    source: SourceType
    llm_job_id: Optional[int]
    confirmed_by: Optional[int]
    confirmed_at: Optional[datetime]
    round: int
    items: list[AnswerSheetItemDetail]


class AttemptIn(BaseModel):
    worksheet_item_id: int
    is_correct: bool
    hint_step: HintStep
    went_return: bool
    red_card: bool
    memo: Optional[str] = None


class AttemptsPutRequest(BaseModel):
    attempts: list[AttemptIn]


class AttemptWarning(BaseModel):
    worksheet_item_id: int
    code: Literal["RETURN_BLANK", "CORRECT_WITH_RED_CARD", "RETURN_CORRECT_WITH_RED_CARD"]
    message: str


class AttemptsPutResponse(BaseModel):
    saved: int
    warnings: list[AttemptWarning]


class ConfirmAnswerSheetRequest(BaseModel):
    user_id: int


class ConfirmAnswerSheetResponse(BaseModel):
    answer_sheet: AnswerSheetDetail
    next_answer_sheet_id: Optional[int]


# ---- LLM ----


class TrendDraftRequest(BaseModel):
    test_id: int
    user_id: int
    image_base64: str
    media_type: str


class TrendDraftItemOut(BaseModel):
    question_no: str
    unit_id: Optional[int]
    format_id: Optional[int]
    points: int
    difficulty: Difficulty
    confidence: float


class TrendDraftResponse(BaseModel):
    job_id: int
    image_discarded: bool
    items: list[TrendDraftItemOut]


class PrereqSuggestRequest(BaseModel):
    unit_id: int
    user_id: int


class PrereqSuggestionOut(BaseModel):
    prerequisite_unit_id: int
    reason: str


class PrereqSuggestResponse(BaseModel):
    job_id: int
    suggestions: list[PrereqSuggestionOut]


class ProblemDraftRequest(BaseModel):
    unit_id: int
    format_id: int
    difficulty: Difficulty
    prerequisite_unit_ids: list[int]
    is_return: bool
    count: int
    user_id: int


class ProblemDraftHintOut(BaseModel):
    step: int
    body: str


class ProblemDraftItemOut(BaseModel):
    body: str
    answer: str
    explanation: str
    hints: list[ProblemDraftHintOut]
    prerequisite_unit_ids: list[int]


class ProblemDraftResponse(BaseModel):
    job_id: int
    drafts: list[ProblemDraftItemOut]


class SheetDraftRequest(BaseModel):
    answer_sheet_id: int
    user_id: int
    image_base64: str
    media_type: str


class SheetDraftRowOut(BaseModel):
    item_no: str
    worksheet_item_id: Optional[int]
    is_correct: bool
    hint_step: HintStep
    went_return: bool
    red_card: bool
    confidence: float


class SheetDraftResponse(BaseModel):
    job_id: int
    image_discarded: bool
    rows: list[SheetDraftRowOut]


# ---- LLM新規: 傾向ベース作問 ----


class TrendProblemDraftTarget(BaseModel):
    test_id: int
    unit_id: int


class TrendProblemDraftRequest(BaseModel):
    user_id: int
    targets: list[TrendProblemDraftTarget]


class TrendProblemDraftItemOut(BaseModel):
    test_id: int
    unit_id: int
    format_id: int
    difficulty: Difficulty
    body: str
    answer: str
    explanation: str
    hints: list[ProblemDraftHintOut]
    prerequisite_unit_ids: list[int]


class TrendProblemDraftResponse(BaseModel):
    job_id: int
    drafts: list[TrendProblemDraftItemOut]
