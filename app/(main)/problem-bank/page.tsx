"use client";

import Link from "next/link";
import { ArrowRight, Library } from "lucide-react";
import { testsApi } from "@/lib/api/tests";
import { useApiData } from "@/lib/hooks/useApiData";

export default function ProblemBankIndexPage() {
  const tests = useApiData(() => testsApi.list(), []);
  const items = tests.data ?? [];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <p className="text-sm font-semibold text-blue-600">問題バンク</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-950">テストごとの対策問題</h1>
        <p className="mt-2 text-sm text-slate-600">確認・編集するテストを選択してください。</p>
      </div>
      {tests.loading && <div className="h-28 animate-pulse rounded-xl bg-slate-200" />}
      {!tests.loading && tests.error && <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">問題バンクを読み込めませんでした。FastAPIが起動しているか確認してください。</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((test) => (
          <Link key={test.id} href={`/tests/${test.id}/bank`} className="group rounded-xl border border-slate-200 bg-white p-5 hover:border-blue-300 hover:shadow-sm">
            <Library className="h-5 w-5 text-blue-600" />
            <h2 className="mt-4 font-bold text-slate-900">{test.year}年 {test.grade}</h2>
            <p className="mt-1 text-sm text-slate-600">{test.term}</p>
            <span className="mt-5 inline-flex items-center gap-1 text-xs font-semibold text-blue-700">問題を見る <ArrowRight className="h-3.5 w-3.5" /></span>
          </Link>
        ))}
      </div>
    </div>
  );
}
