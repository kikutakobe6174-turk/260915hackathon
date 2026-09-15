import { api } from "./client";

// 単純なCRUDマスタ（学校・形式など）向けの共通ファクトリ。
export function makeCrudApi<
  T,
  TCreate = Partial<T>,
  TUpdate = Partial<T>
>(resource: string) {
  return {
    list: () => api.get<T[]>(`/${resource}`),
    create: (body: TCreate) => api.post<T>(`/${resource}`, body),
    update: (id: number, body: TUpdate) =>
      api.put<T>(`/${resource}/${id}`, body),
    remove: (id: number) => api.delete<void>(`/${resource}/${id}`),
  };
}
