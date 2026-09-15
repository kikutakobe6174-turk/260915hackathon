import { api } from "./client";
import type { WorksheetCreateRequest, WorksheetOut } from "@/lib/types/api";

export const worksheetsApi = {
  listForTest: (testId: number) =>
    api.get<WorksheetOut[]>(`/tests/${testId}/worksheets`),
  create: (testId: number, body: WorksheetCreateRequest) =>
    api.post<WorksheetOut>(`/tests/${testId}/worksheets`, body),
  get: (id: number) => api.get<WorksheetOut>(`/worksheets/${id}`),
  // levelは既存冊子から変更不可。解答記録がある冊子はbackendが409を返す（新版を作る必要あり）。
  update: (id: number, body: WorksheetCreateRequest) =>
    api.put<WorksheetOut>(`/worksheets/${id}`, body),
};
