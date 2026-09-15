import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Suspense } from "react";
import AnswerSheetPage from "@/app/(main)/answer-sheets/[id]/page";
import type { AnswerSheetDetail } from "@/lib/types/api";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: 1, name: "運営 太郎", role: "operator" } }),
}));

const mockGet = vi.fn();
const mockPutAttempts = vi.fn();
const mockConfirm = vi.fn();

vi.mock("@/lib/api/answerSheets", () => ({
  answerSheetsApi: {
    get: (...args: unknown[]) => mockGet(...args),
    putAttempts: (...args: unknown[]) => mockPutAttempts(...args),
    confirm: (...args: unknown[]) => mockConfirm(...args),
  },
}));

vi.mock("@/lib/api/llm", () => ({
  llmApi: { sheetDraft: vi.fn() },
}));

const sheetFixture: AnswerSheetDetail = {
  id: 2,
  student_id: 2,
  student_code: "S0002",
  lesson_id: 1,
  worksheet_id: 1,
  status: "in_progress",
  source: "manual",
  llm_job_id: null,
  confirmed_by: null,
  confirmed_at: null,
  round: 1,
  items: [
    {
      worksheet_item_id: 501,
      item_no: "1",
      sort_order: 1,
      problem_id: 1,
      is_return: false,
      parent_item_id: null,
      unit_id: 3,
      unit_name: "一次方程式",
      attempt: null,
    },
  ],
};

async function renderPage() {
  await act(async () => {
    render(
      <Suspense fallback="loading">
        <AnswerSheetPage params={Promise.resolve({ id: "2" })} />
      </Suspense>
    );
    // paramsのPromise解決とuseApiDataの初回フェッチが両方flushされるまでmicrotaskを回す。
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("AnswerSheetPage keyboard input", () => {
  beforeEach(() => {
    mockGet.mockReset().mockResolvedValue(sheetFixture);
    mockPutAttempts.mockReset().mockResolvedValue({ saved: 1, warnings: [] });
    mockConfirm.mockReset();
  });

  it("marks a row correct with O and saves the attempt via 途中保存", async () => {
    const user = userEvent.setup();
    await renderPage();

    await screen.findByText("一次方程式");

    await user.keyboard("o");
    await user.keyboard("2");

    await user.click(screen.getByRole("button", { name: "途中保存" }));

    expect(mockPutAttempts).toHaveBeenCalledWith(2, {
      attempts: [
        {
          worksheet_item_id: 501,
          is_correct: true,
          hint_step: 2,
          went_return: false,
          red_card: false,
          memo: undefined,
        },
      ],
    });
  });

  it("shows the contradiction warning returned by the server after saving", async () => {
    mockPutAttempts.mockResolvedValue({
      saved: 1,
      warnings: [
        {
          worksheet_item_id: 501,
          code: "CORRECT_WITH_RED_CARD",
          message: "正解なのに赤カードが立っています",
        },
      ],
    });

    const user = userEvent.setup();
    await renderPage();

    await screen.findByText("一次方程式");

    await user.keyboard("o");
    await user.keyboard("c");
    await user.click(screen.getByRole("button", { name: "途中保存" }));

    expect(await screen.findByText(/正解なのに赤カードが立っています/)).toBeInTheDocument();
  });

  it("does not allow editing once the sheet is confirmed", async () => {
    mockGet.mockResolvedValue({ ...sheetFixture, status: "confirmed" });
    const user = userEvent.setup();
    await renderPage();

    await screen.findByText("一次方程式");
    expect(screen.getByRole("button", { name: "途中保存" })).toBeDisabled();

    await user.keyboard("o");
    expect(mockPutAttempts).not.toHaveBeenCalled();
  });
});
