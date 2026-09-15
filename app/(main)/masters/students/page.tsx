"use client";

import { useState, type FormEvent } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { studentsApi } from "@/lib/api/students";
import { schoolsApi } from "@/lib/api/masters";
import { useApiData } from "@/lib/hooks/useApiData";
import { MastersNav } from "@/components/masters/MastersNav";
import { CsvImportDialog } from "@/components/masters/CsvImportDialog";
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
import { Badge } from "@/components/ui/badge";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "@/components/ui/status";
import { ApiRequestError, type StudentImportRow } from "@/lib/types/api";
import type { Level, Student } from "@/lib/types/models";

const LEVELS: Level[] = ["A", "B", "C"];

const emptyForm = {
  student_code: "",
  school_id: 0,
  grade: "",
  level: "A" as Level,
  active: true,
};

export default function StudentsPage() {
  const schools = useApiData(() => schoolsApi.list(), []);
  const { data, loading, error, reload } = useApiData(() => studentsApi.list(), []);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const schoolName = (schoolId: number) =>
    schools.data?.find((s) => s.id === schoolId)?.name ?? `#${schoolId}`;

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm, school_id: schools.data?.[0]?.id ?? 0 });
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(s: Student) {
    setEditing(s);
    setForm({
      student_code: s.student_code,
      school_id: s.school_id,
      grade: s.grade,
      level: s.level,
      active: s.active,
    });
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      if (editing) {
        await studentsApi.update(editing.id, form);
      } else {
        await studentsApi.create(form);
      }
      setDialogOpen(false);
      reload();
    } catch (err) {
      setFormError(err instanceof ApiRequestError ? err.message : "保存に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(s: Student) {
    if (!confirm(`生徒番号「${s.student_code}」を削除しますか？`)) return;
    try {
      await studentsApi.remove(s.id);
      reload();
    } catch (err) {
      alert(err instanceof ApiRequestError ? err.message : "削除に失敗しました");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <MastersNav />
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">生徒</h1>
        <div className="flex gap-2">
          <CsvImportDialog<StudentImportRow>
            title="生徒のCSV取込"
            columns={[
              { key: "student_code", label: "student_code（生徒番号）" },
              { key: "school_name", label: "school_name（学校名）" },
              { key: "grade", label: "grade（学年）" },
              { key: "level", label: "level（A/B/C）" },
            ]}
            helpText="1行目はヘッダー行（student_code,school_name,grade,level）にしてください。学校名は登録済みの学校と完全一致している必要があります。"
            parseRow={(raw) => ({
              student_code: raw.student_code?.trim() ?? "",
              school_name: raw.school_name?.trim() ?? "",
              grade: raw.grade?.trim() ?? "",
              level: (raw.level?.trim() as Level) ?? "A",
            })}
            formatPreview={(row) =>
              `${row.student_code} / ${row.school_name} / ${row.grade} / ${row.level}`
            }
            onImport={(rows) => studentsApi.import(rows)}
            onImported={reload}
          />
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            生徒を追加
          </Button>
        </div>
      </div>

      {loading && <LoadingBlock />}
      {error && <ErrorBlock message={error} />}
      {!loading && !error && (data?.length ?? 0) === 0 && (
        <EmptyBlock label="登録された生徒はいません" />
      )}
      {!loading && !error && (data?.length ?? 0) > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>生徒番号</TableHead>
              <TableHead>学校</TableHead>
              <TableHead>学年</TableHead>
              <TableHead>レベル</TableHead>
              <TableHead>状態</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data!.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium text-slate-900">{s.student_code}</TableCell>
                <TableCell>{schoolName(s.school_id)}</TableCell>
                <TableCell>{s.grade}</TableCell>
                <TableCell>
                  <Badge variant="outline">{s.level}</Badge>
                </TableCell>
                <TableCell>
                  {s.active ? (
                    <Badge variant="success">在籍中</Badge>
                  ) : (
                    <Badge variant="secondary">退会</Badge>
                  )}
                </TableCell>
                <TableCell className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(s)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "生徒を編集" : "生徒を追加"}</DialogTitle>
          </DialogHeader>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-1.5">
              <Label>生徒番号</Label>
              <Input
                autoFocus
                value={form.student_code}
                onChange={(e) => setForm((f) => ({ ...f, student_code: e.target.value }))}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>学校</Label>
              <Select
                value={String(form.school_id)}
                onValueChange={(v) => setForm((f) => ({ ...f, school_id: Number(v) }))}
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
              <Label>学年</Label>
              <Input
                value={form.grade}
                onChange={(e) => setForm((f) => ({ ...f, grade: e.target.value }))}
                placeholder="例: 中1"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>レベル</Label>
              <Select
                value={form.level}
                onValueChange={(v) => setForm((f) => ({ ...f, level: v as Level }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEVELS.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              />
              在籍中
            </label>
            {formError && <ErrorBlock message={formError} />}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                キャンセル
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "保存中…" : "保存"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
