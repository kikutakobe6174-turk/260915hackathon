import { api } from "./client";
import type { Lesson } from "@/lib/types/models";
import type {
  AnswerSheetListItem,
  CreateAnswerSheetsRequest,
  CreateLessonRequest,
} from "@/lib/types/api";

export const lessonsApi = {
  list: (query?: { test_id?: number }) => api.get<Lesson[]>("/lessons", query),
  create: (body: CreateLessonRequest) => api.post<Lesson>("/lessons", body),
  listAnswerSheets: (lessonId: number) =>
    api.get<AnswerSheetListItem[]>(`/lessons/${lessonId}/answer-sheets`),
  createAnswerSheets: (lessonId: number, body: CreateAnswerSheetsRequest) =>
    api.post<AnswerSheetListItem[]>(`/lessons/${lessonId}/answer-sheets`, body),
};
