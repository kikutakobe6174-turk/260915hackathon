"use client";

import { use, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Camera, Check, X as XIcon, Flag, CornerDownRight } from "lucide-react";
import { answerSheetsApi } from "@/lib/api/answerSheets";
import { llmApi } from "@/lib/api/llm";
import { useApiData } from "@/lib/hooks/useApiData";
import { useAuth } from "@/contexts/AuthContext";
import {
  buildDisplayOrder,
  draftFromExisting,
  resolveGridKey,
  EMPTY_DRAFT,
  type AttemptDraft,
} from "@/lib/answerSheetGrid";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingBlock, ErrorBlock } from "@/components/ui/status";
import { CameraCapture } from "@/components/camera/CameraCapture";
import { ApiRequestError, type AttemptWarning } from "@/lib/types/api";
import { cn } from "@/lib/utils";

const LOW_CONFIDENCE_THRESHOLD = 0.6;

export default function AnswerSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const answerSheetId = Number(id);
  const router = useRouter();
  const { user } = useAuth();

  const { data: sheet, loading, error } = useApiData(
    () => answerSheetsApi.get(answerSheetId),
    [answerSheetId]
  );

  const [drafts, setDrafts] = useState<Record<number, AttemptDraft>>({});
  const [initialized, setInitialized] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<AttemptWarning[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmError, setLlmError] = useState<string | null>(null);
  const [lowConfidenceIds, setLowConfidenceIds] = useState<Set<number>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sheet || initialized) return;
    async function apply() {
      if (!sheet) return;
      setDrafts(draftFromExisting(sheet.items));
      setInitialized(true);
    }
    apply();
  }, [sheet, initialized]);

  useEffect(() => {
    containerRef.current?.focus();
  }, [initialized]);

  const displayRows = useMemo(() => (sheet ? buildDisplayOrder(sheet.items) : []), [sheet]);

  if (loading) return <LoadingBlock />;
  if (error) return <ErrorBlock message={error} />;
  if (!sheet) return null;

  const locked = sheet.status === "confirmed";

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (locked || displayRows.length === 0) return;
    const row = displayRows[focusedIndex];
    if (!row) return;
    const itemId = row.item.worksheet_item_id;
    const current = drafts[itemId] ?? EMPTY_DRAFT;
    const action = resolveGridKey(e.key, current);

    if (action.type === "update") {
      e.preventDefault();
      setDrafts((d) => ({ ...d, [itemId]: action.draft }));
    } else if (action.type === "next") {
      e.preventDefault();
      setFocusedIndex((i) => Math.min(i + 1, displayRows.length - 1));
    } else if (action.type === "prev") {
      e.preventDefault();
      setFocusedIndex((i) => Math.max(i - 1, 0));
    }
  }

  function buildAttemptsPayload() {
    return Object.entries(drafts)
      .filter(([, v]) => v.is_correct !== undefined)
      .map(([worksheetItemId, v]) => ({
        worksheet_item_id: Number(worksheetItemId),
        is_correct: v.is_correct!,
        hint_step: v.hint_step,
        went_return: v.went_return,
        red_card: v.red_card,
        memo: v.memo ?? undefined,
      }));
  }

  async function handleSave(): Promise<boolean> {
    setSaving(true);
    setSaveError(null);
    setWarnings([]);
    try {
      const res = await answerSheetsApi.putAttempts(answerSheetId, {
        attempts: buildAttemptsPayload(),
      });
      setWarnings(res.warnings);
      return true;
    } catch (err) {
      setSaveError(err instanceof ApiRequestError ? err.message : "保存に失敗しました");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmAndNext() {
    if (!user || !sheet) return;
    setConfirming(true);
    const ok = await handleSave();
    if (!ok) {
      setConfirming(false);
      return;
    }
    try {
      const res = await answerSheetsApi.confirm(answerSheetId, { user_id: user.id });
      if (res.next_answer_sheet_id) {
        router.push(`/answer-sheets/${res.next_answer_sheet_id}`);
      } else {
        router.push("/");
      }
    } catch (err) {
      setSaveError(err instanceof ApiRequestError ? err.message : "確定に失敗しました");
    } finally {
      setConfirming(false);
    }
  }

  async function handleImageCapture(base64: string, mediaType: string) {
    if (!user) return;
    setLlmLoading(true);
    setLlmError(null);
    try {
      const res = await llmApi.sheetDraft({
        answer_sheet_id: answerSheetId,
        user_id: user.id,
        image_base64: base64,
        media_type: mediaType,
      });
      const newLowConfidence = new Set<number>();
      setDrafts((d) => {
        const next = { ...d };
        for (const row of res.rows) {
          if (row.worksheet_item_id === null) continue;
          next[row.worksheet_item_id] = {
            is_correct: row.is_correct,
            hint_step: row.hint_step,
            went_return: row.went_return,
            red_card: row.red_card,
          };
          if (row.confidence < LOW_CONFIDENCE_THRESHOLD) {
            newLowConfidence.add(row.worksheet_item_id);
          }
        }
        return next;
      });
      setLowConfidenceIds(newLowConfidence);
      const unmatched = res.rows.filter((r) => r.worksheet_item_id === null).length;
      if (unmatched > 0) {
        setLlmError(`${unmatched}行は番号を認識できず読み込めませんでした。手動で入力してください。`);
      }
    } catch (err) {
      setLlmError(err instanceof ApiRequestError ? err.message : "写真からの下書き生成に失敗しました");
    } finally {
      setLlmLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Link href="/" className="text-sm text-slate-500 hover:text-slate-800">
        ← ホームへ戻る
      </Link>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">
            解答用紙 #{sheet.id} — {sheet.student_code}（第{sheet.round}周）
          </h1>
          <p className="text-xs text-slate-500">
            キーボード操作: O/X=正誤, 0-3=ヒント段階, R=戻り, C=赤カード, Enter/↓=次の行, ↑=前の行
          </p>
        </div>
        <div className="flex items-center gap-2">
          {locked && <Badge variant="success">確定済み</Badge>}
          <Button
            variant="llm"
            size="sm"
            disabled={locked || llmLoading}
            onClick={() => setCameraOpen(true)}
          >
            <Camera className="h-4 w-4" />
            {llmLoading ? "解析中…" : "写真から下書き"}
          </Button>
        </div>
      </div>

      <CameraCapture
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        onCapture={handleImageCapture}
        title="解答用紙の撮影"
      />

      {llmError && <ErrorBlock message={llmError} />}
      {saveError && <ErrorBlock message={saveError} />}
      {warnings.length > 0 && (
        <div className="flex flex-col gap-1 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <span className="font-medium">矛盾チェックの警告（保存は完了しています）</span>
          {warnings.map((w, i) => (
            <span key={i}>・{w.message}（項目 {sheet.items.find((it) => it.worksheet_item_id === w.worksheet_item_id)?.item_no}）</span>
          ))}
        </div>
      )}

      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="flex flex-col overflow-hidden rounded-md border border-slate-200 outline-none focus:ring-2 focus:ring-slate-400"
      >
        <div className="grid grid-cols-[64px_1fr_80px_100px_70px_70px] bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
          <span>番号</span>
          <span>単元</span>
          <span>正誤</span>
          <span>ヒント段階</span>
          <span>戻り</span>
          <span>赤カード</span>
        </div>
        {displayRows.map((row, i) => {
          const draft = drafts[row.item.worksheet_item_id];
          const focused = i === focusedIndex;
          const lowConfidence = lowConfidenceIds.has(row.item.worksheet_item_id);
          return (
            <div
              key={row.item.worksheet_item_id}
              onClick={() => {
                setFocusedIndex(i);
                containerRef.current?.focus();
              }}
              className={cn(
                "grid cursor-pointer grid-cols-[64px_1fr_80px_100px_70px_70px] items-center border-t border-slate-100 px-3 py-2 text-sm",
                focused && "bg-slate-900 text-white",
                !focused && lowConfidence && "bg-amber-100",
                !focused && !lowConfidence && row.indent && "bg-slate-50"
              )}
            >
              <span className={cn("flex items-center gap-1", row.indent && "pl-4")}>
                {row.indent && <CornerDownRight className="h-3 w-3 opacity-60" />}
                {row.item.item_no}
              </span>
              <span className="truncate">{row.item.unit_name}</span>
              <span>
                {draft?.is_correct === true && (
                  <Check className={cn("h-4 w-4", focused ? "text-emerald-300" : "text-emerald-600")} />
                )}
                {draft?.is_correct === false && (
                  <XIcon className={cn("h-4 w-4", focused ? "text-red-300" : "text-red-600")} />
                )}
                {draft?.is_correct === undefined && <span className="opacity-40">—</span>}
              </span>
              <span>{draft?.hint_step ?? 0}</span>
              <span>{draft?.went_return ? <CornerDownRight className="h-4 w-4" /> : null}</span>
              <span>
                {draft?.red_card ? (
                  <Flag className={cn("h-4 w-4", focused ? "text-red-300" : "text-red-600")} />
                ) : null}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={handleSave} disabled={saving || locked}>
          {saving ? "保存中…" : "途中保存"}
        </Button>
        <Button onClick={handleConfirmAndNext} disabled={confirming || locked}>
          {confirming ? "処理中…" : "確定して次の生徒へ"}
        </Button>
      </div>
    </div>
  );
}
