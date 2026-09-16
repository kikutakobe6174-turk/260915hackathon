import { api } from "./client";
import type { Test } from "@/lib/types/models";
import type {
  CreateTestRequest,
  PrerequisiteReviewRequest,
  PutTrendsRequest,
  PutUnitPrerequisitesRequest,
  PrerequisiteOut,
  TestPrerequisitesOut,
  TestProblemPointsOut,
  TestTrendsOut,
} from "@/lib/types/api";

export const testsApi = {
  list: (query?: { school_id?: number; kind?: string }) =>
    api.get<Test[]>("/tests", query),
  create: (body: CreateTestRequest) => api.post<Test>("/tests", body),
  get: (id: number) => api.get<Test>(`/tests/${id}`),
  problemPoints: (id: number) =>
    api.get<TestProblemPointsOut>(`/tests/${id}/problem-points`),
};

export const trendsApi = {
  get: (testId: number) => api.get<TestTrendsOut>(`/tests/${testId}/trends`),
  put: (testId: number, body: PutTrendsRequest) =>
    api.put<TestTrendsOut>(`/tests/${testId}/trends`, body),
};

export const prerequisitesApi = {
  getForTest: (testId: number) =>
    api.get<TestPrerequisitesOut>(`/tests/${testId}/prerequisites`),
  putForUnit: (unitId: number, body: PutUnitPrerequisitesRequest) =>
    api.put<PrerequisiteOut[]>(`/units/${unitId}/prerequisites`, body),
  review: (
    unitId: number,
    prerequisiteUnitId: number,
    body: PrerequisiteReviewRequest
  ) =>
    api.post<PrerequisiteOut>(
      `/units/${unitId}/prerequisites/${prerequisiteUnitId}/review`,
      body
    ),
};
