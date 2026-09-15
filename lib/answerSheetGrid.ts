import type { AnswerSheetItemDetail } from "@/lib/types/api";
import type { HintStep } from "@/lib/types/models";

export interface DisplayRow {
  item: AnswerSheetItemDetail;
  indent: boolean;
}

// 戻り問題の欄を元の問題の直後に字下げして表示するための並び替え。
export function buildDisplayOrder(items: AnswerSheetItemDetail[]): DisplayRow[] {
  const byParent = new Map<number, AnswerSheetItemDetail[]>();
  const mains: AnswerSheetItemDetail[] = [];
  for (const it of items) {
    if (it.parent_item_id !== null) {
      const list = byParent.get(it.parent_item_id) ?? [];
      list.push(it);
      byParent.set(it.parent_item_id, list);
    } else {
      mains.push(it);
    }
  }
  const result: DisplayRow[] = [];
  for (const m of mains) {
    result.push({ item: m, indent: false });
    for (const child of byParent.get(m.worksheet_item_id) ?? []) {
      result.push({ item: child, indent: true });
    }
  }
  return result;
}

export interface AttemptDraft {
  is_correct?: boolean;
  hint_step: HintStep;
  went_return: boolean;
  red_card: boolean;
  memo?: string | null;
}

export const EMPTY_DRAFT: AttemptDraft = { hint_step: 0, went_return: false, red_card: false };

export type GridKeyAction =
  | { type: "update"; draft: AttemptDraft }
  | { type: "next" }
  | { type: "prev" }
  | { type: "none" };

// 解答用紙入力のキーボード操作（O/X=正誤, 0-3=ヒント段階, R=戻り, C=赤カード, Enter/↓=次の行, ↑=前の行）を
// 純粋関数として切り出し、単体テストしやすくしている。
export function resolveGridKey(key: string, current: AttemptDraft): GridKeyAction {
  if (key === "o" || key === "O") {
    return { type: "update", draft: { ...current, is_correct: true } };
  }
  if (key === "x" || key === "X") {
    return { type: "update", draft: { ...current, is_correct: false } };
  }
  if (key === "0" || key === "1" || key === "2" || key === "3") {
    return { type: "update", draft: { ...current, hint_step: Number(key) as HintStep } };
  }
  if (key === "r" || key === "R") {
    return { type: "update", draft: { ...current, went_return: !current.went_return } };
  }
  if (key === "c" || key === "C") {
    return { type: "update", draft: { ...current, red_card: !current.red_card } };
  }
  if (key === "Enter" || key === "ArrowDown") {
    return { type: "next" };
  }
  if (key === "ArrowUp") {
    return { type: "prev" };
  }
  return { type: "none" };
}

export function draftFromExisting(items: AnswerSheetItemDetail[]): Record<number, AttemptDraft> {
  const map: Record<number, AttemptDraft> = {};
  for (const it of items) {
    map[it.worksheet_item_id] = it.attempt
      ? {
          is_correct: it.attempt.is_correct,
          hint_step: it.attempt.hint_step,
          went_return: it.attempt.went_return,
          red_card: it.attempt.red_card,
          memo: it.attempt.memo,
        }
      : { hint_step: 0, went_return: false, red_card: false };
  }
  return map;
}
