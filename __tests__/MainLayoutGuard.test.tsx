import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import MainLayout from "@/app/(main)/layout";

const pathname = { value: "/" };

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: 1, name: "運営担当", role: "operator" },
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));
vi.mock("@/components/layout/Header", () => ({ Header: () => <header /> }));
vi.mock("@/components/layout/Sidebar", () => ({ Sidebar: () => <nav /> }));

beforeEach(() => {
  pathname.value = "/";
});

describe("MainLayout の未実装機能ガード", () => {
  it.each([
    "/lessons",
    "/lessons/3",
    "/answer-sheets/7",
    "/masters/schools",
    "/masters/students",
    "/masters/textbooks/1/units",
  ])("%s へ直接来ても404/500ではなく準備中を出す", (route) => {
    pathname.value = route;
    render(
      <MainLayout>
        <div>本来のページ内容</div>
      </MainLayout>
    );

    expect(screen.getByRole("heading", { name: "この機能は現在準備中です" })).toBeInTheDocument();
    expect(screen.queryByText("本来のページ内容")).not.toBeInTheDocument();
    // メインフローへ戻れる導線がある
    expect(screen.getByRole("link", { name: "ホームへ戻る" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "過去問分析へ" })).toHaveAttribute("href", "/tests");
  });

  it.each([
    "/",
    "/tests",
    "/tests/2/trends",
    "/tests/2/print-preview",
    "/tests/2/prerequisites",
    "/tests/2/worksheets",
    "/problem-bank",
    "/problems/new",
  ])("%s は通常どおり表示する", (route) => {
    pathname.value = route;
    render(
      <MainLayout>
        <div>本来のページ内容</div>
      </MainLayout>
    );

    expect(screen.getByText("本来のページ内容")).toBeInTheDocument();
    expect(screen.queryByText("この機能は現在準備中です")).not.toBeInTheDocument();
  });
});
