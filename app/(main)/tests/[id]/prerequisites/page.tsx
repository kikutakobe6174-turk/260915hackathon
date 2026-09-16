"use client";

import { use, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { prerequisitesApi } from "@/lib/api/tests";
import { testsApi } from "@/lib/api/tests";
import { unitsApi } from "@/lib/api/masters";
import { useApiData } from "@/lib/hooks/useApiData";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "@/components/ui/status";
import { ApiRequestError, type PrerequisiteOut } from "@/lib/types/api";
import type { Unit } from "@/lib/types/models";
import { cn } from "@/lib/utils";

export default function PrerequisitesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const testId = Number(id);
  const { user } = useAuth();
  const isOperator = user?.role === "operator";

  const { data: test } = useApiData(() => testsApi.get(testId), [testId]);
  const { data, loading, error, reload } = useApiData(
    () => prerequisitesApi.getForTest(testId),
    [testId]
  );
  const units = useApiData(
    () => (test ? unitsApi.list(test.textbook_id) : Promise.resolve([])),
    [test?.textbook_id]
  );

  const [selectedUnitIdRaw, setSelectedUnitId] = useState<number | null>(null);
  // 未選択時は範囲の先頭単元を初期選択として扱う（effectを使わずrender時に導出）。
  const selectedUnitId = selectedUnitIdRaw ?? data?.units[0]?.unit_id ?? null;

  const selectedGroup = data?.units.find((u) => u.unit_id === selectedUnitId);

  return (
    <div className="grid grid-cols-[240px_1fr] gap-6">
      <div className="flex flex-col gap-1">
        {loading && <LoadingBlock />}
        {error && <ErrorBlock message={error} />}
        {data?.units.map((u) => (
          <button
            key={u.unit_id}
            onClick={() => setSelectedUnitId(u.unit_id)}
            className={cn(
              "flex items-center justify-between rounded-md px-3 py-2 text-left text-sm",
              selectedUnitId === u.unit_id
                ? "bg-slate-900 text-white"
                : "text-slate-700 hover:bg-slate-100"
            )}
          >
            <span>{u.unit_name}</span>
            <Badge variant={u.confirmed ? "success" : "warning"}>
              {u.confirmed ? "確定" : "未確認"}
            </Badge>
          </button>
        ))}
        {data && data.units.length === 0 && (
          <EmptyBlock label="このテストの範囲に単元がありません" />
        )}
      </div>

      <div className="flex flex-col gap-4">
        {selectedGroup && (
          <>
            <h2 className="text-base font-semibold text-slate-900">
              {selectedGroup.unit_name} の前提単元
            </h2>

            {isOperator && (
              <PrerequisiteSetEditor
                key={selectedGroup.unit_id}
                unitId={selectedGroup.unit_id}
                allUnits={units.data ?? []}
                initialPrerequisites={selectedGroup.prerequisites}
                onSaved={reload}
              />
            )}

            <div className="flex flex-col gap-3">
              {selectedGroup.prerequisites.length === 0 && (
                <EmptyBlock label="前提単元が登録されていません" />
              )}
              {selectedGroup.prerequisites.map((p) => (
                <PrerequisiteReviewCard
                  key={p.prerequisite_unit_id}
                  unitId={selectedGroup.unit_id}
                  prerequisiteUnitId={p.prerequisite_unit_id}
                  prerequisiteUnitName={p.prerequisite_unit_name}
                  reason={p.reason}
                  source={p.source}
                  initialTeacherNote={p.teacher_note ?? ""}
                  initialConfirmed={p.confirmed}
                  onSaved={reload}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PrerequisiteSetEditor({
  unitId,
  allUnits,
  initialPrerequisites,
  onSaved,
}: {
  unitId: number;
  allUnits: Unit[];
  initialPrerequisites: PrerequisiteOut[];
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [editRows, setEditRows] = useState(() =>
    initialPrerequisites.map((p) => ({
      prerequisite_unit_id: p.prerequisite_unit_id,
      reason: p.reason ?? "",
      source: p.source,
      llm_job_id: p.llm_job_id,
    }))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addRow() {
    const candidate = allUnits.find(
      (u) => u.id !== unitId && !editRows.some((r) => r.prerequisite_unit_id === u.id)
    );
    if (!candidate) return;
    setEditRows((rs) => [
      ...rs,
      { prerequisite_unit_id: candidate.id, reason: "", source: "manual" as const, llm_job_id: null },
    ]);
  }

  async function save() {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      await prerequisitesApi.putForUnit(unitId, {
        user_id: user.id,
        items: editRows.map((r) => ({
          prerequisite_unit_id: r.prerequisite_unit_id,
          reason: r.reason || null,
          source: r.source,
          llm_job_id: r.llm_job_id ?? null,
        })),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">前提単元の編集</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={addRow}>
              <Plus className="h-4 w-4" />
              追加
            </Button>
          </div>
        </div>
        {editRows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            {r.source === "llm" && <Badge variant="llm">LLM</Badge>}
            <Select
              value={String(r.prerequisite_unit_id)}
              onValueChange={(v) =>
                setEditRows((rs) =>
                  rs.map((row, idx) =>
                    idx === i ? { ...row, prerequisite_unit_id: Number(v) } : row
                  )
                )
              }
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allUnits
                  .filter((u) => u.id !== unitId)
                  .map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <input
              className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
              placeholder="理由"
              value={r.reason}
              onChange={(e) =>
                setEditRows((rs) =>
                  rs.map((row, idx) => (idx === i ? { ...row, reason: e.target.value } : row))
                )
              }
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setEditRows((rs) => rs.filter((_, idx) => idx !== i))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {error && <ErrorBlock message={error} />}
        <div>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? "保存中…" : "前提単元を保存"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PrerequisiteReviewCard({
  unitId,
  prerequisiteUnitId,
  prerequisiteUnitName,
  reason,
  source,
  initialTeacherNote,
  initialConfirmed,
  onSaved,
}: {
  unitId: number;
  prerequisiteUnitId: number;
  prerequisiteUnitName: string;
  reason: string | null;
  source: "manual" | "llm";
  initialTeacherNote: string;
  initialConfirmed: boolean;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [note, setNote] = useState(initialTeacherNote);
  const [confirmed, setConfirmed] = useState(initialConfirmed);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = note !== initialTeacherNote || confirmed !== initialConfirmed;

  async function save() {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      await prerequisitesApi.review(unitId, prerequisiteUnitId, {
        user_id: user.id,
        confirmed,
        teacher_note: note,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-900">{prerequisiteUnitName}</span>
          {source === "llm" ? <Badge variant="llm">LLM</Badge> : <Badge variant="outline">手入力</Badge>}
          {initialConfirmed && <Badge variant="success">確認済み</Badge>}
        </div>
        {reason && <p className="text-sm text-slate-600">理由: {reason}</p>}
        <Textarea
          placeholder="先生コメント"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} />
          確認済みにする
        </label>
        {error && <ErrorBlock message={error} />}
        {dirty && (
          <div>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? "保存中…" : "保存"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
