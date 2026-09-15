import { api } from "./client";
import type { CoverageOut, ProblemStatsOut, ProblemStatsQuery } from "@/lib/types/api";

export const bankApi = {
  coverage: (testId: number) => api.get<CoverageOut>(`/tests/${testId}/coverage`),
  stats: (query: ProblemStatsQuery) =>
    api.get<ProblemStatsOut>("/problems/stats", query),
};
