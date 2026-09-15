"use client";

import { use } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { testsApi } from "@/lib/api/tests";
import { schoolsApi, textbooksApi } from "@/lib/api/masters";
import { useApiData } from "@/lib/hooks/useApiData";
import { useAuth } from "@/contexts/AuthContext";
import { testTabs, filterNavByRole } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { TEST_KIND_LABEL } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";

export default function TestLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const testId = Number(id);
  const { user } = useAuth();
  const pathname = usePathname();

  const { data: test } = useApiData(() => testsApi.get(testId), [testId]);
  const schools = useApiData(() => schoolsApi.list(), []);
  const textbooks = useApiData(() => textbooksApi.list(), []);

  const tabs = user ? filterNavByRole(testTabs(testId), user.role) : [];
  const schoolName = test ? schools.data?.find((s) => s.id === test.school_id)?.name : undefined;
  const textbookTitle = test
    ? textbooks.data?.find((t) => t.id === test.textbook_id)?.title
    : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/tests" className="text-sm text-slate-500 hover:text-slate-800">
          ← テスト一覧へ戻る
        </Link>
        {test && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold text-slate-900">
              {test.year}年 {schoolName} {test.grade} {test.term}
            </h1>
            <Badge variant={test.kind === "past" ? "secondary" : "default"}>
              {TEST_KIND_LABEL[test.kind]}
            </Badge>
            {textbookTitle && (
              <span className="text-xs text-slate-400">{textbookTitle}</span>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {tabs.map((tab) => {
          const active = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "border-b-2 px-3 py-2 text-sm font-medium",
                active
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
