"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Printer, Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { worksheetsApi } from "@/lib/api/worksheets";
import { problemsApi } from "@/lib/api/problems";
import { unitsApi, formatsApi, textbooksApi } from "@/lib/api/masters";
import { testsApi } from "@/lib/api/tests";
import { useApiData } from "@/lib/hooks/useApiData";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "@/components/ui/status";
import { ApiRequestError } from "@/lib/types/api";

interface EditableItem {
  key: string;
  problemId: number;
  isReturn: boolean;
  parentKey: string | null;
}

let seq = 0;
function newKey() {
  return `new-${++seq}`;
}

// item_no（本問 1,2,3… / 戻り R-1,R-2…）をクライアント側でプレビュー計算する。
// 実際の採番はbackend側（PUT/POST時）が同じロジックで行う。
function computeItemNos(items: EditableItem[]): string[] {
  let main = 0;
  let ret = 0;
  return items.map((it) => (it.isReturn ? `R-${++ret}` : `${++main}`));
}

export default function WorksheetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const worksheetId = Number(id);
  const router = useRouter();

  const { data: worksheet, loading, error, reload } = useApiData(
    () => worksheetsApi.get(worksheetId),
    [worksheetId]
  );
  const { data: test } = useApiData(
    () => (worksheet ? testsApi.get(worksheet.test_id) : Promise.resolve(null)),
    [worksheet?.test_id]
  );
  const reviewedProblems = useApiData(
    () => problemsApi.list({ status: "reviewed" }),
    []
  );
  const allUnits = useApiData(async () => {
    const textbooks = await textbooksApi.list();
    const lists = await Promise.all(textbooks.map((t) => unitsApi.list(t.id)));
    return lists.flat();
  }, []);
  const formats = useApiData(() => formatsApi.list(), []);

  const [items, setItems] = useState<EditableItem[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pickProblemId, setPickProblemId] = useState<string>("");

  useEffect(() => {
    if (!worksheet || initialized) return;
    async function apply() {
      if (!worksheet) return;
      const keyByOldId = new Map<number, string>();
      const mapped: EditableItem[] = worksheet.items.map((it) => {
        const key = `existing-${it.id}`;
        keyByOldId.set(it.id, key);
        return { key, problemId: it.problem_id, isReturn: it.is_return, parentKey: null };
      });
      // parent_item_id を parentKey に変換（2パス目）
      worksheet.items.forEach((it, i) => {
        if (it.parent_item_id !== null) {
          mapped[i].parentKey = keyByOldId.get(it.parent_item_id) ?? null;
        }
      });
      setItems(mapped);
      setInitialized(true);
    }
    apply();
  }, [worksheet, initialized]);

  if (loading) return <LoadingBlock />;
  if (error) return <ErrorBlock message={error} />;
  if (!worksheet) return null;

  const problemInfo = (id: number) => reviewedProblems.data?.find((p) => p.id === id);
  const unitName = (id: number) => allUnits.data?.find((u) => u.id === id)?.name ?? `#${id}`;
  const formatName = (id: number) => formats.data?.find((f) => f.id === id)?.name ?? `#${id}`;

  const itemNos = computeItemNos(items);
  const mainItems = items.filter((it) => !it.isReturn);
  const usedProblemIds = new Set(items.map((it) => it.problemId));
  const availableProblems = (reviewedProblems.data ?? []).filter((p) => !usedProblemIds.has(p.id));

  function addProblem() {
    if (!pickProblemId) return;
    const problem = reviewedProblems.data?.find((p) => p.id === Number(pickProblemId));
    if (!problem) return;
    setItems((its) => [
      ...its,
      {
        key: newKey(),
        problemId: problem.id,
        isReturn: problem.is_return,
        parentKey: null,
      },
    ]);
    setPickProblemId("");
  }

  function removeItem(key: string) {
    setItems((its) => its.filter((it) => it.key !== key).map((it) => (it.parentKey === key ? { ...it, parentKey: null } : it)));
  }

  function move(index: number, dir: -1 | 1) {
    setItems((its) => {
      const next = [...its];
      const target = index + dir;
      if (target < 0 || target >= next.length) return its;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function setParent(key: string, parentKey: string | null) {
    setItems((its) => its.map((it) => (it.key === key ? { ...it, parentKey } : it)));
  }

  async function handleSave() {
    const missingParent = items.find((it) => it.isReturn && !it.parentKey);
    if (missingParent) {
      setSaveError("戻り問題には元の問題を指定してください");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const keyToIndex = new Map(items.map((it, i) => [it.key, i]));
      const payload = {
        level: worksheet!.level,
        items: items.map((it) => ({
          problem_id: it.problemId,
          is_return: it.isReturn,
          parent_index: it.parentKey ? keyToIndex.get(it.parentKey) ?? null : null,
        })),
      };
      if (worksheet!.locked) {
        const created = await worksheetsApi.create(worksheet!.test_id, payload);
        router.push(`/worksheets/${created.id}`);
      } else {
        await worksheetsApi.update(worksheetId, payload);
        reload();
      }
    } catch (err) {
      setSaveError(err instanceof ApiRequestError ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
        }
      `}</style>

      <div className="no-print flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">
            冊子 {worksheet.level} v{worksheet.version}
            {test && ` — ${test.year}年 ${test.grade} ${test.term}`}
          </h1>
          {worksheet.locked && (
            <p className="mt-1 text-sm text-amber-700">
              この冊子には解答記録があるため編集できません。保存すると新しい版（v{worksheet.version + 1}）が作成されます。
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          印刷
        </Button>
      </div>

      <div className="no-print flex items-center gap-2">
        <Select value={pickProblemId} onValueChange={setPickProblemId}>
          <SelectTrigger className="w-96">
            <SelectValue placeholder="確認済み問題を選択して追加" />
          </SelectTrigger>
          <SelectContent>
            {availableProblems.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {unitName(p.unit_id)} / {formatName(p.format_id)} / 難{p.difficulty}
                {p.is_return ? "（戻り用）" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={addProblem} disabled={!pickProblemId}>
          <Plus className="h-4 w-4" />
          追加
        </Button>
      </div>

      {items.length === 0 && <EmptyBlock label="まだ問題が追加されていません" />}

      <div className="flex flex-col gap-2">
        {items.map((it, i) => {
          const problem = problemInfo(it.problemId);
          return (
            <Card key={it.key} className={it.isReturn ? "ml-8 border-dashed" : ""}>
              <CardContent className="flex items-center gap-3 p-3">
                <Badge variant={it.isReturn ? "secondary" : "default"} className="w-12 justify-center">
                  {itemNos[i]}
                </Badge>
                <div className="flex-1 text-sm">
                  {problem ? (
                    <>
                      {unitName(problem.unit_id)} / {formatName(problem.format_id)} / 難{problem.difficulty}
                    </>
                  ) : (
                    `問題#${it.problemId}`
                  )}
                  {it.isReturn && (
                    <span className="ml-2 no-print">
                      <Select value={it.parentKey ?? ""} onValueChange={(v) => setParent(it.key, v)}>
                        <SelectTrigger className="inline-flex h-7 w-48">
                          <SelectValue placeholder="元の問題を選択" />
                        </SelectTrigger>
                        <SelectContent>
                          {mainItems.map((m) => (
                            <SelectItem key={m.key} value={m.key}>
                              {itemNos[items.indexOf(m)]}: {problemInfo(m.problemId) ? unitName(problemInfo(m.problemId)!.unit_id) : m.problemId}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </span>
                  )}
                </div>
                <div className="no-print flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => move(i, -1)} disabled={i === 0}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => move(i, 1)} disabled={i === items.length - 1}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => removeItem(it.key)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {saveError && <ErrorBlock message={saveError} />}

      <div className="no-print">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "保存中…" : worksheet.locked ? "新しい版として保存" : "保存"}
        </Button>
      </div>
    </div>
  );
}
