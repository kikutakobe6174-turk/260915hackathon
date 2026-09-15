"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2, ListOrdered } from "lucide-react";
import { textbooksApi } from "@/lib/api/masters";
import { useApiData } from "@/lib/hooks/useApiData";
import { MastersNav } from "@/components/masters/MastersNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "@/components/ui/status";
import { ApiRequestError } from "@/lib/types/api";
import type { Textbook } from "@/lib/types/models";

const emptyForm = { publisher: "", title: "", subject: "" };

export default function TextbooksPage() {
  const { data, loading, error, reload } = useApiData(() => textbooksApi.list(), []);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Textbook | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(t: Textbook) {
    setEditing(t);
    setForm({ publisher: t.publisher, title: t.title, subject: t.subject });
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      if (editing) {
        await textbooksApi.update(editing.id, form);
      } else {
        await textbooksApi.create(form);
      }
      setDialogOpen(false);
      reload();
    } catch (err) {
      setFormError(err instanceof ApiRequestError ? err.message : "保存に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(t: Textbook) {
    if (!confirm(`「${t.title}」を削除しますか？`)) return;
    try {
      await textbooksApi.remove(t.id);
      reload();
    } catch (err) {
      alert(err instanceof ApiRequestError ? err.message : "削除に失敗しました");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <MastersNav />
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">教科書</h1>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          教科書を追加
        </Button>
      </div>

      {loading && <LoadingBlock />}
      {error && <ErrorBlock message={error} />}
      {!loading && !error && (data?.length ?? 0) === 0 && (
        <EmptyBlock label="登録された教科書はありません" />
      )}
      {!loading && !error && (data?.length ?? 0) > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>出版社</TableHead>
              <TableHead>教科書名</TableHead>
              <TableHead>科目</TableHead>
              <TableHead className="w-40" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data!.map((t) => (
              <TableRow key={t.id}>
                <TableCell>{t.publisher}</TableCell>
                <TableCell className="font-medium text-slate-900">{t.title}</TableCell>
                <TableCell>{t.subject}</TableCell>
                <TableCell className="flex gap-1">
                  <Link href={`/masters/textbooks/${t.id}/units`}>
                    <Button variant="ghost" size="sm">
                      <ListOrdered className="h-4 w-4" />
                      単元
                    </Button>
                  </Link>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(t)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(t)}>
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
            <DialogTitle>{editing ? "教科書を編集" : "教科書を追加"}</DialogTitle>
          </DialogHeader>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-1.5">
              <Label>出版社</Label>
              <Input
                autoFocus
                value={form.publisher}
                onChange={(e) => setForm((f) => ({ ...f, publisher: e.target.value }))}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>教科書名</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>科目</Label>
              <Input
                value={form.subject}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                required
              />
            </div>
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
