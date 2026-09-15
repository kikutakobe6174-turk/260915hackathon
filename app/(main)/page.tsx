"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { testsApi } from "@/lib/api/tests";
import { problemsApi } from "@/lib/api/problems";
import { useApiData } from "@/lib/hooks/useApiData";
import { useAuth } from "@/contexts/AuthContext";
import { MAIN_NAV, filterNavByRole } from "@/lib/nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "@/components/ui/status";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { TEST_KIND_LABEL } from "@/lib/constants";

export default function HomePage() {
  const { user } = useAuth();
  const tests = useApiData(() => testsApi.list(), []);
  // LLM下書きのうち未確認のものの概況として、問題の下書き数を代表値に使う。
  // 前提単元・解答用紙の未確認件数は集計APIが未定義のため、backend確定後にダッシュボード用エンドポイントを追加予定。
  const draftProblems = useApiData(() => problemsApi.list({ status: "draft" }), []);

  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const matchedNav = q
    ? filterNavByRole(MAIN_NAV, user?.role ?? "teacher").filter((item) =>
        item.label.toLowerCase().includes(q)
      )
    : [];
  const matchedTests = q
    ? (tests.data ?? []).filter((t) =>
        [String(t.year), t.grade, t.term, TEST_KIND_LABEL[t.kind]]
          .join(" ")
          .toLowerCase()
          .includes(q)
      )
    : [];

  const recentTests = [...(tests.data ?? [])].slice(-5).reverse();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold text-slate-900">ホーム</h1>

      <div className="flex flex-col gap-2">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="機能やテストを検索（例: 問題作成、2024年 3年）"
            className="pl-8"
          />
        </div>

        {q && (
          <Card>
            <CardContent className="flex flex-col gap-3 p-4">
              {matchedNav.length === 0 && matchedTests.length === 0 && (
                <p className="text-sm text-slate-400">「{query}」に一致する結果はありません</p>
              )}

              {matchedNav.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-slate-500">機能</span>
                  <ul className="flex flex-col divide-y divide-slate-100">
                    {matchedNav.map((item) => (
                      <li key={item.href} className="py-1.5">
                        <Link href={item.href} className="text-sm hover:underline">
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {matchedTests.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-slate-500">テスト</span>
                  <ul className="flex flex-col divide-y divide-slate-100">
                    {matchedTests.map((t) => (
                      <li key={t.id} className="py-1.5">
                        <Link
                          href={`/tests/${t.id}/trends`}
                          className="flex items-center justify-between text-sm hover:underline"
                        >
                          <span>
                            {t.year}年 {t.grade} {t.term}
                          </span>
                          <Badge variant={t.kind === "past" ? "secondary" : "default"}>
                            {TEST_KIND_LABEL[t.kind]}
                          </Badge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          label="下書きの問題（未確認）"
          value={draftProblems.data?.length}
          loading={draftProblems.loading}
          error={draftProblems.error}
          href="/tests"
        />
        <StatCard
          label="先生未確認の前提単元"
          value={undefined}
          loading={false}
          error={null}
          hint="テストごとに前提単元マップで確認してください"
          href="/tests"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>直近のテスト</CardTitle>
        </CardHeader>
        <CardContent>
          {tests.loading && <LoadingBlock />}
          {tests.error && <ErrorBlock message={tests.error} />}
          {!tests.loading && !tests.error && recentTests.length === 0 && (
            <EmptyBlock label="登録されたテストはありません" />
          )}
          <ul className="flex flex-col divide-y divide-slate-100">
            {recentTests.map((t) => (
              <li key={t.id} className="py-2">
                <Link
                  href={`/tests/${t.id}/trends`}
                  className="flex items-center justify-between text-sm hover:underline"
                >
                  <span>
                    {t.year}年 {t.grade} {t.term}
                  </span>
                  <Badge variant={t.kind === "past" ? "secondary" : "default"}>
                    {TEST_KIND_LABEL[t.kind]}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  loading,
  error,
  hint,
  href,
}: {
  label: string;
  value: number | undefined;
  loading: boolean;
  error: string | null;
  hint?: string;
  href: string;
}) {
  return (
    <Link href={href}>
      <Card className="transition-shadow hover:shadow-md">
        <CardContent className="flex flex-col gap-1 p-4">
          <span className="text-xs text-slate-500">{label}</span>
          {loading ? (
            <span className="text-sm text-slate-400">…</span>
          ) : error ? (
            <span className="text-xs text-red-600">{error}</span>
          ) : value !== undefined ? (
            <span className="text-2xl font-semibold text-slate-900">
              {value}
            </span>
          ) : (
            <span className="text-xs text-slate-400">{hint}</span>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
