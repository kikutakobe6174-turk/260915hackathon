"use client";

import { useState, type FormEvent } from "react";
import { Plus, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "@/components/ui/status";
import { ApiRequestError } from "@/lib/types/api";

interface NamedEntity {
  id: number;
  name: string;
}

interface SimpleNameCrudProps {
  title: string;
  itemLabel: string;
  data: NamedEntity[] | null;
  loading: boolean;
  error: string | null;
  onCreate: (name: string) => Promise<unknown>;
  onUpdate: (id: number, name: string) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
  onReload: () => void;
}

export function SimpleNameCrud({
  title,
  itemLabel,
  data,
  loading,
  error,
  onCreate,
  onUpdate,
  onDelete,
  onReload,
}: SimpleNameCrudProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<NamedEntity | null>(null);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setName("");
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(item: NamedEntity) {
    setEditing(item);
    setName(item.name);
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      if (editing) {
        await onUpdate(editing.id, name);
      } else {
        await onCreate(name);
      }
      setDialogOpen(false);
      onReload();
    } catch (err) {
      setFormError(err instanceof ApiRequestError ? err.message : "保存に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(item: NamedEntity) {
    if (!confirm(`「${item.name}」を削除しますか？`)) return;
    try {
      await onDelete(item.id);
      onReload();
    } catch (err) {
      alert(err instanceof ApiRequestError ? err.message : "削除に失敗しました");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          {itemLabel}を追加
        </Button>
      </div>

      {loading && <LoadingBlock />}
      {error && <ErrorBlock message={error} />}
      {!loading && !error && (data?.length ?? 0) === 0 && (
        <EmptyBlock label={`登録された${itemLabel}はありません`} />
      )}
      {!loading && !error && (data?.length ?? 0) > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">ID</TableHead>
              <TableHead>名前</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data!.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="text-slate-400">{item.id}</TableCell>
                <TableCell>{item.name}</TableCell>
                <TableCell className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(item)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(item)}>
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
            <DialogTitle>{editing ? `${itemLabel}を編集` : `${itemLabel}を追加`}</DialogTitle>
          </DialogHeader>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="名前"
              required
            />
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
