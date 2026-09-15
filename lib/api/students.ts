import { api } from "./client";
import type { Student } from "@/lib/types/models";
import type {
  ImportResult,
  StudentCreateRequest,
  StudentImportRow,
  StudentUpdateRequest,
} from "@/lib/types/api";

export const studentsApi = {
  list: (query?: { school_id?: number; active?: boolean }) =>
    api.get<Student[]>("/students", query),
  create: (body: StudentCreateRequest) => api.post<Student>("/students", body),
  update: (id: number, body: StudentUpdateRequest) =>
    api.put<Student>(`/students/${id}`, body),
  remove: (id: number) => api.delete<void>(`/students/${id}`),
  import: (rows: StudentImportRow[]) =>
    api.post<ImportResult>("/students/import", { rows }),
};
