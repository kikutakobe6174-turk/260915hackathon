"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, Download, FileText, Plus, RotateCcw, Sparkles, Trash2, Upload } from "lucide-react";
import { testsApi, trendsApi } from "@/lib/api/tests";
import { unitsApi, formatsApi, schoolsApi, textbooksApi } from "@/lib/api/masters";
import { llmApi } from "@/lib/api/llm";
import { downloadGenerationPdf, downloadGenerationWord } from "@/lib/api/pdf";
import { useApiData } from "@/lib/hooks/useApiData";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "@/components/ui/status";
import { CameraCapture } from "@/components/camera/CameraCapture";
import { ApiRequestError, type GeneratedProblemDraft, type TrendItemOut } from "@/lib/types/api";
import type { Difficulty } from "@/lib/types/models";
import { consumePendingTestUpload } from "@/lib/pendingTestUpload";

interface EditableRow {
  key: string; id?: number; unit_id: number | null; format_id: number;
  question_no: string; points: number; difficulty: Difficulty;
  source: "manual" | "llm"; llm_job_id?: number | null; confidence?: number | null;
}
interface CapturedImage { base64: string; mediaType: string; dataUrl: string; fileName?: string }

let tempKeySeq = 0;
const tempKey = () => `new-${++tempKeySeq}`;
function toEditable(items: TrendItemOut[]): EditableRow[] {
  return items.map((item) => ({ key: `existing-${item.id}`, id: item.id, unit_id: item.unit_id,
    format_id: item.format_id, question_no: item.question_no, points: item.points,
    difficulty: item.difficulty, source: item.source, llm_job_id: item.llm_job_id, confidence: item.confidence }));
}
function percent(value: number, total: number) { return total ? `${((value / total) * 100).toFixed(1)}%` : "0.0%"; }

