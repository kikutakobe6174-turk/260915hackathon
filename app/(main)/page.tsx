"use client";

import Link from "next/link";
import { testsApi } from "@/lib/api/tests";
import { lessonsApi } from "@/lib/api/lessons";
import { problemsApi } from "@/lib/api/problems";
import { useApiData } from "@/lib/hooks/useApiData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "@/components/ui/status";
import { Badge } from "@/components/ui/badge";
import { TEST_KIND_LABEL } from "@/lib/constants";

export default function HomePage() {
  const tests = useApiData(() => testsApi.list(), []);
  const lessons = useApiData(() => lessonsApi.list(), []);
  // LLM下書きのうち未確認のものの概況として、問題の下書き数を代表値に使う。
  // 前提単元・解答用紙の未確認件数は集計APIが未定義のため、backend確定後にダッシュボード用エンドポイントを追加予定。
  const draftProblems = useApiData(() => problemsApi.list({ status: "draft" }), []);

  const recentTests = [...(tests.data ?? [])].slice(-5).reverse();
  const recentLessons = [...(lessons.data ?? [])].slice(-5).reverse();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold text-slate-900">ホーム</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
        <StatCard
          label="未確定の解答用紙"
          value={undefined}
          loading={false}
          error={null}
          hint="授業回ごとに解答用紙一覧で確認してください"
          href="/lessons"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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

        <Card>
          <CardHeader>
            <CardTitle>直近の授業回</CardTitle>
          </CardHeader>
          <CardContent>
            {lessons.loading && <LoadingBlock />}
            {lessons.error && <ErrorBlock message={lessons.error} />}
            {!lessons.loading && !lessons.error && recentLessons.length === 0 && (
              <EmptyBlock label="登録された授業回はありません" />
            )}
            <ul className="flex flex-col divide-y divide-slate-100">
              {recentLessons.map((l) => (
                <li key={l.id} className="py-2">
                  <Link
                    href={`/lessons/${l.id}`}
                    className="flex items-center justify-between text-sm hover:underline"
                  >
                    <span>
                      {l.lesson_date} {l.class_name}
                    </span>
                    <span className="text-xs text-slate-400">
                      第{l.round}周
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
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
