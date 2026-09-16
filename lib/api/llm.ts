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
  TrendDraftUpdateRequest,
  JobActionRequest,
  GenerationJobResponse,
  SaveGenerationRequest,
  SaveGenerationResponse,
} from "@/lib/types/api";

// LLM系APIは処理に時間がかかりうるため呼び出し側でローディング表示必須。
// 画像はレスポンス後に呼び出し元のstateから破棄すること（サーバー側にも保存されない）。
export const llmApi = {
  trendDraft: (body: TrendDraftRequest) =>
    api.post<TrendDraftResponse>("/llm/trend-draft", body),
  getTrendDraft: (jobId: number) =>
    api.get<TrendDraftResponse>(`/llm/trend-drafts/${jobId}`),
  updateTrendDraft: (jobId: number, body: TrendDraftUpdateRequest) =>
    api.put<TrendDraftResponse>(`/llm/trend-drafts/${jobId}`, body),
  confirmTrendDraft: (jobId: number, body: JobActionRequest) =>
    api.post<TrendDraftResponse>(`/llm/trend-drafts/${jobId}/confirm`, body),
  generateFromTrend: (jobId: number, body: JobActionRequest) =>
    api.post<GenerationJobResponse>(`/llm/trend-drafts/${jobId}/generate`, body),
  updateProblemBatch: (jobId: number, body: SaveGenerationRequest) =>
    api.put<GenerationJobResponse>(`/llm/problem-batches/${jobId}`, body),
  saveProblemBatch: (jobId: number, body: SaveGenerationRequest) =>
    api.post<SaveGenerationResponse>(`/llm/problem-batches/${jobId}/save`, body),
  prereqSuggest: (body: PrereqSuggestRequest) =>
    api.post<PrereqSuggestResponse>("/llm/prereq-suggest", body),
  problemDraft: (body: ProblemDraftRequest) =>
    api.post<ProblemDraftResponse>("/llm/problem-draft", body),
  sheetDraft: (body: SheetDraftRequest) =>
    api.post<SheetDraftResponse>("/llm/sheet-draft", body),
};
