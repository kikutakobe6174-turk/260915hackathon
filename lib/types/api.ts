// APIリクエスト/レスポンス専用の型。
// kikut/260915hackathon-back（FastAPI）の app/schemas/*.py と1:1で対応させている。
// 変更する場合は必ずbackendのスキーマ側も確認すること。

import type {
  AnswerSheetStatus,
  Difficulty,
  HintStep,
  Level,
  Role,
  TestKind,
} from "./models";

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

export class ApiRequestError extends Error {
  code: string;
  status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
  }
}

// ---- 認証 ----

export interface LoginRequest {
  login_id: string;
  password: string;
}

export interface LoginResponse {
  user: { id: number; name: string; role: Role };
}

// ---- CSV取込共通 ----

export interface ImportRowError {
  row: number;
  message: string;
}

export interface ImportResult {
  created: number;
  errors: ImportRowError[];
}

// ---- 単元 ----

export interface UnitImportRow {
  name: string;
  order_no: number;
}

export interface UnitCreateRequest {
  name: string;
  order_no: number;
}

export type UnitUpdateRequest = UnitCreateRequest;

// ---- 生徒 ----

export interface StudentCreateRequest {
  student_code: string;
  school_id: number;
  grade: string;
  level: Level;
  active: boolean;
}

export type StudentUpdateRequest = StudentCreateRequest;

export interface StudentImportRow {
  student_code: string;
  school_name: string;
  grade: string;
  level: Level;
}

// ---- テスト ----

export interface CreateTestRequest {
  school_id: number;
  textbook_id: number;
  year: number;
  grade: string;
  term: string;
  kind: TestKind;
  unit_ids: number[];
}

// ---- 出題傾向 ----

export interface TrendItemIn {
  id?: number | null;
  unit_id: number | null;
  format_id: number;
  question_no: string;
  points: number;
  difficulty: Difficulty;
  source: "manual" | "llm";
  llm_job_id?: number | null;
}

export interface PutTrendsRequest {
  user_id: number;
  items: TrendItemIn[];
}

export interface TrendItemOut {
  id: number;
  test_id: number;
  unit_id: number | null;
  unit_name: string | null;
  format_id: number;
  format_name: string;
  question_no: string;
  points: number;
  difficulty: Difficulty;
  source: "manual" | "llm";
  llm_job_id: number | null;
  reviewed: boolean;
  reviewed_by: number | null;
  reviewed_at: string | null;
}

export interface UnitTrendSummary {
  unit_id: number;
  unit_name: string;
  question_count: number;
  point_ratio: number;
}

export interface TestTrendsOut {
  test_id: number;
  items: TrendItemOut[];
  summary: UnitTrendSummary[];
}

// ---- 前提単元 ----

export interface PrerequisiteItemIn {
  prerequisite_unit_id: number;
  reason?: string | null;
  source?: "manual" | "llm";
  llm_job_id?: number | null;
}

export interface PutUnitPrerequisitesRequest {
  user_id: number;
  items: PrerequisiteItemIn[];
}

export interface PrerequisiteReviewRequest {
  user_id: number;
  confirmed: boolean;
  teacher_note?: string | null;
}

export interface PrerequisiteOut {
  unit_id: number;
  prerequisite_unit_id: number;
  prerequisite_unit_name: string;
  reason: string | null;
  teacher_note: string | null;
  source: "manual" | "llm";
  llm_job_id: number | null;
  confirmed: boolean;
  reviewed_by: number | null;
  reviewed_at: string | null;
}

export interface UnitPrerequisiteGroup {
  unit_id: number;
  unit_name: string;
  confirmed: boolean;
  prerequisites: PrerequisiteOut[];
}

export interface TestPrerequisitesOut {
  test_id: number;
  units: UnitPrerequisiteGroup[];
}

// ---- 問題 ----

export interface ProblemInRequest {
  unit_id: number;
  format_id: number;
  difficulty: Difficulty;
  body: string;
  answer: string;
  explanation?: string | null;
  is_return: boolean;
  hints: [string, string, string]; // ちょうど3段
  prerequisite_unit_ids: number[];
  source?: "manual" | "llm";
  llm_job_id?: number | null;
}

export interface HintOut {
  step: 1 | 2 | 3;
  body: string;
}

export interface ProblemOut {
  id: number;
  unit_id: number;
  unit_name: string;
  format_id: number;
  format_name: string;
  difficulty: Difficulty;
  body: string;
  answer: string;
  explanation: string | null;
  is_return: boolean;
  status: "draft" | "reviewed";
  source: "manual" | "llm";
  llm_job_id: number | null;
  reviewed_by: number | null;
  reviewed_at: string | null;
  hints: HintOut[];
  prerequisite_unit_ids: number[];
  prerequisites_missing_return: number[];
}

export interface ProblemReviewRequest {
  user_id: number;
}

export interface ProblemListQuery {
  unit_id?: number;
  format_id?: number;
  difficulty?: number;
  status?: "draft" | "reviewed";
  is_return?: boolean;
}

// ---- 問題バンク ----

export interface CoverageCell {
  unit_id: number;
  format_id: number;
  difficulty: Difficulty;
  required: number;
  reviewed: number;
  draft: number;
}

export interface CoverageOut {
  multiplier: number;
  cells: CoverageCell[];
  return_missing_unit_ids: number[];
}

export interface ProblemStatsItem {
  problem_id: number;
  attempts: number;
  correct_no_hint: number;
  correct_by_hint: Record<string, number>;
  wrong_after_hint3: number;
  correct_by_round: Record<string, number>;
  flags: string[];
}

export interface ProblemStatsOut {
  items: ProblemStatsItem[];
}

