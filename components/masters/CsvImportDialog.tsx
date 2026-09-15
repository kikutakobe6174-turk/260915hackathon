"use client";

import { useRef, useState } from "react";
import Papa from "papaparse";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorBlock } from "@/components/ui/status";
import { ApiRequestError, type ImportResult } from "@/lib/types/api";

interface CsvImportDialogProps<T> {
  title: string;
  columns: { key: string; label: string }[];
  helpText?: string;
  parseRow: (raw: Record<string, string>) => T;
  formatPreview: (row: T) => string;
  onImport: (rows: T[]) => Promise<ImportResult>;
  onImported: () => void;
}

export function CsvImportDialog<T>({
  title,
  columns,
  helpText,
  parseRow,
  formatPreview,
  onImport,
  onImported,
}: CsvImportDialogProps<T>) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<T[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setRows([]);
    setParseError(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleFile(file: File) {
    setParseError(null);
    setResult(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        try {
          const parsed = res.data.map(parseRow);
          setRows(parsed);
        } catch (err) {
          setParseError(err instanceof Error ? err.message : "CSVの読み込みに失敗しました");
        }
      },
      error: (err) => setParseError(err.message),
    });
  }

  async function handleConfirm() {
    setSubmitting(true);
    try {
      const res = await onImport(rows);
      setResult(res);
      if (res.created > 0) onImported();
    } catch (err) {
      setParseError(err instanceof ApiRequestError ? err.message : "取込に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4" />
        CSV取込
      </Button>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {helpText && <DialogDescription>{helpText}</DialogDescription>}
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          <p className="text-xs text-slate-500">
            列: {columns.map((c) => c.label).join(" / ")}
          </p>

          {parseError && <ErrorBlock message={parseError} />}

          {rows.length > 0 && !result && (
            <div className="max-h-64 overflow-y-auto rounded-md border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>内容</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-slate-400">{i + 1}</TableCell>
                      <TableCell>{formatPreview(row)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {result && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-slate-700">
                {result.created}件取り込みました。
              </p>
              {result.errors.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                  {result.errors.map((e, i) => (
                    <div key={i}>
                      行{e.row + 1}: {e.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {result ? "閉じる" : "キャンセル"}
            </Button>
            {!result && (
              <Button
                type="button"
                disabled={rows.length === 0 || submitting}
                onClick={handleConfirm}
              >
                {submitting ? "取込中…" : `${rows.length}件を確定`}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
