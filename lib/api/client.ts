import { ApiRequestError, type ApiError } from "@/lib/types/api";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export type QueryValue = string | number | boolean | undefined | null;
// クエリ用の型は各API定義側で自由な形の interface を渡せるよう object を受ける。
export type QueryParams = object;

function buildUrl(path: string, query?: QueryParams) {
  const url = new URL(
    path.startsWith("/") ? path.slice(1) : path,
    API_BASE_URL.endsWith("/") ? API_BASE_URL : `${API_BASE_URL}/`
  );
  if (query) {
    for (const [key, value] of Object.entries(query as Record<string, QueryValue>)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function request<T>(
  path: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    body?: unknown;
    query?: QueryParams;
    signal?: AbortSignal;
  } = {}
): Promise<T> {
  const { method = "GET", body, query, signal } = options;

  let res: Response;
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch {
    throw new ApiRequestError(
      0,
      "NETWORK_ERROR",
      "サーバーに接続できませんでした。バックエンドが起動しているか確認してください。"
    );
  }

  if (res.status === 204) {
    return undefined as T;
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (!res.ok) {
    const err = json as ApiError | null;
    throw new ApiRequestError(
      res.status,
      err?.error?.code ?? "UNKNOWN_ERROR",
      err?.error?.message ?? `リクエストに失敗しました（${res.status}）`
    );
  }

  return json as T;
}

export const api = {
  get: <T>(path: string, query?: QueryParams, signal?: AbortSignal) =>
    request<T>(path, { method: "GET", query, signal }),
  post: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    request<T>(path, { method: "POST", body, signal }),
  put: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    request<T>(path, { method: "PUT", body, signal }),
  delete: <T>(path: string, signal?: AbortSignal) =>
    request<T>(path, { method: "DELETE", signal }),
};

export { API_BASE_URL };
