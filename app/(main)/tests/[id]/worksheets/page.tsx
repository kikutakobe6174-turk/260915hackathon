"use client";

import { use, useState } from "react";
import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { worksheetsApi } from "@/lib/api/worksheets";
import { useApiData } from "@/lib/hooks/useApiData";
import { Button } from "@/components/ui/button";
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
import { ApiRequestError } from "@/lib/types/api";
import type { Level } from "@/lib/types/models";

export default function WorksheetsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const testId = Number(id);

  const { data, loading, error, reload } = useApiData(
    () => worksheetsApi.listForTest(testId),
    [testId]
  );

  const [newLevel, setNewLevel] = useState<Level>("A");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function createWorksheet() {
    setCreating(true);
    setCreateError(null);
    try {
      await worksheetsApi.create(testId, { level: newLevel, items: [] });
      reload();
    } catch (err) {
      setCreateError(err instanceof ApiRequestError ? err.message : "作成に失敗しました");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">冊子構成</h2>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={`/tests/${testId}/print-preview`}>
              <FileText className="h-4 w-4" />印刷プレビュー・PDF出力
            </Link>
          </Button>
          <Select value={newLevel} onValueChange={(v) => setNewLevel(v as Level)}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="A">A</SelectItem>
              <SelectItem value="B">B</SelectItem>
              <SelectItem value="C">C</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={createWorksheet} disabled={creating}>
            <Plus className="h-4 w-4" />
            新しい冊子を作成
          </Button>
        </div>
      </div>

      {createError && <ErrorBlock message={createError} />}
      {loading && <LoadingBlock />}
      {error && <ErrorBlock message={error} />}
      {!loading && !error && (data?.length ?? 0) === 0 && (
        <EmptyBlock label="冊子がまだありません" />
      )}
      {!loading && !error && (data?.length ?? 0) > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>レベル</TableHead>
              <TableHead>版</TableHead>
              <TableHead>問題数</TableHead>
              <TableHead>状態</TableHead>
              <TableHead>印刷</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data!.map((w) => (
              <TableRow key={w.id}>
                <TableCell>
                  <Badge variant="outline">{w.level}</Badge>
                </TableCell>
                <TableCell>v{w.version}</TableCell>
                <TableCell>{w.items.length}</TableCell>
                <TableCell>
                  {w.locked ? (
                    <Badge variant="secondary">編集不可（解答記録あり）</Badge>
                  ) : (
                    <Badge variant="success">編集可</Badge>
                  )}
                </TableCell>
                <TableCell>{w.printed_at ? "印刷済み" : "未印刷"}</TableCell>
                <TableCell>
                  <Link href={`/worksheets/${w.id}`} className="text-sm text-slate-600 hover:underline">
                    開く
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
