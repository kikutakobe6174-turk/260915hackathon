import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import HomePage from "@/app/(main)/page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/api/tests", () => ({
  testsApi: {
    list: vi.fn().mockResolvedValue([
      { id: 2, school_id: 2, textbook_id: 2, year: 2026, grade: "高1", term: "1学期中間", kind: "past", image_discarded_at: null, unit_ids: [] },
      { id: 1, school_id: 1, textbook_id: 1, year: 2026, grade: "中2", term: "2学期中間", kind: "past", image_discarded_at: null, unit_ids: [] },
    ]),
  },
}));

describe("HomePage", () => {
  it("過去問から対策問題を作る流れを最優先で表示する", async () => {
    render(<HomePage />);

    expect(screen.getByRole("heading", { name: "学校別 定期テスト対策を作成" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "過去問のファイルを選択" })).toBeInTheDocument();
    expect(screen.getByText("PDF / JPEG / PNG / WebP")).toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toHaveAttribute("accept", expect.stringContaining("application/pdf"));
    expect(screen.getByText(/問題を分析/)).toBeInTheDocument();
    expect(screen.getByText(/PDF \/ Wordで保存/)).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /2026年 高1 1学期中間/ })).toHaveAttribute("href", "/tests/2/trends");
    expect(screen.queryByText(/下書きの問題/)).not.toBeInTheDocument();
    expect(screen.queryByText(/404/)).not.toBeInTheDocument();
  });
});
