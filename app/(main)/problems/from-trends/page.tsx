"use client";

import { useState } from "react";
import { Plus, Trash2, Sparkles } from "lucide-react";
import { testsApi } from "@/lib/api/tests";
import { unitsApi, formatsApi, textbooksApi } from "@/lib/api/masters";
import { problemsApi } from "@/lib/api/problems";
import { llmApi } from "@/lib/api/llm";
import { useApiData } from "@/lib/hooks/useApiData";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingBlock, ErrorBlock } from "@/components/ui/status";
import { LatexPreview } from "@/components/problems/LatexPreview";
import { ApiRequestError } from "@/lib/types/api";
import type { TrendProblemDraftItemOut, TrendProblemDraftTarget } from "@/lib/types/api";
import type { Difficulty, Test, Unit } from "@/lib/types/models";
import { DIFFICULTY_LABEL } from "@/lib/constants";

interface Target {
  test: Test;
  unit: Unit;
}

interface DraftState {
  key: string;
  test: Test;
  unit: Unit;
  formatId: number;
  difficulty: Difficulty;
  body: string;
  answer: string;
  explanation: string;
  hints: [string, string, string];
  prerequisiteUnitIds: number[];
  saving: boolean;
  saved: boolean;
  error: string | null;
}

let draftKeySeq = 0;

