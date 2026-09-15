"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { lessonsApi } from "@/lib/api/lessons";
import { testsApi } from "@/lib/api/tests";
import { schoolsApi } from "@/lib/api/masters";
import { useApiData } from "@/lib/hooks/useApiData";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "@/components/ui/status";
import { ApiRequestError } from "@/lib/types/api";

export default function LessonsPage() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useApiData(() => lessonsApi.list(), []);
  const tests = useApiData(() => testsApi.list(), []);
  const schools = useApiData(() => schoolsApi.list(), []);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [testId, setTestId] = useState<number | null>(null);
  const [lessonDate, setLessonDate] = useState("");
  const [className, setClassName] = useState("");
  const [round, setRound] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const testLabel = (id: number) => {
    const t = tests.data?.find((x) => x.id === id);
    if (!t) return `#${id}`;
    const school = schools.data?.find((s) => s.id === t.school_id)?.name ?? "";
    return `${t.year}年 ${school} ${t.grade} ${t.term}`;
  };

  function openCreate() {
    setTestId(tests.data?.[0]?.id ?? null);
    setLessonDate(new Date().toISOString().slice(0, 10));
    setClassName("");
    setRound(1);
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!testId) {
      setFormError("テストを選択してください");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await lessonsApi.create({
        test_id: testId,
        lesson_date: lessonDate,
        class_name: className,
        round,
      });
      setDialogOpen(false);
      reload();
    } catch (err) {
      setFormError(err instanceof ApiRequestError ? err.message : "登録に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">授業回一覧</h1>
        {user?.role === "operator" && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            授業回を作成
          </Button>
        )}
      </div>

      {loading && <LoadingBlock />}
      {error && <ErrorBlock message={error} />}
      {!loading && !error && (data?.length ?? 0) === 0 && (
        <EmptyBlock label="登録された授業回はありません" />
      )}
      {!loading && !error && (data?.length ?? 0) > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>授業日</TableHead>
              <TableHead>クラス名</TableHead>
              <TableHead>周回</TableHead>
              <TableHead>テスト</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data!.map((l) => (
              <TableRow key={l.id}>
                <TableCell>{l.lesson_date}</TableCell>
                <TableCell>{l.class_name}</TableCell>
                <TableCell>第{l.round}周</TableCell>
                <TableCell>{testLabel(l.test_id)}</TableCell>
                <TableCell>
                  <Link href={`/lessons/${l.id}`} className="text-sm text-slate-600 hover:underline">
                    開く
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>授業回を作成</DialogTitle>
          </DialogHeader>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-1.5">
              <Label>テスト</Label>
              <Select value={testId ? String(testId) : ""} onValueChange={(v) => setTestId(Number(v))}>
                <SelectTrigger>
                  <SelectValue placeholder="選択してください" />
                </SelectTrigger>
                <SelectContent>
                  {tests.data?.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {testLabel(t.id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>授業日</Label>
              <Input
                type="date"
                value={lessonDate}
                onChange={(e) => setLessonDate(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>クラス名</Label>
              <Input value={className} onChange={(e) => setClassName(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>何周目</Label>
              <Input
                type="number"
                min={1}
                value={round}
                onChange={(e) => setRound(Number(e.target.value))}
                required
              />
            </div>
            {formError && <ErrorBlock message={formError} />}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                キャンセル
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "作成中…" : "作成"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
