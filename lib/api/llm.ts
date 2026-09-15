import { api } from "./client";
import type {
  PrereqSuggestRequest,
  PrereqSuggestResponse,
  ProblemDraftRequest,
  ProblemDraftResponse,
  SheetDraftRequest,
  SheetDraftResponse,
  TrendDraftRequest,
  TrendDraftResponse,
} from "@/lib/types/api";

// LLM系APIは処理に時間がかかりうるため呼び出し側でローディング表示必須。
// 画像はレスポンス後に呼び出し元のstateから破棄すること（サーバー側にも保存されない）。
export const llmApi = {
  trendDraft: (body: TrendDraftRequest) =>
    api.post<TrendDraftResponse>("/llm/trend-draft", body),
  prereqSuggest: (body: PrereqSuggestRequest) =>
    api.post<PrereqSuggestResponse>("/llm/prereq-suggest", body),
  problemDraft: (body: ProblemDraftRequest) =>
    api.post<ProblemDraftResponse>("/llm/problem-draft", body),
  sheetDraft: (body: SheetDraftRequest) =>
    api.post<SheetDraftResponse>("/llm/sheet-draft", body),
};
