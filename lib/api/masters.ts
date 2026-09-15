import { api } from "./client";
import { makeCrudApi } from "./crud";
import type { Format, School, Textbook, Unit } from "@/lib/types/models";
import type {
  ImportResult,
  UnitCreateRequest,
  UnitImportRow,
  UnitUpdateRequest,
} from "@/lib/types/api";

export const schoolsApi = makeCrudApi<School>("schools");
export const textbooksApi = makeCrudApi<Textbook>("textbooks");
export const formatsApi = makeCrudApi<Format>("formats");

export const unitsApi = {
  list: (textbookId: number) =>
    api.get<Unit[]>(`/textbooks/${textbookId}/units`),
  create: (textbookId: number, body: UnitCreateRequest) =>
    api.post<Unit>(`/textbooks/${textbookId}/units`, body),
  update: (unitId: number, body: UnitUpdateRequest) =>
    api.put<Unit>(`/units/${unitId}`, body),
  remove: (unitId: number) => api.delete<void>(`/units/${unitId}`),
  import: (textbookId: number, rows: UnitImportRow[]) =>
    api.post<ImportResult>(`/textbooks/${textbookId}/units/import`, {
      rows,
    }),
};
