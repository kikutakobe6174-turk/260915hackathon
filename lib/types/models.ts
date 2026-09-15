// バックエンド（kikut/260915hackathon-back, FastAPI/Pydantic）のスキーマに合わせたドメイン型。
// 各Outスキーマのフィールド名と一致させている（app/schemas/*.py参照）。

export type Role = "operator" | "teacher";

export type TestKind = "past" | "target";

export type Level = "A" | "B" | "C";

export type Difficulty = 1 | 2 | 3;

export type HintStep = 0 | 1 | 2 | 3;

export type Source = "manual" | "llm";

export type ProblemStatus = "draft" | "reviewed";

export type AnswerSheetStatus =
  | "empty"
  | "in_progress"
  | "llm_draft"
  | "confirmed";

export interface LoginResponseUser {
  id: number;
  name: string;
  role: Role;
}

export interface School {
  id: number;
  name: string;
}

export interface Textbook {
  id: number;
  publisher: string;
  title: string;
  subject: string;
}

export interface Unit {
  id: number;
  textbook_id: number;
  name: string;
  order_no: number;
}

export interface Format {
  id: number;
  name: string;
}

export interface Student {
  id: number;
  student_code: string;
  school_id: number;
  grade: string;
  level: Level;
  active: boolean;
}

export interface Test {
  id: number;
  school_id: number;
  textbook_id: number;
  year: number;
  grade: string;
  term: string;
  kind: TestKind;
  image_discarded_at: string | null;
  unit_ids: number[];
}

export interface Lesson {
  id: number;
  test_id: number;
  lesson_date: string;
  class_name: string;
  round: number;
}
