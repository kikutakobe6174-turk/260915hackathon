"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { schoolsApi, textbooksApi, unitsApi } from "@/lib/api/masters";
import { testsApi } from "@/lib/api/tests";
import { useApiData } from "@/lib/hooks/useApiData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorBlock } from "@/components/ui/status";
import { ApiRequestError } from "@/lib/types/api";
import type { TestKind } from "@/lib/types/models";

export default function NewTestPage() {
  const router = useRouter();
  const schools = useApiData(() => schoolsApi.list(), []);
  const textbooks = useApiData(() => textbooksApi.list(), []);

  const [schoolId, setSchoolId] = useState<number | null>(null);
  const [textbookId, setTextbookId] = useState<number | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [grade, setGrade] = useState("");
  const [term, setTerm] = useState("");
  const [kind, setKind] = useState<TestKind>("target");
  const [unitIds, setUnitIds] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const units = useApiData(
    () => (textbookId ? unitsApi.list(textbookId) : Promise.resolve([])),
    [textbookId]
  );

  function toggleUnit(id: number) {
    setUnitIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!schoolId || !textbookId) {
      setError("学校と教科書を選択してください");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const test = await testsApi.create({
        school_id: schoolId,
        textbook_id: textbookId,
        year,
        grade,
        term,
        kind,
        unit_ids: unitIds,
      });
      router.push(`/tests/${test.id}/trends`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "登録に失敗しました");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <h1 className="text-lg font-semibold text-slate-900">テスト登録</h1>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-1.5">
          <Label>学校</Label>
          <Select
            value={schoolId ? String(schoolId) : ""}
            onValueChange={(v) => setSchoolId(Number(v))}
          >
            <SelectTrigger>
              <SelectValue placeholder="選択してください" />
            </SelectTrigger>
            <SelectContent>
              {schools.data?.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>教科書</Label>
          <Select
            value={textbookId ? String(textbookId) : ""}
            onValueChange={(v) => {
              setTextbookId(Number(v));
              setUnitIds([]);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="選択してください" />
            </SelectTrigger>
            <SelectContent>
              {textbooks.data?.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>年度</Label>
            <Input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>学年</Label>
            <Input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="例: 中1" required />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>テスト回</Label>
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="例: 2学期中間"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>種別</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as TestKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="past">過去テスト</SelectItem>
                <SelectItem value="target">対策対象</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {textbookId && (
          <div className="flex flex-col gap-1.5">
            <Label>テスト範囲（単元）</Label>
            <Card>
              <CardContent className="flex max-h-64 flex-col gap-2 overflow-y-auto p-3">
                {units.data?.length === 0 && (
                  <p className="text-xs text-slate-400">単元が登録されていません</p>
                )}
                {[...(units.data ?? [])]
                  .sort((a, b) => a.order_no - b.order_no)
                  .map((u) => (
                    <label key={u.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={unitIds.includes(u.id)}
                        onCheckedChange={() => toggleUnit(u.id)}
                      />
                      {u.order_no}. {u.name}
                    </label>
                  ))}
              </CardContent>
            </Card>
          </div>
        )}

        {error && <ErrorBlock message={error} />}

        <Button type="submit" disabled={submitting} className="self-start">
          {submitting ? "登録中…" : "登録して出題傾向の入力へ"}
        </Button>
      </form>
    </div>
  );
}
