import type { AnswerSheetStatus, Level, ProblemStatus, Role } from "@/lib/types/models";

export const ROLE_LABEL: Record<Role, string> = {
  operator: "運営者",
  teacher: "先生",
};

export const LEVEL_LABEL: Record<Level, string> = {
  A: "A",
  B: "B",
  C: "C",
};

export const DIFFICULTY_LABEL: Record<number, string> = {
  1: "難易度1",
  2: "難易度2",
  3: "難易度3",
};

export const PROBLEM_STATUS_LABEL: Record<ProblemStatus, string> = {
  draft: "下書き",
  reviewed: "確認済み",
};

export const ANSWER_SHEET_STATUS_LABEL: Record<AnswerSheetStatus, string> = {
  empty: "未入力",
  in_progress: "入力中",
  llm_draft: "LLM下書き",
  confirmed: "確定",
};

export const TEST_KIND_LABEL = {
  past: "過去テスト",
  target: "対策対象",
} as const;
