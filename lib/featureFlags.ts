/**
 * MVPデモで見せない機能の一覧。
 *
 * ここに挙げた画面は「バックエンドAPIが未実装のため操作するとエラーになる」ものだけで、
 * ページ・ルート・APIクライアントのコードはすべて残してある。復活させたいときは
 * バックエンドの対応エンドポイントを実装したうえで、この配列から該当パスを外すだけでよい。
 */
export const UNAVAILABLE_ROUTES = [
  // 授業回（/lessons, /lessons/{id}/answer-sheets が未実装）
  "/lessons",
  // 解答用紙・採点記録（/answer-sheets/* が未実装）
  "/answer-sheets",
  // マスタ管理の編集系（一覧のGETはあるが POST/PUT/DELETE/import が未実装）
  "/masters",
] as const;

/** 問題編集画面のLLM下書き生成（/llm/problem-draft が未実装）。 */
export const LLM_PROBLEM_DRAFT_AVAILABLE = false;

export function isUnavailableRoute(pathname: string): boolean {
  return UNAVAILABLE_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}
