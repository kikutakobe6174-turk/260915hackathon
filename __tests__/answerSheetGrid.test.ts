import { describe, expect, it } from "vitest";
import {
  buildDisplayOrder,
  resolveGridKey,
  EMPTY_DRAFT,
  type AttemptDraft,
} from "@/lib/answerSheetGrid";
import type { AnswerSheetItemDetail } from "@/lib/types/api";

function item(overrides: Partial<AnswerSheetItemDetail>): AnswerSheetItemDetail {
  return {
    worksheet_item_id: 1,
    item_no: "1",
    sort_order: 1,
    problem_id: 1,
    is_return: false,
    parent_item_id: null,
    unit_id: 1,
    unit_name: "単元",
    attempt: null,
    ...overrides,
  };
}

describe("resolveGridKey", () => {
  it("O key marks correct", () => {
    const action = resolveGridKey("o", EMPTY_DRAFT);
    expect(action).toEqual({ type: "update", draft: { ...EMPTY_DRAFT, is_correct: true } });
  });

  it("X key marks incorrect", () => {
    const action = resolveGridKey("X", EMPTY_DRAFT);
    expect(action).toEqual({ type: "update", draft: { ...EMPTY_DRAFT, is_correct: false } });
  });

  it("digit keys 0-3 set the hint step", () => {
    for (const digit of ["0", "1", "2", "3"] as const) {
      const action = resolveGridKey(digit, EMPTY_DRAFT);
      expect(action).toEqual({
        type: "update",
        draft: { ...EMPTY_DRAFT, hint_step: Number(digit) },
      });
    }
  });

  it("R key toggles went_return", () => {
    const first = resolveGridKey("r", EMPTY_DRAFT);
    expect(first).toEqual({ type: "update", draft: { ...EMPTY_DRAFT, went_return: true } });

    const draftAfterFirst = (first as { type: "update"; draft: AttemptDraft }).draft;
    const second = resolveGridKey("R", draftAfterFirst);
    expect(second).toEqual({ type: "update", draft: { ...draftAfterFirst, went_return: false } });
  });

  it("C key toggles red_card", () => {
    const action = resolveGridKey("c", EMPTY_DRAFT);
    expect(action).toEqual({ type: "update", draft: { ...EMPTY_DRAFT, red_card: true } });
  });

  it("Enter and ArrowDown move to the next row", () => {
    expect(resolveGridKey("Enter", EMPTY_DRAFT)).toEqual({ type: "next" });
    expect(resolveGridKey("ArrowDown", EMPTY_DRAFT)).toEqual({ type: "next" });
  });

  it("ArrowUp moves to the previous row", () => {
    expect(resolveGridKey("ArrowUp", EMPTY_DRAFT)).toEqual({ type: "prev" });
  });

  it("ignores unrelated keys", () => {
    expect(resolveGridKey("Tab", EMPTY_DRAFT)).toEqual({ type: "none" });
    expect(resolveGridKey("a", EMPTY_DRAFT)).toEqual({ type: "none" });
  });

  it("preserves other fields already set on the draft when updating one field", () => {
    const current: AttemptDraft = {
      is_correct: true,
      hint_step: 2,
      went_return: true,
      red_card: false,
    };
    const action = resolveGridKey("c", current);
    expect(action).toEqual({
      type: "update",
      draft: { is_correct: true, hint_step: 2, went_return: true, red_card: true },
    });
  });
});

describe("buildDisplayOrder", () => {
  it("keeps main items in order when there are no return items", () => {
    const items = [item({ worksheet_item_id: 1, item_no: "1" }), item({ worksheet_item_id: 2, item_no: "2" })];
    const rows = buildDisplayOrder(items);
    expect(rows.map((r) => r.item.item_no)).toEqual(["1", "2"]);
    expect(rows.every((r) => !r.indent)).toBe(true);
  });

  it("places a return item directly after its parent, indented", () => {
    const items = [
      item({ worksheet_item_id: 1, item_no: "1", parent_item_id: null }),
      item({ worksheet_item_id: 2, item_no: "2", parent_item_id: null }),
      item({ worksheet_item_id: 3, item_no: "R-1", is_return: true, parent_item_id: 1 }),
    ];
    const rows = buildDisplayOrder(items);
    expect(rows.map((r) => r.item.item_no)).toEqual(["1", "R-1", "2"]);
    expect(rows.map((r) => r.indent)).toEqual([false, true, false]);
  });

  it("supports multiple return items under the same parent, in their original order", () => {
    const items = [
      item({ worksheet_item_id: 1, item_no: "1", parent_item_id: null }),
      item({ worksheet_item_id: 2, item_no: "R-1", is_return: true, parent_item_id: 1 }),
      item({ worksheet_item_id: 3, item_no: "R-2", is_return: true, parent_item_id: 1 }),
    ];
    const rows = buildDisplayOrder(items);
    expect(rows.map((r) => r.item.item_no)).toEqual(["1", "R-1", "R-2"]);
  });
});
