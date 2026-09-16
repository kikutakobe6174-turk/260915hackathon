"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { FileText, Plus, Search } from "lucide-react";
import { testsApi } from "@/lib/api/tests";
import { problemsApi } from "@/lib/api/problems";
import { useApiData } from "@/lib/hooks/useApiData";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "@/components/ui/status";

export default function BankPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const testId = Number(id);
  const [query, setQuery] = useState("");
  const { data: test } = useApiData(() => testsApi.get(testId), [testId]);
  const problems = useApiData(() => problemsApi.list({ test_id: testId }), [testId]);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return problems.data ?? [];
    return (problems.data ?? []).filter((problem) =>
      [problem.body, problem.unit_name, problem.format_name].some((value) =>
        value.toLowerCase().includes(normalized)
      )
    );
  }, [problems.data, query]);
  const reviewed = (problems.data ?? []).filter((problem) => problem.status === "reviewed").length;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-5">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">問題バンク</h2>
          <p className="mt-1 text-sm text-slate-600">このテストから作成した問題を確認し、印刷用の問題を選べます。</p>
          <p className="mt-2 text-sm text-slate-500">{test?.term ?? "対象テスト"}・全{problems.data?.length ?? 0}問・確認済み{reviewed}問</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/problems/new?test_id=${testId}`}><Plus className="h-4 w-4" />問題を追加</Link>
          </Button>
          <Button asChild>
            <Link href={`/tests/${testId}/print-preview`}><FileText className="h-4 w-4" />印刷プレビュー・PDF出力</Link>
          </Button>
        </div>
      </div>

      <label className="relative block max-w-xl">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="問題文・単元・形式で検索" className="pl-9" />
      </label>

      {problems.loading && <LoadingBlock />}
      {problems.error && <ErrorBlock message={problems.error} />}
      {!problems.loading && !problems.error && visible.length === 0 && (
        <EmptyBlock label={query ? "条件に合う問題がありません" : "このテストの問題はまだありません"} />
      )}
      <div className="divide-y divide-slate-200 border-y border-slate-200 bg-white">
        {visible.map((problem, index) => (
          <article key={problem.id} className="grid gap-3 px-4 py-5 md:grid-cols-[3rem_1fr_auto]">
            <span className="pt-0.5 text-sm tabular-nums text-slate-400">{index + 1}</span>
            <div className="min-w-0">
              <p className="whitespace-pre-wrap text-[15px] leading-7 text-slate-950">{problem.body}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>{problem.unit_name}</span><span>・</span><span>{problem.format_name}</span><span>・</span><span>難易度 {problem.difficulty}</span>
                <Badge variant={problem.status === "reviewed" ? "success" : "secondary"}>{problem.status === "reviewed" ? "確認済み" : "下書き"}</Badge>
              </div>
            </div>
            <Link href={`/problems/${problem.id}`} className="text-sm font-medium text-blue-700 hover:underline">編集</Link>
          </article>
        ))}
      </div>
    </div>
  );
}
