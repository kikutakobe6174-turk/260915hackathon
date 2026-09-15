import { api } from "./client";
import type {
  AnswerSheetDetail,
  AttemptsPutRequest,
  AttemptsPutResponse,
  ConfirmAnswerSheetRequest,
  ConfirmAnswerSheetResponse,
} from "@/lib/types/api";

export const answerSheetsApi = {
  get: (id: number) => api.get<AnswerSheetDetail>(`/answer-sheets/${id}`),
  putAttempts: (id: number, body: AttemptsPutRequest) =>
    api.put<AttemptsPutResponse>(`/answer-sheets/${id}/attempts`, body),
  confirm: (id: number, body: ConfirmAnswerSheetRequest) =>
    api.post<ConfirmAnswerSheetResponse>(`/answer-sheets/${id}/confirm`, body),
};
