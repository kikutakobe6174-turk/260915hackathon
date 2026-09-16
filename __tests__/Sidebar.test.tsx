import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sidebar } from "@/components/layout/Sidebar";
import { SECONDARY_NAV } from "@/lib/nav";
import { isUnavailableRoute } from "@/lib/featureFlags";

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
  it("メインフローの導線だけを表示する", () => {
    render(<Sidebar />);

    expect(screen.getByRole("link", { name: /ホーム/ })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /過去問分析/ })).toHaveAttribute("href", "/tests");
    expect(screen.getByRole("link", { name: /問題バンク/ })).toHaveAttribute("href", "/problem-bank");
  });

  it("バックエンド未実装の画面はメニューに出さない", () => {
    render(<Sidebar />);

    // デモ中に誤って開くとエラーになる画面は、どこからもクリックできない
    for (const label of ["授業回一覧", "学校マスタ", "教科書・単元マスタ", "形式マスタ", "生徒マスタ"]) {
      expect(screen.queryByRole("link", { name: label })).not.toBeInTheDocument();
    }
    // 出せる項目が1つも無いので「その他」自体を表示しない
    expect(screen.queryByRole("button", { name: /その他/ })).not.toBeInTheDocument();
  });

  it("「その他」に出す候補はフラグ側で判定している（機能自体は削除していない）", () => {
    // ナビ定義は残っており、featureFlags を外せばそのまま復活する
    expect(SECONDARY_NAV.length).toBeGreaterThan(0);
    expect(SECONDARY_NAV.every((item) => isUnavailableRoute(item.href))).toBe(true);
  });
});
