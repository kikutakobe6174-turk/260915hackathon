"use client";

import { use, useEffect, useState } from "react";
import { Plus, Trash2, Camera } from "lucide-react";
import { testsApi, trendsApi } from "@/lib/api/tests";
import { unitsApi, formatsApi } from "@/lib/api/masters";
import { llmApi } from "@/lib/api/llm";
import { useApiData } from "@/lib/hooks/useApiData";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { LoadingBlock, ErrorBlock } from "@/components/ui/status";
import { CameraCapture } from "@/components/camera/CameraCapture";
import { ApiRequestError } from "@/lib/types/api";
import type { TrendItemOut } from "@/lib/types/api";
import type { Difficulty } from "@/lib/types/models";

interface EditableRow {
  key: string;
  id?: number;
  unit_id: number | null;
  format_id: number;
  question_no: string;
  points: number;
  difficulty: Difficulty;
  source: "manual" | "llm";
  llm_job_id?: number | null;
  confidence?: number | null;
}

let tempKeySeq = 0;
function tempKey() {
  return `new-${++tempKeySeq}`;
}

function toEditable(items: TrendItemOut[]): EditableRow[] {
  return items.map((it) => ({
    key: `existing-${it.id}`,
    id: it.id,
    unit_id: it.unit_id,
    format_id: it.format_id,
    question_no: it.question_no,
    points: it.points,
    difficulty: it.difficulty,
    source: it.source,
    llm_job_id: it.llm_job_id,
  }));
}

export default function TrendsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const testId = Number(id);
  const { user } = useAuth();

  const { data: test } = useApiData(() => testsApi.get(testId), [testId]);
  const { data: trends, loading, error } = useApiData(() => trendsApi.get(testId), [testId]);
  const formats = useApiData(() => formatsApi.list(), []);
  const units = useApiData(
    () => (test ? unitsApi.list(test.textbook_id) : Promise.resolve([])),
    [test?.textbook_id]
  );

  const [rows, setRows] = useState<EditableRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmError, setLlmError] = useState<string | null>(null);

  useEffect(() => {
    if (!trends) return;
    // 保存直後の再取得も含め、取得結果が変わるたびに編集用stateを作り直す。
    queueMicrotask(() => setRows(toEditable(trends.items)));
  }, [trends]);

  function addRow() {
    setRows((rs) => [
      ...rs,
      {
        key: tempKey(),
        unit_id: null,
        format_id: formats.data?.[0]?.id ?? 0,
        question_no: "",
        points: 0,
        difficulty: 1,
        source: "manual",
      },
    ]);
  }

  function updateRow(key: string, patch: Partial<EditableRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeRow(key: string) {
    setRows((rs) => rs.filter((r) => r.key !== key));
  }

  async function handleImageCapture(base64: string, mediaType: string) {
    if (!user) return;
    setLlmLoading(true);
    setLlmError(null);
    try {
      const res = await llmApi.trendDraft({
        test_id: testId,
        user_id: user.id,
        image_base64: base64,
        media_type: mediaType,
      });
      const draftRows: EditableRow[] = res.items.map((it) => ({
        key: tempKey(),
        unit_id: it.unit_id,
        format_id: it.format_id ?? formats.data?.[0]?.id ?? 0,
        question_no: it.question_no,
        points: it.points,
        difficulty: it.difficulty,
        source: "llm",
        llm_job_id: res.job_id,
        confidence: it.confidence,
      }));
      setRows((rs) => [...rs, ...draftRows]);
    } catch (err) {
      setLlmError(err instanceof ApiRequestError ? err.message : "画像からの下書き生成に失敗しました");
    } finally {
      setLlmLoading(false);
    }
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    setSaveError(null);
    setSaveMessage(null);
    try {
      const result = await trendsApi.put(testId, {
        user_id: user.id,
        items: rows.map((r) => ({
          id: r.id ?? null,
          unit_id: r.unit_id,
          format_id: r.format_id,
          question_no: r.question_no,
          points: r.points,
          difficulty: r.difficulty,
          source: r.source,
          llm_job_id: r.llm_job_id ?? null,
        })),
      });
      setRows(toEditable(result.items));
      setSaveMessage("確認して保存しました（画像は破棄されました）");
    } catch (err) {
      setSaveError(err instanceof ApiRequestError ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">出題傾向の入力</h2>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="llm"
            onClick={() => setCameraOpen(true)}
            disabled={llmLoading}
          >
            <Camera className="h-4 w-4" />
            {llmLoading ? "解析中…" : "画像から下書き"}
          </Button>
          <Button size="sm" variant="outline" onClick={addRow}>
            <Plus className="h-4 w-4" />
            行を追加
          </Button>
        </div>
      </div>

      <CameraCapture
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        onCapture={handleImageCapture}
        title="過去テストの撮影"
      />

      {llmError && <ErrorBlock message={llmError} />}
      {loading && <LoadingBlock />}
      {error && <ErrorBlock message={error} />}

      {!loading && !error && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">小問番号</TableHead>
                <TableHead className="w-48">単元</TableHead>
                <TableHead className="w-36">形式</TableHead>
                <TableHead className="w-20">配点</TableHead>
                <TableHead className="w-28">難易度</TableHead>
                <TableHead className="w-24">出所</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell>
                    <Input
                      value={r.question_no}
                      onChange={(e) => updateRow(r.key, { question_no: e.target.value })}
                      placeholder="例: 2(3)"
                      className="w-20"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Select
                        value={r.unit_id ? String(r.unit_id) : "none"}
                        onValueChange={(v) =>
                          updateRow(r.key, { unit_id: v === "none" ? null : Number(v) })
                        }
                      >
                        <SelectTrigger className="w-44">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">（未設定）</SelectItem>
                          {[...(units.data ?? [])]
                            .sort((a, b) => a.order_no - b.order_no)
                            .map((u) => (
                              <SelectItem key={u.id} value={String(u.id)}>
                                {u.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      {!r.unit_id && <Badge variant="warning">要確認</Badge>}
                      {r.confidence !== undefined && r.confidence !== null && r.confidence < 0.6 && (
                        <Badge variant="warning">確信度低</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={String(r.format_id)}
                      onValueChange={(v) => updateRow(r.key, { format_id: Number(v) })}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {formats.data?.map((f) => (
                          <SelectItem key={f.id} value={String(f.id)}>
                            {f.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={r.points}
                      onChange={(e) => updateRow(r.key, { points: Number(e.target.value) })}
                      className="w-16"
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={String(r.difficulty)}
                      onValueChange={(v) => updateRow(r.key, { difficulty: Number(v) as Difficulty })}
                    >
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">難易度1</SelectItem>
                        <SelectItem value="2">難易度2</SelectItem>
                        <SelectItem value="3">難易度3</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {r.source === "llm" ? (
                      <Badge variant="llm">LLM</Badge>
                    ) : (
                      <Badge variant="outline">手入力</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => removeRow(r.key)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {trends && trends.summary.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-slate-700">単元別 配点比率・出題数（確認済みのみ）</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>単元</TableHead>
                    <TableHead>出題数</TableHead>
                    <TableHead>配点比率</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trends.summary.map((s) => (
                    <TableRow key={s.unit_id}>
                      <TableCell>{s.unit_name}</TableCell>
                      <TableCell>{s.question_count}</TableCell>
                      <TableCell>{(s.point_ratio * 100).toFixed(1)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {saveError && <ErrorBlock message={saveError} />}
          {saveMessage && (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {saveMessage}
            </p>
          )}

          <div>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "保存中…" : "確認して保存"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
