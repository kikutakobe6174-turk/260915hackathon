import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sidebar } from "@/components/layout/Sidebar";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: 1, name: "運営担当", role: "operator" },
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

describe("Sidebar", () => {
  it("メインフローの導線だけを常時表示する", () => {
    render(<Sidebar />);

    expect(screen.getByRole("link", { name: /ホーム/ })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /過去問分析/ })).toHaveAttribute("href", "/tests");
    expect(screen.getByRole("link", { name: /問題バンク/ })).toHaveAttribute("href", "/problem-bank");

    // 管理機能は初期表示では見えない（塾講師がメイン機能以外に気を取られないため）
    expect(screen.queryByRole("link", { name: "学校マスタ" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "授業回一覧" })).not.toBeInTheDocument();
  });

  it("「その他」を押すと管理機能が出る（削除ではなく格納されている）", async () => {
    const user = userEvent.setup();
    render(<Sidebar />);

    const toggle = screen.getByRole("button", { name: /その他/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    expect(screen.getByRole("link", { name: "授業回一覧" })).toHaveAttribute("href", "/lessons");
    expect(screen.getByRole("link", { name: "学校マスタ" })).toHaveAttribute("href", "/masters/schools");
    expect(screen.getByRole("link", { name: "教科書・単元マスタ" })).toHaveAttribute("href", "/masters/textbooks");
    expect(screen.getByRole("link", { name: "形式マスタ" })).toHaveAttribute("href", "/masters/formats");
    expect(screen.getByRole("link", { name: "生徒マスタ" })).toHaveAttribute("href", "/masters/students");
  });
});