export default function TrendsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const testId = Number(id);
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: test } = useApiData(() => testsApi.get(testId), [testId]);
  const { data: trends, loading, error } = useApiData(() => trendsApi.get(testId), [testId]);
  const formats = useApiData(() => formatsApi.list(), []);
  const units = useApiData(() => test ? unitsApi.list(test.textbook_id) : Promise.resolve([]), [test?.textbook_id]);
  const schools = useApiData(() => schoolsApi.list(), []);
  const textbooks = useApiData(() => textbooksApi.list(), []);

  const [rows, setRows] = useState<EditableRow[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [image, setImage] = useState<CapturedImage | null>(null);
  const [analysisJobId, setAnalysisJobId] = useState<number | null>(null);
  const [analysisConfirmed, setAnalysisConfirmed] = useState(false);
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmError, setLlmError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const [generationLoading, setGenerationLoading] = useState(false);
  const [generationJobId, setGenerationJobId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<GeneratedProblemDraft[]>([]);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [bankSaving, setBankSaving] = useState(false);
  const [downloading, setDownloading] = useState<"pdf" | "word" | null>(null);

  useEffect(() => {
    if (!trends) return;
    queueMicrotask(() => {
      setRows(toEditable(trends.items));
      const ids = [...new Set(trends.items.map((item) => item.llm_job_id).filter((value): value is number => value !== null))];
      if (ids.length === 1 && trends.items.length > 0 && trends.items.every((item) => item.reviewed)) {
        setAnalysisJobId(ids[0]); setAnalysisConfirmed(true);
      }
    });
  }, [trends]);

  useEffect(() => {
    const pending = consumePendingTestUpload(testId);
    if (!pending) return;
    const captured = { base64: pending.base64, mediaType: pending.mediaType, dataUrl: pending.dataUrl, fileName: pending.fileName };
    queueMicrotask(() => {
      setImage(captured);
      void analyze(captured);
    });
    // ホームから渡された画像は初回マウント時に一度だけ消費する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testId]);

  const totalPoints = rows.reduce((sum, row) => sum + (Number.isFinite(row.points) ? row.points : 0), 0);
  const summaries = useMemo(() => {
    const difficulty = [1, 2, 3].map((level) => ({ level, count: rows.filter((row) => row.difficulty === level).length }));
    const byUnit = new Map<number, { count: number; points: number }>();
    const byFormat = new Map<number, number>();
    for (const row of rows) {
      if (row.unit_id) { const value = byUnit.get(row.unit_id) ?? { count: 0, points: 0 }; byUnit.set(row.unit_id, { count: value.count + 1, points: value.points + row.points }); }
      byFormat.set(row.format_id, (byFormat.get(row.format_id) ?? 0) + 1);
    }
    return { difficulty, byUnit: [...byUnit.entries()], byFormat: [...byFormat.entries()] };
  }, [rows]);

  // 生成した各問題へ、解析で確定した小問配点を 単元×形式×難易度 ごとに順番に割り当てる。
  // バックエンドのPDF・Word生成と同じ規則なので、プレビューと出力物の配点が一致する。
  const draftPoints = useMemo(() => {
    if (drafts.length === 0) return null;
    const buckets = new Map<string, number[]>();
    for (const row of rows) {
      if (!row.unit_id) return null;
      const key = `${row.unit_id}/${row.format_id}/${row.difficulty}`;
      buckets.set(key, [...(buckets.get(key) ?? []), row.points]);
    }
    const cursors = new Map<string, number>();
    const values: number[] = [];
    for (const draft of drafts) {
      const key = `${draft.unit_id}/${draft.format_id}/${draft.difficulty}`;
      const index = cursors.get(key) ?? 0;
      const available = buckets.get(key);
      if (!available || index >= available.length) return null;
      values.push(available[index]);
      cursors.set(key, index + 1);
    }
    return values;
  }, [rows, drafts]);

  const previewTotalPoints = draftPoints ? draftPoints.reduce((sum, value) => sum + value, 0) : totalPoints;

  function updateRow(key: string, patch: Partial<EditableRow>) {
    setRows((current) => current.map((row) => row.key === key ? { ...row, ...patch } : row)); setAnalysisConfirmed(false);
  }
  function addRow() {
    setRows((current) => [...current, { key: tempKey(), unit_id: units.data?.[0]?.id ?? null,
      format_id: formats.data?.[0]?.id ?? 0, question_no: "", points: 1, difficulty: 1,
      source: analysisJobId ? "llm" : "manual", llm_job_id: analysisJobId }]); setAnalysisConfirmed(false);
  }
  async function analyze(target: CapturedImage) {
    if (!user) return;
    setLlmLoading(true); setLlmError(null); setMessage(null); setFallbackNotice(null); setDrafts([]); setGenerationJobId(null);
    try {
      const response = await llmApi.trendDraft({ test_id: testId, user_id: user.id, image_base64: target.base64, media_type: target.mediaType });
      setRows(response.items.map((item) => ({ key: tempKey(), unit_id: item.unit_id, format_id: item.format_id ?? 0,
        question_no: item.question_no, points: item.points, difficulty: item.difficulty, source: "llm",
        llm_job_id: response.job_id, confidence: item.confidence })));
      setAnalysisJobId(response.job_id); setAnalysisConfirmed(false);
      setFallbackNotice(response.notice ?? null);
      setMessage(response.fallback_mode ? "分析テンプレートを読み込みました。内容を確認・修正してください。" : "画像解析が完了しました。小問ごとの結果を修正してから確定してください。");
    } catch (err) { setLlmError(err instanceof ApiRequestError ? err.message : "画像解析に失敗しました。画像を保持したまま再試行できます。"); }
    finally { setLlmLoading(false); }
  }
  function acceptImage(base64: string, mediaType: string) {
    const captured = { base64, mediaType, dataUrl: `data:${mediaType};base64,${base64}` };
    setImage(captured); void analyze(captured);
  }
  function chooseFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type)) { setLlmError("JPEG・PNG・WebP・PDF形式のファイルを選択してください。"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const captured = { base64: dataUrl.split(",")[1] ?? "", mediaType: file.type, dataUrl, fileName: file.name };
      setImage(captured); void analyze(captured);
    };
    reader.readAsDataURL(file); event.target.value = "";
  }
  function validateRows() {
    if (!rows.length) return "小問を1件以上入力してください。";
    if (rows.some((row) => !row.question_no.trim() || !row.unit_id || !row.format_id || row.points <= 0)) return "小問番号・単元・形式・正の配点をすべて入力してください。";
    if (new Set(rows.map((row) => row.question_no.trim())).size !== rows.length) return "小問番号が重複しています。";
    return null;
  }
  async function confirmAnalysis() {
    if (!user) return; const invalid = validateRows(); if (invalid) { setLlmError(invalid); return; }
    setSaving(true); setLlmError(null);
    try {
      if (analysisJobId) {
        await llmApi.updateTrendDraft(analysisJobId, { user_id: user.id, total_points: totalPoints,
          items: rows.map((row) => ({ question_no: row.question_no.trim(), unit_id: row.unit_id!, format_id: row.format_id,
            points: row.points, difficulty: row.difficulty, confidence: row.confidence ?? 1 })) });
        await llmApi.confirmTrendDraft(analysisJobId, { user_id: user.id });
      } else {
        await trendsApi.put(testId, { user_id: user.id, items: rows.map((row) => ({ id: row.id ?? null,
          unit_id: row.unit_id, format_id: row.format_id, question_no: row.question_no.trim(), points: row.points,
          difficulty: row.difficulty, confidence: row.confidence ?? null, source: row.source, llm_job_id: row.llm_job_id ?? null })) });
      }
      setAnalysisConfirmed(true); setImage(null);
      setMessage("解析結果を確定しました。入力画像はブラウザとバックエンドのどちらにも保存していません。");
    } catch (err) { setLlmError(err instanceof ApiRequestError ? err.message : "解析結果の確定に失敗しました。"); }
    finally { setSaving(false); }
  }
  async function generateProblems() {
    if (!user || !analysisJobId) return;
    setGenerationLoading(true); setGenerationError(null); setDrafts([]);
    try {
      if (!analysisConfirmed) {
        const invalid = validateRows();
        if (invalid) throw new Error(invalid);
        await llmApi.updateTrendDraft(analysisJobId, { user_id: user.id, total_points: totalPoints,
          items: rows.map((row) => ({ question_no: row.question_no.trim(), unit_id: row.unit_id!, format_id: row.format_id,
            points: row.points, difficulty: row.difficulty, confidence: row.confidence ?? 1 })) });
        await llmApi.confirmTrendDraft(analysisJobId, { user_id: user.id });
        setAnalysisConfirmed(true); setImage(null);
      }
      const response = await llmApi.generateFromTrend(analysisJobId, { user_id: user.id });
      setGenerationJobId(response.job_id);
      setDrafts(response.problems.map((problem) => ({ ...problem, hints: [...problem.hints] as [string, string, string] })));
      setFallbackNotice(response.notice ?? fallbackNotice);
      setMessage(`${response.problems.length}問を生成しました。プレビューを確認してPDFまたはWordで保存できます。`);
    } catch (err) { setGenerationError(err instanceof ApiRequestError || err instanceof Error ? err.message : "問題の一括生成に失敗しました。"); }
    finally { setGenerationLoading(false); }
  }
  function updateDraft(index: number, patch: Partial<GeneratedProblemDraft>) { setDrafts((current) => current.map((draft, i) => i === index ? { ...draft, ...patch } : draft)); }
  function updateHint(index: number, hintIndex: number, value: string) {
    const hints = [...drafts[index].hints] as [string, string, string]; hints[hintIndex] = value; updateDraft(index, { hints });
  }
  async function saveToBank() {
    if (!user || !generationJobId) return;
    if (drafts.some((draft) => !draft.body.trim() || !draft.answer.trim() || !draft.explanation.trim() || draft.hints.some((hint) => !hint.trim()))) { setGenerationError("問題文・正答・解説・3段階のヒントをすべて入力してください。"); return; }
    setBankSaving(true); setGenerationError(null);
    try {
      const response = await llmApi.saveProblemBatch(generationJobId, { user_id: user.id, problems: drafts });
      setMessage(`${response.saved}問を source: llm、解析ジョブ #${response.analysis_job_id}、生成ジョブ #${response.job_id} に紐づけて問題バンクへ下書き保存しました。`); setDrafts([]);
    } catch (err) { setGenerationError(err instanceof ApiRequestError ? err.message : "問題バンクへの一括保存に失敗しました。"); }
    finally { setBankSaving(false); }
  }

  async function downloadGenerated(format: "pdf" | "word") {
    if (!generationJobId || !user) return;
    if (drafts.some((draft) => !draft.body.trim() || !draft.answer.trim() || !draft.explanation.trim() || draft.hints.some((hint) => !hint.trim()))) {
      setGenerationError("問題文・正答・解説・3段階のヒントをすべて入力してください。");
      return;
    }
    setDownloading(format); setGenerationError(null);
    try {
      await llmApi.updateProblemBatch(generationJobId, { user_id: user.id, problems: drafts });
      const body = { duration_minutes: 50, total_points: previewTotalPoints || 100, title: `${test?.term ?? "定期"}テスト対策問題` };
      const filename = format === "pdf" ? await downloadGenerationPdf(generationJobId, body) : await downloadGenerationWord(generationJobId, body);
      setMessage(`${filename} をダウンロードしました。`);
    } catch (err) { setGenerationError(err instanceof Error ? err.message : `${format === "pdf" ? "PDF" : "Word"}の生成に失敗しました。`); }
    finally { setDownloading(null); }
  }

  const unitName = (unitId: number) => units.data?.find((unit) => unit.id === unitId)?.name ?? `#${unitId}`;
  const formatName = (formatId: number) => formats.data?.find((format) => format.id === formatId)?.name ?? `#${formatId}`;
  const schoolName = schools.data?.find((school) => school.id === test?.school_id)?.name ?? "○○高等学校";
  const subjectName = (textbooks.data?.find((textbook) => textbook.id === test?.textbook_id)?.title ?? "数学II").replace(/^高等学校\s*/, "");
  const previewGroups = Array.from({ length: Math.ceil(drafts.length / 4) }, (_, index) => drafts.slice(index * 4, index * 4 + 4));

  return <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-semibold text-blue-600">ステップ 2</p><h2 className="text-xl font-bold text-slate-950">問題分析</h2></div><div className="flex gap-2">
      <Button size="sm" variant="llm" onClick={() => setCameraOpen(true)} disabled={llmLoading}><Camera className="h-4 w-4" />カメラで撮影</Button>
      <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={llmLoading}><Upload className="h-4 w-4" />画像・PDFファイル</Button>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={chooseFile} />
    </div></div>
    <CameraCapture open={cameraOpen} onOpenChange={setCameraOpen} onCapture={acceptImage} title="過去テストの撮影" />
    {image && <Card><CardContent className="flex flex-col gap-3 p-4 sm:flex-row">
      {image.mediaType === "application/pdf" ? (
        <div className="flex h-40 w-56 flex-col items-center justify-center rounded border border-red-100 bg-red-50 text-center">
          <FileText className="h-10 w-10 text-red-600" />
          <p className="mt-2 max-w-48 truncate px-2 text-sm font-medium text-slate-800">{image.fileName ?? "過去問.pdf"}</p>
          <p className="mt-1 text-xs text-slate-500">PDF資料</p>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- data URLの一時プレビュー
        <img src={image.dataUrl} alt="解析するテスト画像のプレビュー" className="max-h-56 rounded border object-contain" />
      )}
      <div className="flex flex-col justify-center gap-2"><p className="text-sm text-slate-600">解析対象の{image.mediaType === "application/pdf" ? "PDF" : "画像"}プレビュー</p><Button size="sm" variant="outline" onClick={() => void analyze(image)} disabled={llmLoading}><RotateCcw className="h-4 w-4" />{llmLoading ? "解析中…" : "解析を再試行"}</Button></div>
    </CardContent></Card>}
    {llmLoading && <LoadingBlock label="Geminiが過去問を解析しています…" />}{llmError && <ErrorBlock message={llmError} />}
    {fallbackNotice && <p role="status" className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">{fallbackNotice}</p>}
    {message && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>}
    {loading && <LoadingBlock />}{error && <ErrorBlock message={error} />}

    {!loading && !error && rows.length > 0 && <>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card><CardHeader><CardTitle>テストの難しさ</CardTitle></CardHeader><CardContent className="space-y-1 text-sm">{summaries.difficulty.map((item) => <p key={item.level}>難易度{item.level}: {item.count}問（{percent(item.count, rows.length)}）</p>)}</CardContent></Card>
        <Card><CardHeader><CardTitle>単元</CardTitle></CardHeader><CardContent className="space-y-1 text-sm">{summaries.byUnit.map(([unitId, value]) => <p key={unitId}>{unitName(unitId)}: {value.count}問・{percent(value.points, totalPoints)}</p>)}</CardContent></Card>
        <Card><CardHeader><CardTitle>問題形式</CardTitle></CardHeader><CardContent className="space-y-1 text-sm">{summaries.byFormat.map(([formatId, count]) => <p key={formatId}>{formatName(formatId)}: {count}問（{percent(count, rows.length)}）</p>)}</CardContent></Card>
        <Card><CardHeader><CardTitle>出題量</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{rows.length}問 / {totalPoints}点</p></CardContent></Card>
      </div>
      <section className="rounded-xl border-2 border-blue-200 bg-blue-50 px-5 py-6 text-center">
        <p className="mb-3 text-sm font-medium text-blue-800">分析結果をもとに、元テストと同じ構成の対策問題を作成します</p>
        <Button onClick={generateProblems} disabled={!analysisJobId || generationLoading} className="min-h-20 w-full max-w-3xl text-xl font-bold shadow-sm" size="lg"><Sparkles className="h-6 w-6" />{generationLoading ? "問題を生成しています…" : "この分析をもとに問題を生成"}</Button>
        <details className="mx-auto mt-3 max-w-3xl text-left text-sm text-slate-600"><summary className="cursor-pointer text-center font-medium text-blue-700">詳細設定</summary><p className="mt-3 border-t border-blue-100 pt-3">問題数：{rows.length}問　難易度：分析結果の構成を維持　制限時間：50分　満点：{totalPoints}点</p></details>
      </section>
      <details className="rounded-lg border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer text-sm font-semibold text-slate-600">詳細を見る（小問番号・配点・確信度の確認と修正）</summary>
      <div className="mt-4 flex flex-col gap-4">
      <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-700">小問別解析結果</h3><Button size="sm" variant="outline" onClick={addRow}><Plus className="h-4 w-4" />行を追加</Button></div>
      <Table><TableHeader><TableRow><TableHead>小問番号</TableHead><TableHead>単元</TableHead><TableHead>形式</TableHead><TableHead>配点</TableHead><TableHead>難易度</TableHead><TableHead>確信度</TableHead><TableHead /></TableRow></TableHeader><TableBody>
        {rows.map((row) => <TableRow key={row.key}>
          <TableCell><Input value={row.question_no} onChange={(event) => updateRow(row.key, { question_no: event.target.value })} className="w-24" /></TableCell>
          <TableCell><Select value={row.unit_id ? String(row.unit_id) : ""} onValueChange={(value) => updateRow(row.key, { unit_id: Number(value) })}><SelectTrigger className="w-44"><SelectValue placeholder="単元" /></SelectTrigger><SelectContent>{units.data?.map((unit) => <SelectItem key={unit.id} value={String(unit.id)}>{unit.name}</SelectItem>)}</SelectContent></Select></TableCell>
          <TableCell><Select value={String(row.format_id)} onValueChange={(value) => updateRow(row.key, { format_id: Number(value) })}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent>{formats.data?.map((format) => <SelectItem key={format.id} value={String(format.id)}>{format.name}</SelectItem>)}</SelectContent></Select></TableCell>
          <TableCell><Input type="number" min={1} value={row.points} onChange={(event) => updateRow(row.key, { points: Number(event.target.value) })} className="w-20" /></TableCell>
          <TableCell><Select value={String(row.difficulty)} onValueChange={(value) => updateRow(row.key, { difficulty: Number(value) as Difficulty })}><SelectTrigger className="w-28"><SelectValue /></SelectTrigger><SelectContent>{[1,2,3].map((level) => <SelectItem key={level} value={String(level)}>難易度{level}</SelectItem>)}</SelectContent></Select></TableCell>
          <TableCell>{row.confidence == null ? "—" : <Badge variant={row.confidence < 0.6 ? "warning" : "secondary"}>{Math.round(row.confidence * 100)}%</Badge>}</TableCell>
          <TableCell><Button size="icon" variant="ghost" aria-label={`${row.question_no}を削除`} onClick={() => { setRows((current) => current.filter((item) => item.key !== row.key)); setAnalysisConfirmed(false); }}><Trash2 className="h-4 w-4" /></Button></TableCell>
        </TableRow>)}
      </TableBody></Table>
      <div className="flex flex-wrap gap-2"><Button onClick={confirmAnalysis} disabled={saving || analysisConfirmed}><Check className="h-4 w-4" />{saving ? "確定中…" : analysisConfirmed ? "確定済み" : "修正内容を保存"}</Button></div>
      </div>
      </details>
    </>}
    {!loading && !error && !llmLoading && rows.length === 0 && <EmptyBlock label="カメラまたは画像ファイルから過去テストを入力してください" />}
    {generationLoading && <LoadingBlock label={`元テストと同じ構成で${rows.length}問を生成しています…`} />}{generationError && <ErrorBlock message={generationError} />}
    {drafts.length > 0 && <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4"><div><p className="text-sm font-semibold text-blue-600">ステップ 3</p><h3 className="text-xl font-bold text-slate-950">問題プレビュー</h3><p className="mt-1 text-sm text-slate-600">学校で配布する用紙の内容を確認してください。</p></div><div className="grid w-full grid-cols-2 gap-3 sm:w-auto">
        <Button size="lg" onClick={() => void downloadGenerated("pdf")} disabled={downloading !== null}><Download className="h-5 w-5" />{downloading === "pdf" ? "生成中…" : "PDFで保存"}</Button>
        <Button size="lg" variant="outline" onClick={() => void downloadGenerated("word")} disabled={downloading !== null} className="border-blue-600 text-blue-700 hover:bg-blue-50"><Download className="h-5 w-5" />{downloading === "word" ? "生成中…" : "Wordで保存"}</Button>
      </div></div>
      <div className="mx-auto w-full max-w-[794px] bg-white px-[68px] py-[52px] text-black shadow-sm ring-1 ring-slate-200" style={{ fontFamily: '"Yu Gothic", "BIZ UDPGothic", sans-serif' }}>
        <div className="text-center text-sm">{schoolName}</div>
        <h3 className="mt-1 text-center text-xl font-semibold leading-8">{test?.grade}　{subjectName}<br/>{test?.term}テスト対策問題</h3>
        <div className="mt-5 grid grid-cols-[1fr_auto_auto] gap-6 text-sm"><span>実施日：____年__月__日</span><span>制限時間：50分</span><span>満点：{previewTotalPoints}点</span></div>
        <div className="mt-4 grid grid-cols-[auto_1fr_auto] gap-5 text-sm"><span>{test?.grade.replace("高", "")}年 ____組　____番</span><span>氏名 ________________________</span><span>得点 ______ / {previewTotalPoints}</span></div>
        <hr className="my-6 border-black" />
        {previewGroups.map((group, groupIndex) => <div key={groupIndex} className="mb-8 break-inside-avoid"><div className="mb-4 flex justify-between font-semibold"><span>第{groupIndex + 1}問　次の問いに答えなさい。</span><span>〔{draftPoints ? draftPoints.slice(groupIndex * 4, groupIndex * 4 + 4).reduce((sum, value) => sum + value, 0) : Math.floor(totalPoints / previewGroups.length) + (groupIndex < totalPoints % previewGroups.length ? 1 : 0)}点〕</span></div>{group.map((problem, problemIndex) => <div key={`${groupIndex}-${problemIndex}`} className="mb-7"><p className="whitespace-pre-wrap text-[15px] leading-7">({problemIndex + 1})　{problem.body}{draftPoints ? `　（${draftPoints[groupIndex * 4 + problemIndex]}点）` : ""}</p><div className="h-16" /></div>)}</div>)}
      </div>
      <details className="rounded-lg border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-semibold text-slate-600">問題内容を編集・問題バンクへ保存</summary><div className="mt-4 flex flex-col gap-4">
        {drafts.map((draft, index) => <Card key={`${generationJobId}-${index}`}><CardHeader><CardTitle>問題 {index + 1}</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">
          <label className="text-xs text-slate-600">問題文<Textarea className="mt-1" rows={4} value={draft.body} onChange={(event) => updateDraft(index, { body: event.target.value })} /></label><label className="text-xs text-slate-600">正答<Textarea className="mt-1" rows={4} value={draft.answer} onChange={(event) => updateDraft(index, { answer: event.target.value })} /></label><label className="text-xs text-slate-600 md:col-span-2">解説<Textarea className="mt-1" rows={3} value={draft.explanation} onChange={(event) => updateDraft(index, { explanation: event.target.value })} /></label>
          {draft.hints.map((hint, hintIndex) => <label key={hintIndex} className="text-xs text-slate-600 md:col-span-2">ヒント {hintIndex + 1}<Textarea className="mt-1" rows={2} value={hint} onChange={(event) => updateHint(index, hintIndex, event.target.value)} /></label>)}
        </CardContent></Card>)}
        <Button onClick={saveToBank} disabled={bankSaving} className="self-start">{bankSaving ? "一括保存中…" : "問題バンクへ一括保存"}</Button>
      </div></details>
    </section>}
  </div>;
}
