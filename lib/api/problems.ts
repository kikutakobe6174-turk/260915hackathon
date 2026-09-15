import { api } from "./client";
import type {
  ProblemInRequest,
  ProblemListQuery,
  ProblemOut,
  ProblemReviewRequest,
} from "@/lib/types/api";

export const problemsApi = {
  list: (query?: ProblemListQuery) => api.get<ProblemOut[]>("/problems", query),
  create: (body: ProblemInRequest) => api.post<ProblemOut>("/problems", body),
  get: (id: number) => api.get<ProblemOut>(`/problems/${id}`),
  update: (id: number, body: ProblemInRequest) =>
    api.put<ProblemOut>(`/problems/${id}`, body),
  review: (id: number, body: ProblemReviewRequest) =>
    api.post<ProblemOut>(`/problems/${id}/review`, body),
};
