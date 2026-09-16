"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { testsApi } from "@/lib/api/tests";
import { problemsApi } from "@/lib/api/problems";
import { schoolsApi, textbooksApi } from "@/lib/api/masters";
import { downloadTestPdf, downloadTestWord } from "@/lib/api/pdf";
import { useApiData } from "@/lib/hooks/useApiData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "@/components/ui/status";
import { ApiRequestError } from "@/lib/types/api";

function distribute(total: number, count: number) {
  const quotient = Math.floor(total / count);
  const remainder = total % count;
  return Array.from({ length: count }, (_, index) => quotient + (index < remainder ? 1 : 0));
}

export default function PrintPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const testId = Number(id);
  const { data: test, loading: testLoading, error: testError } = useApiData(() => testsApi.get(testId), [testId]);
  const problems = useApiData(() => problemsApi.list({ test_id: testId }), [testId]);
  const problemPoints = useApiData(() => testsApi.problemPoints(testId), [testId]);
  const schools = useApiData(() => schoolsApi.list(), []);
  const textbooks = useApiData(() => textbooksApi.list(), []);
  const [selected, setSelected] = useState<number[] | null>(null);
  const [duration, setDuration] = useState(50);
  const [totalPoints, setTotalPoints] = useState(100);
  const [downloading, setDownloading] = useState<"pdf" | "word" | "answer-pdf" | "answer-word" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const selectedIds = useMemo(
    () => selected ?? (problems.data ?? []).map((problem) => problem.id),
    [selected, problems.data]
  );

  const selectedProblems = useMemo(() => {
    const byId = new Map((problems.data ?? []).map((problem) => [problem.id, problem]));
    return selectedIds.map((problemId) => byId.get(problemId)).filter((problem) => problem !== undefined);
  }, [problems.data, selectedIds]);
  // Gemini解析で確定した実配点。1問でも欠ける場合はnullにして、従来どおり満点を等分する
  // （バックエンドのPDF・Word生成も同じ条件でフォールバックするため表示が一致する）。
  const realPoints = useMemo(() => {
    if (problemPoints.data?.source !== "analysis") return null;
    const byId = new Map(problemPoints.data.items.map((item) => [item.problem_id, item.points]));
    const values = selectedProblems.map((problem) => byId.get(problem.id));
    return values.every((value) => value !== undefined) ? (values as number[]) : null;
  }, [problemPoints.data, selectedProblems]);

  const groups = Array.from({ length: Math.ceil(selectedProblems.length / 4) }, (_, index) => selectedProblems.slice(index * 4, index * 4 + 4));
  const effectiveTotal = realPoints ? realPoints.reduce((sum, value) => sum + value, 0) : totalPoints;
  const groupPoints = realPoints
    ? groups.map((_, index) => realPoints.slice(index * 4, index * 4 + 4).reduce((sum, value) => sum + value, 0))
    : groups.length
      ? distribute(totalPoints, groups.length)
      : [];
  const schoolName = schools.data?.find((school) => school.id === test?.school_id)?.name ?? "○○高等学校";
  const subject = (textbooks.data?.find((textbook) => textbook.id === test?.textbook_id)?.title ?? "数学II").replace(/^高等学校\s*/, "");
  const title = `${test?.term ?? "2学期中間"}テスト対策問題`;

  function toggle(problemId: number) {
    setSelected((current) => {
      const values = current ?? (problems.data ?? []).map((problem) => problem.id);
      return values.includes(problemId) ? values.filter((value) => value !== problemId) : [...values, problemId];
    });
  }

  async function handleDownload(format: "pdf" | "word", includeAnswers = false) {
    if (selectedIds.length === 0) return;
    setDownloading(includeAnswers ? (`answer-${format}` as const) : format);
    setMessage(null);
    try {
      const request = { problem_ids: selectedIds, duration_minutes: duration, total_points: effectiveTotal, title, include_answers: includeAnswers };
      const filename = format === "pdf" ? await downloadTestPdf(testId, request) : await downloadTestWord(testId, request);
      setMessage(`${filename} をダウンロードしました。`);
    } catch (error) {
      setMessage(error instanceof ApiRequestError ? error.message : `${includeAnswers ? "解答解説の" : ""}${format === "pdf" ? "PDF" : "Word"}の生成に失敗しました。`);
    } finally {
      setDownloading(null);
    }
  }

  if (testLoading || problems.loading) return <LoadingBlock />;
  if (testError || problems.error) return <ErrorBlock message={testError ?? problems.error ?? "読み込みに失敗しました"} />;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href={`/tests/${testId}/bank`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" />問題バンクへ戻る</Link>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">印刷プレビュー</h2>
          <p className="mt-1 text-sm text-slate-600">左で問題を選び、学校配布用のPDFをそのまま保存できます。</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2">
          <Button size="lg" onClick={() => handleDownload("pdf")} disabled={downloading !== null || selectedIds.length === 0}><Download className="h-5 w-5" />{downloading === "pdf" ? "生成中…" : "PDFで保存"}</Button>
          <Button size="lg" variant="outline" onClick={() => handleDownload("word")} disabled={downloading !== null || selectedIds.length === 0}><Download className="h-5 w-5" />{downloading === "word" ? "生成中…" : "Wordで保存"}</Button>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => handleDownload("pdf", true)} disabled={downloading !== null || selectedIds.length === 0}><Download className="h-4 w-4" />{downloading === "answer-pdf" ? "生成中…" : "解答解説PDF"}</Button>
            <Button size="sm" variant="outline" onClick={() => handleDownload("word", true)} disabled={downloading !== null || selectedIds.length === 0}><Download className="h-4 w-4" />{downloading === "answer-word" ? "生成中…" : "解答解説Word"}</Button>
          </div>
        </div>
      </div>
      {message && <div className="border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700">{message}</div>}

      <div className="grid items-start gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="sticky top-4 border border-slate-200 bg-white p-4">
          <h3 className="font-semibold text-slate-900">PDF設定</h3>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="text-sm text-slate-600">制限時間（分）<Input className="mt-1" type="number" min={1} max={300} value={duration} onChange={(event) => setDuration(Number(event.target.value))} /></label>
            <label className="text-sm text-slate-600">満点<Input className="mt-1" type="number" min={1} max={1000} value={effectiveTotal} disabled={realPoints !== null} onChange={(event) => setTotalPoints(Number(event.target.value))} /></label>
          </div>
          {realPoints !== null && (
            <p className="mt-2 text-xs text-slate-500">満点と各大問の配点は、Gemini解析で確定した小問の配点から自動計算しています。</p>
          )}
          <div className="mt-5 flex items-center justify-between border-t border-slate-200 pt-4">
            <h3 className="font-semibold text-slate-900">問題を選ぶ</h3>
            <button className="text-xs text-blue-700 hover:underline" onClick={() => setSelected(selectedIds.length === problems.data?.length ? [] : (problems.data ?? []).map((problem) => problem.id))}>{selectedIds.length === problems.data?.length ? "すべて外す" : "すべて選ぶ"}</button>
          </div>
          <div className="mt-3 max-h-[58vh] space-y-2 overflow-y-auto pr-1">
            {(problems.data ?? []).map((problem, index) => (
              <label key={problem.id} className="flex cursor-pointer gap-2 border-b border-slate-100 pb-2 text-sm">
                <input type="checkbox" checked={selectedIds.includes(problem.id)} onChange={() => toggle(problem.id)} className="mt-1" />
                <span><span className="text-slate-500">{index + 1}. {problem.unit_name}</span><br/><span className="line-clamp-2 text-slate-900">{problem.body}</span></span>
              </label>
            ))}
          </div>
        </aside>

        {selectedProblems.length === 0 ? <EmptyBlock label="問題を選ぶと、ここに用紙が表示されます" /> : (
          <section className="mx-auto w-full max-w-[794px] bg-white px-[68px] py-[52px] text-black shadow-sm ring-1 ring-slate-200" style={{ fontFamily: '"Yu Gothic", "BIZ UDPGothic", sans-serif' }}>
            <div className="text-center text-sm">{schoolName}</div>
            <h3 className="mt-1 text-center text-xl font-semibold leading-8">{test?.grade}　{subject}<br/>{title}</h3>
            <div className="mt-5 grid grid-cols-[1fr_auto_auto] gap-6 text-sm"><span>実施日：____年__月__日</span><span>制限時間：{duration}分</span><span>満点：{effectiveTotal}点</span></div>
            <div className="mt-4 grid grid-cols-[auto_1fr_auto] gap-5 text-sm"><span>{test?.grade.replace("高", "")}年 ____組　____番</span><span>氏名 ________________________</span><span>得点 ______ / {effectiveTotal}</span></div>
            <hr className="my-6 border-black" />
            {groups.map((group, groupIndex) => (
              <div key={groupIndex} className="mb-8 break-inside-avoid">
                <div className="mb-4 flex justify-between font-semibold"><span>第{groupIndex + 1}問　次の問いに答えなさい。</span><span>〔{groupPoints[groupIndex]}点〕</span></div>
                {group.map((problem, problemIndex) => <div key={problem.id} className="mb-7"><p className="whitespace-pre-wrap text-[15px] leading-7">({problemIndex + 1})　{problem.body}{realPoints ? `　（${realPoints[groupIndex * 4 + problemIndex]}点）` : ""}</p><div className="h-16" /></div>)}
              </div>
            ))}
            <div className="mt-8 border-t border-slate-300 pt-3 text-center text-xs">実際のPDFには「1 / 2」形式のページ番号が入ります</div>
          </section>
        )}
      </div>
    </div>
  );
}
