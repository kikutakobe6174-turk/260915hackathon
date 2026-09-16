"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Sparkles } from "lucide-react";
import { problemsApi } from "@/lib/api/problems";
import { formatsApi, textbooksApi, unitsApi } from "@/lib/api/masters";
import { prerequisitesApi } from "@/lib/api/tests";
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
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingBlock, ErrorBlock } from "@/components/ui/status";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { LatexPreview } from "@/components/problems/LatexPreview";
import { LLM_PROBLEM_DRAFT_AVAILABLE } from "@/lib/featureFlags";
import { ApiRequestError, type ProblemDraftItemOut } from "@/lib/types/api";
import type { Difficulty } from "@/lib/types/models";
import { PROBLEM_STATUS_LABEL } from "@/lib/constants";

interface InitialProblemQuery {
  unitId?: number;
  formatId?: number;
  difficulty?: Difficulty;
  testId?: number;
}

export function ProblemEditor({
  problemId,
  initialQuery,
}: {
  problemId?: number;
  initialQuery?: InitialProblemQuery;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const isEdit = problemId !== undefined;

  const existing = useApiData(
    () => (isEdit ? problemsApi.get(problemId) : Promise.resolve(null)),
    [problemId]
  );
  const allUnits = useApiData(async () => {
    const textbooks = await textbooksApi.list();
    const lists = await Promise.all(textbooks.map((t) => unitsApi.list(t.id)));
    return lists.flat();
  }, []);
  const formats = useApiData(() => formatsApi.list(), []);

  const [unitId, setUnitId] = useState<number | null>(initialQuery?.unitId ?? null);
  const [formatId, setFormatId] = useState<number | null>(initialQuery?.formatId ?? null);
  const [difficulty, setDifficulty] = useState<Difficulty>(initialQuery?.difficulty ?? 1);
  const [isReturn, setIsReturn] = useState(false);
  const [body, setBody] = useState("");
  const [answer, setAnswer] = useState("");
  const [explanation, setExplanation] = useState("");
  const [hints, setHints] = useState<[string, string, string]>(["", "", ""]);
  const [prerequisiteUnitIds, setPrerequisiteUnitIds] = useState<number[]>([]);

  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);

  const [draftDialogOpen, setDraftDialogOpen] = useState(false);
  const [draftCount, setDraftCount] = useState(3);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<ProblemDraftItemOut[]>([]);

  // 既存問題のデータで初期化
  useEffect(() => {
    if (!isEdit || !existing.data || initialized) return;
    const p = existing.data;
    async function apply() {
      setUnitId(p.unit_id);
      setFormatId(p.format_id);
      setDifficulty(p.difficulty);
      setIsReturn(p.is_return);
      setBody(p.body);
      setAnswer(p.answer);
      setExplanation(p.explanation ?? "");
      const sorted = [...p.hints].sort((a, b) => a.step - b.step);
      setHints([sorted[0]?.body ?? "", sorted[1]?.body ?? "", sorted[2]?.body ?? ""]);
      setPrerequisiteUnitIds(p.prerequisite_unit_ids);
      setInitialized(true);
    }
    apply();
  }, [isEdit, existing.data, initialized]);

  // 新規作成時：テストの前提単元マップの確定分を初期値として入れる
  useEffect(() => {
    if (isEdit || initialized) return;
    async function apply() {
      if (initialQuery?.testId && unitId) {
        const res = await prerequisitesApi.getForTest(initialQuery.testId);
        const group = res.units.find((u) => u.unit_id === unitId);
        const confirmedIds =
          group?.prerequisites.filter((p) => p.confirmed).map((p) => p.prerequisite_unit_id) ?? [];
        setPrerequisiteUnitIds(confirmedIds);
      }
      setInitialized(true);
    }
    apply();
  }, [isEdit, initialized, initialQuery?.testId, unitId]);

  function updateHint(i: 0 | 1 | 2, value: string) {
    setHints((h) => {
      const next = [...h] as [string, string, string];
      next[i] = value;
      return next;
    });
  }

  function togglePrerequisite(id: number) {
    setPrerequisiteUnitIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  async function handleSubmit() {
    if (!unitId || !formatId) {
      setError("単元と形式を選択してください");
      return;
    }
    if (hints.some((h) => !h.trim())) {
      setError("ヒントは3段すべて入力してください");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        unit_id: unitId,
        format_id: formatId,
        difficulty,
        body,
        answer,
        explanation,
        is_return: isReturn,
        hints,
        prerequisite_unit_ids: prerequisiteUnitIds,
      };
      if (isEdit) {
        await problemsApi.update(problemId, payload);
        existing.reload();
      } else {
        const created = await problemsApi.create(payload);
        router.push(`/problems/${created.id}`);
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateDrafts() {
    if (!user || !unitId || !formatId) return;
    setDraftLoading(true);
    setDraftError(null);
    setDrafts([]);
    try {
      const res = await llmApi.problemDraft({
        unit_id: unitId,
        format_id: formatId,
        difficulty,
        prerequisite_unit_ids: prerequisiteUnitIds,
        is_return: isReturn,
        count: draftCount,
        user_id: user.id,
      });
      setDrafts(res.drafts);
      if (res.drafts.length === 0) {
        setDraftError("有効な下書きが得られませんでした（ヒントが3段でない案は破棄されます）。");
      }
    } catch (err) {
      setDraftError(err instanceof ApiRequestError ? err.message : "下書きの生成に失敗しました");
    } finally {
      setDraftLoading(false);
    }
  }

  function applyDraft(draft: ProblemDraftItemOut) {
    setBody(draft.body);
    setAnswer(draft.answer);
    setExplanation(draft.explanation);
    const sorted = [...draft.hints].sort((a, b) => a.step - b.step);
    setHints([sorted[0]?.body ?? "", sorted[1]?.body ?? "", sorted[2]?.body ?? ""]);
    setPrerequisiteUnitIds(draft.prerequisite_unit_ids);
    setDraftDialogOpen(false);
    setDrafts([]);
  }

  async function handleReview() {
    if (!user || !problemId) return;
    setReviewing(true);
    setError(null);
    try {
      await problemsApi.review(problemId, { user_id: user.id });
      existing.reload();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "確認済み処理に失敗しました");
    } finally {
      setReviewing(false);
    }
  }

  if (isEdit && existing.loading) return <LoadingBlock />;
  if (isEdit && existing.error) return <ErrorBlock message={existing.error} />;

  const missingReturn = existing.data?.prerequisites_missing_return ?? [];

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">
          {isEdit ? "問題編集" : "問題の新規作成"}
        </h1>
        {isEdit && existing.data && (
          <Badge variant={existing.data.status === "reviewed" ? "success" : "warning"}>
            {PROBLEM_STATUS_LABEL[existing.data.status]}
          </Badge>
        )}
      </div>

      {missingReturn.length > 0 && (
        <ErrorBlock message="前提単元の中に、確認済みの戻り用問題が1問もない単元があります。" />
      )}

      <div>
        {/* /llm/problem-draft が未実装のため導線だけ隠す。実装したらフラグをtrueに戻す。 */}
        {LLM_PROBLEM_DRAFT_AVAILABLE && (
          <Button
            type="button"
            variant="llm"
            size="sm"
            disabled={!unitId || !formatId}
            onClick={() => {
              setDraftDialogOpen(true);
              setDrafts([]);
              setDraftError(null);
            }}
          >
            <Sparkles className="h-4 w-4" />
            下書きを生成
          </Button>
        )}
      </div>

      <Dialog open={draftDialogOpen} onOpenChange={setDraftDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>問題の下書きを生成</DialogTitle>
            <DialogDescription>
              単元・形式・難易度・前提単元をもとにLLMが問題案を作成します。過去テストの画像や文言は渡しません。生成された下書きは人が確認するまで確定データとして扱われません。
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Label className="shrink-0">案の数</Label>
              <Select value={String(draftCount)} onValueChange={(v) => setDraftCount(Number(v))}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="llm" onClick={handleGenerateDrafts} disabled={draftLoading}>
                <Sparkles className="h-4 w-4" />
                {draftLoading ? "生成中…" : "生成"}
              </Button>
            </div>

            {draftError && <ErrorBlock message={draftError} />}

            <div className="flex max-h-96 flex-col gap-3 overflow-y-auto">
              {drafts.map((d, i) => (
                <Card key={i}>
                  <CardContent className="flex flex-col gap-2 p-3">
                    <Badge variant="llm" className="w-fit">LLM下書き</Badge>
                    <LatexPreview text={d.body} />
                    <p className="text-xs text-slate-500">正答: {d.answer}</p>
                    <Button size="sm" variant="outline" className="self-start" onClick={() => applyDraft(d)}>
                      この案を使う
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-4 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>単元</Label>
          <Select value={unitId ? String(unitId) : ""} onValueChange={(v) => setUnitId(Number(v))}>
            <SelectTrigger>
              <SelectValue placeholder="選択" />
            </SelectTrigger>
            <SelectContent>
              {allUnits.data?.map((u) => (
                <SelectItem key={u.id} value={String(u.id)}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>形式</Label>
          <Select value={formatId ? String(formatId) : ""} onValueChange={(v) => setFormatId(Number(v))}>
            <SelectTrigger>
              <SelectValue placeholder="選択" />
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
          <Select value={String(difficulty)} onValueChange={(v) => setDifficulty(Number(v) as Difficulty)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">難易度1</SelectItem>
              <SelectItem value="2">難易度2</SelectItem>
              <SelectItem value="3">難易度3</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col justify-end gap-1.5 pb-1.5">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <Checkbox checked={isReturn} onCheckedChange={(v) => setIsReturn(v === true)} />
            戻り用の問題
          </label>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>問題文（LaTeX可： $ ... $ または $$ ... $$）</Label>
          <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>プレビュー</Label>
          <Card>
            <CardContent className="p-3">
              <LatexPreview text={body} />
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>正答</Label>
          <Textarea rows={2} value={answer} onChange={(e) => setAnswer(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>解説</Label>
          <Textarea rows={2} value={explanation} onChange={(e) => setExplanation(e.target.value)} />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <Label>ヒント（3段必須）</Label>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="mt-2 w-16 shrink-0 text-xs text-slate-500">ヒント{i + 1}</span>
            <Textarea
              rows={2}
              value={hints[i as 0 | 1 | 2]}
              onChange={(e) => updateHint(i as 0 | 1 | 2, e.target.value)}
              className="flex-1"
            />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <Label>前提単元</Label>
        <div className="flex flex-wrap gap-2">
          {allUnits.data
            ?.filter((u) => u.id !== unitId)
            .map((u) => (
              <label
                key={u.id}
                className="flex items-center gap-1.5 rounded-full border border-slate-300 px-2.5 py-1 text-xs text-slate-700"
              >
                <Checkbox
                  checked={prerequisiteUnitIds.includes(u.id)}
                  onCheckedChange={() => togglePrerequisite(u.id)}
                />
                {u.name}
                {prerequisiteUnitIds.includes(u.id) && (
                  <X className="h-3 w-3 cursor-pointer" onClick={() => togglePrerequisite(u.id)} />
                )}
              </label>
            ))}
        </div>
      </div>

      {error && <ErrorBlock message={error} />}

      <div className="flex gap-2">
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? "保存中…" : isEdit ? "保存" : "作成して続けて編集"}
        </Button>
        {isEdit && existing.data?.status === "draft" && (
          <Button variant="outline" onClick={handleReview} disabled={reviewing}>
            {reviewing ? "処理中…" : "確認済みにする"}
          </Button>
        )}
      </div>
    </div>
  );
}