export interface ProblemStatsQuery {
  test_id?: number;
  round?: number;
  level?: Level;
}

// ---- 冊子 ----

export interface WorksheetItemIn {
  problem_id: number;
  is_return: boolean;
  parent_index?: number | null; // このリクエストのitems配列内でのインデックス
}

export interface WorksheetCreateRequest {
  level: Level;
  items: WorksheetItemIn[];
}

export interface WorksheetItemOut {
  id: number;
  item_no: string; // 例 "7" または "R-2"
  sort_order: number;
  problem_id: number;
  is_return: boolean;
  parent_item_id: number | null;
}

export interface WorksheetOut {
  id: number;
  test_id: number;
  level: Level;
  version: number;
  printed_at: string | null;
  locked: boolean;
  items: WorksheetItemOut[];
}

// ---- 授業回・解答用紙一覧 ----

export interface CreateLessonRequest {
  test_id: number;
  lesson_date: string; // YYYY-MM-DD
  class_name: string;
  round: number;
}

export interface AnswerSheetListItem {
  id: number;
  student_id: number;
  student_code: string;
  school_name: string;
  worksheet_id: number;
  worksheet_level: Level;
  status: AnswerSheetStatus;
  red_card_count: number;
}

export interface AnswerSheetAssignmentIn {
  student_id: number;
  worksheet_id: number;
}

export interface CreateAnswerSheetsRequest {
  assignments: AnswerSheetAssignmentIn[];
}

// ---- 解答記録 ----

export interface AttemptOut {
  is_correct: boolean;
  hint_step: HintStep;
  went_return: boolean;
  red_card: boolean;
  memo: string | null;
}

export interface AnswerSheetItemDetail {
  worksheet_item_id: number;
  item_no: string;
  sort_order: number;
  problem_id: number;
  is_return: boolean;
  parent_item_id: number | null;
  unit_id: number;
  unit_name: string;
  attempt: AttemptOut | null;
}

export interface AnswerSheetDetail {
  id: number;
  student_id: number;
  student_code: string;
  lesson_id: number;
  worksheet_id: number;
  status: AnswerSheetStatus;
  source: "manual" | "llm";
  llm_job_id: number | null;
  confirmed_by: number | null;
  confirmed_at: string | null;
  round: number;
  items: AnswerSheetItemDetail[];
}

export interface AttemptIn {
  worksheet_item_id: number;
  is_correct: boolean;
  hint_step: HintStep;
  went_return: boolean;
  red_card: boolean;
  memo?: string | null;
}

export interface AttemptsPutRequest {
  attempts: AttemptIn[];
}

export type AttemptWarningCode =
  | "RETURN_BLANK"
  | "CORRECT_WITH_RED_CARD"
  | "RETURN_CORRECT_WITH_RED_CARD";

export interface AttemptWarning {
  worksheet_item_id: number;
  code: AttemptWarningCode;
  message: string;
}

export interface AttemptsPutResponse {
  saved: number;
  warnings: AttemptWarning[];
}

export interface ConfirmAnswerSheetRequest {
  user_id: number;
}

export interface ConfirmAnswerSheetResponse {
  answer_sheet: AnswerSheetDetail;
  next_answer_sheet_id: number | null;
}

// ---- LLM ----

export interface TrendDraftRequest {
  test_id: number;
  user_id: number;
  image_base64: string;
  media_type: string;
}

export interface TrendDraftItemOut {
  question_no: string;
  unit_id: number | null;
  format_id: number | null;
  points: number;
  difficulty: Difficulty;
  confidence: number;
}

export interface TrendDraftResponse {
  job_id: number;
  image_discarded: boolean;
  items: TrendDraftItemOut[];
}

export interface PrereqSuggestRequest {
  unit_id: number;
  user_id: number;
}

export interface PrereqSuggestionOut {
  prerequisite_unit_id: number;
  reason: string;
}

export interface PrereqSuggestResponse {
  job_id: number;
  suggestions: PrereqSuggestionOut[];
}

export interface ProblemDraftRequest {
  unit_id: number;
  format_id: number;
  difficulty: Difficulty;
  prerequisite_unit_ids: number[];
  is_return: boolean;
  count: number;
  user_id: number;
}

export interface ProblemDraftHintOut {
  step: number;
  body: string;
}

export interface ProblemDraftItemOut {
  body: string;
  answer: string;
  explanation: string;
  hints: ProblemDraftHintOut[];
  prerequisite_unit_ids: number[];
}

export interface ProblemDraftResponse {
  job_id: number;
  drafts: ProblemDraftItemOut[];
}

// ---- 出題傾向ベースの作問 ----

export interface TrendProblemDraftTarget {
  test_id: number;
  unit_id: number;
}

export interface TrendProblemDraftRequest {
  user_id: number;
  targets: TrendProblemDraftTarget[];
}

export interface TrendProblemDraftItemOut {
  test_id: number;
  unit_id: number;
  format_id: number;
  difficulty: Difficulty;
  body: string;
  answer: string;
  explanation: string;
  hints: ProblemDraftHintOut[];
  prerequisite_unit_ids: number[];
}

export interface TrendProblemDraftResponse {
  job_id: number;
  drafts: TrendProblemDraftItemOut[];
}

export interface SheetDraftRequest {
  answer_sheet_id: number;
  user_id: number;
  image_base64: string;
  media_type: string;
}

export interface SheetDraftRowOut {
  item_no: string;
  worksheet_item_id: number | null;
  is_correct: boolean;
  hint_step: HintStep;
  went_return: boolean;
  red_card: boolean;
  confidence: number;
}

export interface SheetDraftResponse {
  job_id: number;
  image_discarded: boolean;
  rows: SheetDraftRowOut[];
}
