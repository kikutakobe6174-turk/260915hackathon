import type { Role } from "@/lib/types/models";

export interface NavItem {
  label: string;
  href: string;
  roles: Role[];
}

// トップレベルのナビゲーション。teacher には MASTER・TEST_NEW 系を見せない。
export const MAIN_NAV: NavItem[] = [
  { label: "ホーム", href: "/", roles: ["operator", "teacher"] },
  { label: "マスタ管理", href: "/masters/schools", roles: ["operator"] },
  { label: "テスト一覧", href: "/tests", roles: ["operator", "teacher"] },
  { label: "授業回一覧", href: "/lessons", roles: ["operator", "teacher"] },
  {
    label: "問題作成（過去問の傾向から）",
    href: "/problems/from-trends",
    roles: ["operator", "teacher"],
  },
];

// テスト詳細内のタブ。TRENDS・WS はteacher非表示。
export function testTabs(testId: number): NavItem[] {
  return [
    {
      label: "出題傾向",
      href: `/tests/${testId}/trends`,
      roles: ["operator"],
    },
    {
      label: "前提単元マップ",
      href: `/tests/${testId}/prerequisites`,
      roles: ["operator", "teacher"],
    },
    {
      label: "問題バンク",
      href: `/tests/${testId}/bank`,
      roles: ["operator", "teacher"],
    },
    {
      label: "冊子構成",
      href: `/tests/${testId}/worksheets`,
      roles: ["operator"],
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
