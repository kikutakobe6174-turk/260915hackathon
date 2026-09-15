"use client";

import { use, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Pencil, Trash2 } from "lucide-react";
import { unitsApi, textbooksApi } from "@/lib/api/masters";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "@/components/ui/status";
import { ApiRequestError, type UnitImportRow } from "@/lib/types/api";
import type { Unit } from "@/lib/types/models";

export default function UnitsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const textbookId = Number(id);

  const textbook = useApiData(() => textbooksApi.list(), []);
  const { data, loading, error, reload } = useApiData(
    () => unitsApi.list(textbookId),
    [textbookId]
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Unit | null>(null);
  const [name, setName] = useState("");
  const [orderNo, setOrderNo] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const currentTextbook = textbook.data?.find((t) => t.id === textbookId);

  function openCreate() {
    setEditing(null);
    setName("");
    setOrderNo((data?.length ?? 0) + 1);
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(u: Unit) {
    setEditing(u);
    setName(u.name);
    setOrderNo(u.order_no);
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      if (editing) {
        await unitsApi.update(editing.id, { name, order_no: orderNo });
      } else {
        await unitsApi.create(textbookId, { name, order_no: orderNo });
      }
      setDialogOpen(false);
      reload();
    } catch (err) {
      setFormError(err instanceof ApiRequestError ? err.message : "保存に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(u: Unit) {
    if (!confirm(`「${u.name}」を削除しますか？`)) return;
    try {
      await unitsApi.remove(u.id);
      reload();
    } catch (err) {
      alert(err instanceof ApiRequestError ? err.message : "削除に失敗しました");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <MastersNav />
      <div>
        <Link
          href="/masters/textbooks"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          教科書一覧へ戻る
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">
          単元{currentTextbook ? `（${currentTextbook.title}）` : ""}
        </h1>
        <div className="flex gap-2">
          <CsvImportDialog<UnitImportRow>
            title="単元のCSV取込"
            columns={[
              { key: "name", label: "name（単元名）" },
              { key: "order_no", label: "order_no（教科書内の順序、数値）" },
            ]}
            helpText="1行目はヘッダー行（name,order_no）にしてください。"
            parseRow={(raw) => ({
              name: raw.name?.trim() ?? "",
              order_no: Number(raw.order_no ?? 0),
            })}
            formatPreview={(row) => `${row.order_no}. ${row.name}`}
            onImport={(rows) => unitsApi.import(textbookId, rows)}
            onImported={reload}
          />
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            単元を追加
          </Button>
        </div>
      </div>

      {loading && <LoadingBlock />}
      {error && <ErrorBlock message={error} />}
      {!loading && !error && (data?.length ?? 0) === 0 && (
        <EmptyBlock label="登録された単元はありません" />
      )}
      {!loading && !error && (data?.length ?? 0) > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">順序</TableHead>
              <TableHead>単元名</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...data!]
              .sort((a, b) => a.order_no - b.order_no)
              .map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="text-slate-400">{u.order_no}</TableCell>
                  <TableCell>{u.name}</TableCell>
                  <TableCell className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(u)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(u)}>
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
            <DialogTitle>{editing ? "単元を編集" : "単元を追加"}</DialogTitle>
          </DialogHeader>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-1.5">
              <Label>単元名</Label>
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>順序</Label>
              <Input
                type="number"
                value={orderNo}
                onChange={(e) => setOrderNo(Number(e.target.value))}
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
