"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpenCheck, BrainCircuit, CheckCircle2, FileText, Printer, UploadCloud } from "lucide-react";
import { testsApi } from "@/lib/api/tests";
import { useApiData } from "@/lib/hooks/useApiData";
import { setPendingTestUpload } from "@/lib/pendingTestUpload";
import { cn } from "@/lib/utils";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const STEPS = [
  { title: "資料を入力", description: "PDF・画像をアップロード", icon: FileText },
  { title: "問題を分析", description: "難しさ・単元・形式を整理", icon: BrainCircuit },
  { title: "問題を生成", description: "分析結果から対策問題を作成", icon: BookOpenCheck },
  { title: "PDF / Wordで保存", description: "確認後すぐに教材化", icon: Printer },
] as const;

export default function HomePage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const tests = useApiData(() => testsApi.list(), []);
  const recentTests = (tests.data ?? []).slice(0, 4);
  const [selectedTestId, setSelectedTestId] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [preparedUpload, setPreparedUpload] = useState<{ base64: string; mediaType: string; dataUrl: string; fileName: string } | null>(null);

  const activeTestId = selectedTestId ?? recentTests[0]?.id ?? null;

  function handleFile(file: File | undefined) {
    if (!file) return;
    if (!activeTestId) {
      setUploadError("分析先のテストを選択してください。");
      return;
    }
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setUploadError("JPEG・PNG・WebP・PDF形式のファイルを選択してください。");
      return;
    }
    setPreparing(true);
    setUploadError(null);
    const reader = new FileReader();
    reader.onerror = () => {
      setPreparing(false);
      setUploadError("画像を読み込めませんでした。別の画像でもう一度お試しください。");
    };
    reader.onload = () => {
      const dataUrl = String(reader.result);
      setPreparedUpload({ base64: dataUrl.split(",")[1] ?? "", mediaType: file.type, dataUrl, fileName: file.name });
      setPreparing(false);
    };
    reader.readAsDataURL(file);
  }

  function startAnalysis() {
    if (!preparedUpload || !activeTestId) return;
    setPendingTestUpload({ testId: activeTestId, ...preparedUpload });
    router.push(`/tests/${activeTestId}/trends`);
  }

  const selectedTest = recentTests.find((test) => test.id === activeTestId);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 pb-6">
      <section className="pt-2 text-center">
        <p className="mb-2 text-sm font-semibold tracking-wide text-blue-600">資料から対策問題を作成</p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">学校別 定期テスト対策を作成</h1>
        <p className="mx-auto mt-3 max-w-2xl text-base leading-7 text-slate-600">
          定期テストの資料を入れて分析し、対策問題をPDFまたはWordで保存できます。
        </p>
      </section>

      <section className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm sm:p-6">
        <div
          role="button"
          tabIndex={0}
          aria-label="過去問のファイルを選択"
          onClick={() => fileRef.current?.click()}
          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") fileRef.current?.click(); }}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={(event) => { event.preventDefault(); setDragging(false); }}
          onDrop={(event) => { event.preventDefault(); setDragging(false); handleFile(event.dataTransfer.files[0]); }}
          className={cn(
            "flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
            dragging ? "border-blue-500 bg-blue-50" : "border-blue-200 bg-blue-50/40 hover:border-blue-400 hover:bg-blue-50"
          )}
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm"><UploadCloud className="h-8 w-8" /></span>
          <h2 className="mt-5 text-2xl font-bold text-slate-950">{preparing ? "資料を読み込んでいます…" : "定期テストの資料をアップロード"}</h2>
          <p className="mt-2 text-sm text-slate-600">ドラッグ＆ドロップ、またはクリックしてファイルを選択</p>
          <p className="mt-3 rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-500 ring-1 ring-slate-200">PDF / JPEG / PNG / WebP</p>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(event) => { handleFile(event.target.files?.[0]); event.target.value = ""; }} />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm">
          <label htmlFor="analysis-test" className="font-medium text-slate-600">分析するテスト</label>
          {recentTests.length > 0 ? (
            <select id="analysis-test" value={activeTestId ?? ""} onChange={(event) => setSelectedTestId(Number(event.target.value))} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
              {recentTests.map((test) => <option key={test.id} value={test.id}>{test.year}年 {test.grade} {test.term}</option>)}
            </select>
          ) : !tests.loading ? (
            <Link href="/tests/new" className="font-semibold text-blue-700 hover:underline">先にテスト情報を登録</Link>
          ) : <span className="text-slate-400">読み込み中…</span>}
          {selectedTest && <span className="text-slate-400">へ解析結果を保存します</span>}
        </div>
        {uploadError && <p role="alert" className="mt-3 text-center text-sm font-medium text-red-600">{uploadError}</p>}
        {preparedUpload && (
          <div className="mx-auto mt-5 flex max-w-2xl flex-col items-center gap-4 border-t border-slate-200 pt-5 sm:flex-row sm:justify-between">
            <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-slate-700"><CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /><span className="truncate">{preparedUpload.fileName}</span></p>
            <button onClick={startAnalysis} className="w-full rounded-lg bg-blue-600 px-8 py-3 text-base font-bold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:w-auto">分析する <ArrowRight className="ml-2 inline h-4 w-4" /></button>
          </div>
        )}
      </section>

      <section aria-label="利用の流れ">
        <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            return (
              <li key={step.title} className="relative flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><Icon className="h-5 w-5" /></span>
                <div><p className="text-sm font-bold text-slate-900">{index + 1}. {step.title}</p><p className="mt-0.5 text-xs leading-5 text-slate-500">{step.description}</p></div>
                {index < STEPS.length - 1 && <ArrowRight className="absolute -right-2.5 z-10 hidden h-5 w-5 rounded-full bg-white text-blue-300 lg:block" />}
              </li>
            );
          })}
        </ol>
      </section>

      <details className="border-t border-slate-200 pt-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-500 hover:text-blue-700">その他の機能・過去のテストを見る</summary>
      <section aria-labelledby="recent-heading" className="mt-5">
        <div className="mb-3 flex items-end justify-between">
          <div><h2 id="recent-heading" className="text-lg font-bold text-slate-950">最近のテスト</h2><p className="mt-1 text-sm text-slate-500">続きから分析結果を確認できます</p></div>
          <Link href="/tests" className="text-sm font-semibold text-blue-700 hover:text-blue-900">すべて見る</Link>
        </div>
        {tests.loading && <div className="h-28 animate-pulse rounded-xl bg-slate-200" />}
        {!tests.loading && tests.error && <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">テスト一覧を読み込めませんでした。FastAPIが起動しているか確認してください。</p>}
        {!tests.loading && !tests.error && recentTests.length === 0 && <Link href="/tests/new" className="flex min-h-28 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-sm font-semibold text-blue-700">最初のテストを登録する</Link>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {recentTests.map((test) => (
            <Link key={test.id} href={`/tests/${test.id}/trends`} className="group rounded-xl border border-slate-200 bg-white p-4 transition hover:border-blue-300 hover:shadow-sm">
              <span className="text-xs font-semibold text-blue-600">{test.kind === "past" ? "過去テスト" : "対策テスト"}</span>
              <h3 className="mt-2 text-base font-bold text-slate-900">{test.year}年 {test.grade}</h3>
              <p className="mt-1 text-sm text-slate-600">{test.term}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 group-hover:text-blue-700">分析結果を見る <ArrowRight className="h-3.5 w-3.5" /></span>
            </Link>
          ))}
        </div>
      </section>
      </details>
    </div>
  );
}