export default function ProblemsFromTrendsPage() {
  const { user } = useAuth();

  const tests = useApiData(() => testsApi.list(), []);
  const formats = useApiData(() => formatsApi.list(), []);
  const allUnits = useApiData(async () => {
    const textbooks = await textbooksApi.list();
    const lists = await Promise.all(textbooks.map((t) => unitsApi.list(t.id)));
    return lists.flat();
  }, []);

  const [testId, setTestId] = useState<number | null>(null);
  const [unitId, setUnitId] = useState<number | null>(null);
  const [targets, setTargets] = useState<Target[]>([]);

  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftState[]>([]);

  const selectedTest = tests.data?.find((t) => t.id === testId) ?? null;
  const unitsForSelectedTest = selectedTest
    ? (allUnits.data ?? []).filter((u) => u.textbook_id === selectedTest.textbook_id)
    : [];

  function addTarget() {
    if (!selectedTest || !unitId) return;
    const unit = (allUnits.data ?? []).find((u) => u.id === unitId);
    if (!unit) return;
    setTargets((ts) =>
      ts.some((t) => t.test.id === selectedTest.id && t.unit.id === unit.id)
        ? ts
        : [...ts, { test: selectedTest, unit }]
    );
    setUnitId(null);
  }

  function removeTarget(testIdToRemove: number, unitIdToRemove: number) {
    setTargets((ts) =>
      ts.filter((t) => !(t.test.id === testIdToRemove && t.unit.id === unitIdToRemove))
    );
  }

  async function handleGenerate() {
    if (!user || targets.length === 0) return;
    setGenerating(true);
    setGenError(null);
    setDrafts([]);
    try {
      const body: { user_id: number; targets: TrendProblemDraftTarget[] } = {
        user_id: user.id,
        targets: targets.map((t) => ({ test_id: t.test.id, unit_id: t.unit.id })),
      };
      const res = await llmApi.trendProblemDraft(body);
      const next: DraftState[] = res.drafts.map((d: TrendProblemDraftItemOut) => {
        const target = targets.find((t) => t.test.id === d.test_id && t.unit.id === d.unit_id);
        const sortedHints = [...d.hints].sort((a, b) => a.step - b.step);
        return {
          key: `draft-${++draftKeySeq}`,
          test: target?.test ?? targets[0].test,
          unit: target?.unit ?? targets[0].unit,
          formatId: d.format_id,
          difficulty: d.difficulty,
          body: d.body,
          answer: d.answer,
          explanation: d.explanation,
          hints: [sortedHints[0]?.body ?? "", sortedHints[1]?.body ?? "", sortedHints[2]?.body ?? ""],
          prerequisiteUnitIds: d.prerequisite_unit_ids,
          saving: false,
          saved: false,
          error: null,
        };
      });
      setDrafts(next);
      if (next.length === 0) {
        setGenError("有効な下書きが得られませんでした。傾向データが登録されているか確認してください。");
      }
    } catch (err) {
      setGenError(err instanceof ApiRequestError ? err.message : "作問に失敗しました");
    } finally {
      setGenerating(false);
    }
  }

  function updateDraft(key: string, patch: Partial<DraftState>) {
    setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  function updateHint(key: string, i: 0 | 1 | 2, value: string) {
    setDrafts((ds) =>
      ds.map((d) => {
        if (d.key !== key) return d;
        const hints = [...d.hints] as [string, string, string];
        hints[i] = value;
        return { ...d, hints };
      })
    );
  }

  function togglePrerequisite(key: string, unitIdToToggle: number) {
    setDrafts((ds) =>
      ds.map((d) =>
        d.key === key
          ? {
              ...d,
              prerequisiteUnitIds: d.prerequisiteUnitIds.includes(unitIdToToggle)
                ? d.prerequisiteUnitIds.filter((id) => id !== unitIdToToggle)
                : [...d.prerequisiteUnitIds, unitIdToToggle],
            }
          : d
      )
    );
  }

  async function saveDraft(key: string) {
    if (!user) return;
    const draft = drafts.find((d) => d.key === key);
    if (!draft) return;
    if (draft.hints.some((h) => !h.trim())) {
      updateDraft(key, { error: "ヒントは3段すべて入力してください" });
      return;
    }
    updateDraft(key, { saving: true, error: null });
    try {
      await problemsApi.create({
        unit_id: draft.unit.id,
        format_id: draft.formatId,
        difficulty: draft.difficulty,
        body: draft.body,
        answer: draft.answer,
        explanation: draft.explanation,
        is_return: false,
        hints: draft.hints,
        prerequisite_unit_ids: draft.prerequisiteUnitIds,
        source: "llm",
      });
      updateDraft(key, { saving: false, saved: true });
    } catch (err) {
      updateDraft(key, {
        saving: false,
        error: err instanceof ApiRequestError ? err.message : "保存に失敗しました",
      });
    }
  }

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <h1 className="text-lg font-semibold text-slate-900">問題作成（過去問の傾向から）</h1>
      <p className="text-sm text-slate-500">
        過去問と単元を選んで追加すると、その組み合わせの出題傾向（形式・難易度・配点）をもとにLLMが問題の下書きをまとめて生成します。
      </p>

      <Card>
        <CardContent className="flex flex-col gap-4 p-4">
          <h2 className="text-sm font-semibold text-slate-700">傾向選択</h2>
          {tests.loading && <LoadingBlock />}
          {tests.error && <ErrorBlock message={tests.error} />}
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>過去問</Label>
              <Select
                value={testId ? String(testId) : ""}
                onValueChange={(v) => {
                  setTestId(Number(v));
                  setUnitId(null);
                }}
              >
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="テストを選択" />
                </SelectTrigger>
                <SelectContent>
                  {tests.data?.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.year}年 {t.grade} {t.term}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>単元</Label>
              <Select
                value={unitId ? String(unitId) : ""}
                onValueChange={(v) => setUnitId(Number(v))}
                disabled={!selectedTest}
              >
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="単元を選択" />
                </SelectTrigger>
                <SelectContent>
                  {[...unitsForSelectedTest]
                    .sort((a, b) => a.order_no - b.order_no)
                    .map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" variant="outline" onClick={addTarget} disabled={!selectedTest || !unitId}>
              <Plus className="h-4 w-4" />
              追加
            </Button>
          </div>

          {targets.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>過去問</TableHead>
                  <TableHead>単元</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {targets.map((t) => (
                  <TableRow key={`${t.test.id}-${t.unit.id}`}>
                    <TableCell>
                      {t.test.year}年 {t.test.grade} {t.test.term}
                    </TableCell>
                    <TableCell>{t.unit.name}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeTarget(t.test.id, t.unit.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div>
            <Button
              variant="llm"
              onClick={handleGenerate}
              disabled={targets.length === 0 || generating}
            >
              <Sparkles className="h-4 w-4" />
              {generating ? "作問中…" : "この内容で作問する"}
            </Button>
          </div>
          {genError && <ErrorBlock message={genError} />}
        </CardContent>
      </Card>

      {drafts.length > 0 && (
        <div className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-slate-700">下書き（レビューして保存）</h2>
          {drafts.map((d) => (
            <Card key={d.key}>
              <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="llm">LLM下書き</Badge>
                  <span className="text-xs text-slate-500">
                    {d.test.year}年 {d.test.grade} {d.test.term} ／ {d.unit.name}
                  </span>
                  {d.saved && <Badge variant="success">保存済み</Badge>}
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label>形式</Label>
                    <Select
                      value={String(d.formatId)}
                      onValueChange={(v) => updateDraft(d.key, { formatId: Number(v) })}
                      disabled={d.saved}
                    >
                      <SelectTrigger>
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
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>難易度</Label>
                    <Select
                      value={String(d.difficulty)}
                      onValueChange={(v) =>
                        updateDraft(d.key, { difficulty: Number(v) as Difficulty })
                      }
                      disabled={d.saved}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {([1, 2, 3] as Difficulty[]).map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {DIFFICULTY_LABEL[n]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label>問題文（LaTeX可： $ ... $ または $$ ... $$）</Label>
                    <Textarea
                      rows={4}
                      value={d.body}
                      onChange={(e) => updateDraft(d.key, { body: e.target.value })}
                      disabled={d.saved}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>プレビュー</Label>
                    <Card>
                      <CardContent className="p-3">
                        <LatexPreview text={d.body} />
                      </CardContent>
                    </Card>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label>正答</Label>
                    <Textarea
                      rows={2}
                      value={d.answer}
                      onChange={(e) => updateDraft(d.key, { answer: e.target.value })}
                      disabled={d.saved}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>解説</Label>
                    <Textarea
                      rows={2}
                      value={d.explanation}
                      onChange={(e) => updateDraft(d.key, { explanation: e.target.value })}
                      disabled={d.saved}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <Label>ヒント（3段必須）</Label>
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="mt-2 w-16 shrink-0 text-xs text-slate-500">ヒント{i + 1}</span>
                      <Textarea
                        rows={2}
                        value={d.hints[i as 0 | 1 | 2]}
                        onChange={(e) => updateHint(d.key, i as 0 | 1 | 2, e.target.value)}
                        className="flex-1"
                        disabled={d.saved}
                      />
                    </div>
                  ))}
                </div>

                <div className="flex flex-col gap-2">
                  <Label>前提単元</Label>
                  <div className="flex flex-wrap gap-2">
                    {(allUnits.data ?? [])
                      .filter((u) => u.id !== d.unit.id)
                      .map((u) => (
                        <label
                          key={u.id}
                          className="flex items-center gap-1.5 rounded-full border border-slate-300 px-2.5 py-1 text-xs text-slate-700"
                        >
                          <Checkbox
                            checked={d.prerequisiteUnitIds.includes(u.id)}
                            onCheckedChange={() => togglePrerequisite(d.key, u.id)}
                            disabled={d.saved}
                          />
                          {u.name}
                        </label>
                      ))}
                  </div>
                </div>

                {d.error && <ErrorBlock message={d.error} />}

                <div>
                  <Button onClick={() => saveDraft(d.key)} disabled={d.saving || d.saved}>
                    {d.saved ? "保存済み" : d.saving ? "保存中…" : "この案を保存"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
