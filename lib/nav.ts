import type { Role } from "@/lib/types/models";

export interface NavItem {
  label: string;
  href: string;
  roles: Role[];
  // true のものはメインフローではないため「その他」の中にだけ表示する。
  secondary?: boolean;
}

// メインフロー（資料入力 → 分析 → 生成 → プレビュー → PDF/Word保存）だけを常時表示する。
export const MAIN_NAV: NavItem[] = [
  { label: "ホーム", href: "/", roles: ["operator", "teacher"] },
  { label: "過去問分析", href: "/tests", roles: ["operator", "teacher"] },
  { label: "問題バンク", href: "/problem-bank", roles: ["operator", "teacher"] },
];

// 「その他」を開いたときだけ見える管理機能。削除はせず奥へ置く。
export const SECONDARY_NAV: NavItem[] = [
  { label: "授業回一覧", href: "/lessons", roles: ["operator", "teacher"], secondary: true },
  { label: "学校マスタ", href: "/masters/schools", roles: ["operator"], secondary: true },
  { label: "教科書・単元マスタ", href: "/masters/textbooks", roles: ["operator"], secondary: true },
  { label: "形式マスタ", href: "/masters/formats", roles: ["operator"], secondary: true },
  { label: "生徒マスタ", href: "/masters/students", roles: ["operator"], secondary: true },
];

// テスト詳細内のタブ。secondary のものは「その他」に畳む。
export function testTabs(testId: number): NavItem[] {
  return [
    {
      label: "出題傾向・問題生成",
      href: `/tests/${testId}/trends`,
      roles: ["operator"],
    },
    {
      label: "問題バンク",
      href: `/tests/${testId}/bank`,
      roles: ["operator", "teacher"],
    },
    {
      label: "前提単元マップ",
      href: `/tests/${testId}/prerequisites`,
      roles: ["operator", "teacher"],
      secondary: true,
    },
    {
      label: "冊子構成",
      href: `/tests/${testId}/worksheets`,
      roles: ["operator"],
      secondary: true,
    },
  ];
}

export const MASTERS_NAV: NavItem[] = [
  { label: "学校", href: "/masters/schools", roles: ["operator"] },
  { label: "教科書・単元", href: "/masters/textbooks", roles: ["operator"] },
  { label: "形式", href: "/masters/formats", roles: ["operator"] },
  { label: "生徒", href: "/masters/students", roles: ["operator"] },
];

export function filterNavByRole(items: NavItem[], role: Role): NavItem[] {
  return items.filter((item) => item.roles.includes(role));
}
