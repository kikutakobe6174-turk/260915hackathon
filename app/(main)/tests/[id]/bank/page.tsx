"use client";

import { use, useState } from "react";
import Link from "next/link";
import { testsApi } from "@/lib/api/tests";
import { bankApi } from "@/lib/api/bank";
import { problemsApi } from "@/lib/api/problems";
import { unitsApi, formatsApi } from "@/lib/api/masters";
import { useApiData } from "@/lib/hooks/useApiData";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "@/components/ui/status";
import { cn } from "@/lib/utils";

const FLAG_LABEL: Record<string, string> = {
  LOW_ACCURACY_NO_HINT: "難易度1: ヒントなし正答率低",
  WRONG_AFTER_HINT3_HIGH: "ヒント3でも誤答が多い",
};

export default function BankPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const testId = Number(id);

  const { data: test } = useApiData(() => testsApi.get(testId), [testId]);
  const { data: coverage, loading: coverageLoading, error: coverageError } = useApiData(
    () => bankApi.coverage(testId),
    [testId]
  );
  const units = useApiData(
    () => (test ? unitsApi.list(test.textbook_id) : Promise.resolve([])),
    [test?.textbook_id]
  );
  const formats = useApiData(() => formatsApi.list(), []);
  const problems = useApiData(() => problemsApi.list(), []);

  const [round, setRound] = useState<string>("all");
  const [level, setLevel] = useState<string>("all");

  const { data: stats, loading: statsLoading, error: statsError } = useApiData(
    () =>
      bankApi.stats({
        test_id: testId,
        round: round === "all" ? undefined : Number(round),
        level: level === "all" ? undefined : (level as "A" | "B" | "C"),
      }),
    [testId, round, level]
  );

  const unitName = (id: number) => units.data?.find((u) => u.id === id)?.name ?? `#${id}`;
  const formatName = (id: number) => formats.data?.find((f) => f.id === id)?.name ?? `#${id}`;
  const problemInfo = (id: number) => problems.data?.find((p) => p.id === id);

  const requiredTotal = coverage?.cells.reduce((sum, c) => sum + c.required, 0) ?? 0;
  const reviewedTotal = coverage?.cells.reduce((sum, c) => sum + c.reviewed, 0) ?? 0;

  // unit×format をキーに、難易度1-3をまとめた行を作る
  const rowsMap = new Map<
    string,
    { unit_id: number; format_id: number; byDifficulty: Record<number, { required: number; reviewed: number; draft: number }> }
  >();
  for (const c of coverage?.cells ?? []) {
    const key = `${c.unit_id}-${c.format_id}`;
    if (!rowsMap.has(key)) {
      rowsMap.set(key, { unit_id: c.unit_id, format_id: c.format_id, byDifficulty: {} });
    }
    rowsMap.get(key)!.byDifficulty[c.difficulty] = {
      required: c.required,
      reviewed: c.reviewed,
      draft: c.draft,
    };
  }
  const coverageRows = [...rowsMap.values()];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <span className="text-xs text-slate-500">必要数</span>
            <p className="text-2xl font-semibold">{requiredTotal}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <span className="text-xs text-slate-500">確認済み数</span>
            <p className="text-2xl font-semibold">{reviewedTotal}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <span className="text-xs text-slate-500">戻り問題がない前提単元の数</span>
            <p className="text-2xl font-semibold">{coverage?.return_missing_unit_ids.length ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-slate-900">
          不足数（確認済み数 / 必要数、倍率×{coverage?.multiplier ?? "-"}）
        </h2>
        {coverageLoading && <LoadingBlock />}
        {coverageError && <ErrorBlock message={coverageError} />}
        {!coverageLoading && !coverageError && coverageRows.length === 0 && (
          <EmptyBlock label="対象となる過去テストの出題傾向がまだありません" />
        )}
        {!coverageLoading && !coverageError && coverageRows.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>単元</TableHead>
                <TableHead>形式</TableHead>
                <TableHead>難易度1</TableHead>
                <TableHead>難易度2</TableHead>
                <TableHead>難易度3</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {coverageRows.map((row) => (
                <TableRow key={`${row.unit_id}-${row.format_id}`}>
                  <TableCell>{unitName(row.unit_id)}</TableCell>
                  <TableCell>{formatName(row.format_id)}</TableCell>
                  {[1, 2, 3].map((d) => {
                    const cell = row.byDifficulty[d];
                    if (!cell) return <TableCell key={d} className="text-slate-300">—</TableCell>;
                    const short = cell.reviewed < cell.required;
                    return (
                      <TableCell key={d}>
                        <Link
                          href={`/problems/new?unit_id=${row.unit_id}&format_id=${row.format_id}&difficulty=${d}&test_id=${testId}`}
                          className={cn(
                            "inline-flex items-center gap-1 rounded px-2 py-0.5 text-sm hover:underline",
                            short ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
                          )}
                        >
                          {cell.reviewed} / {cell.required}
                          {cell.draft > 0 && (
                            <span className="text-xs text-slate-400">(下書き{cell.draft})</span>
                          )}
                        </Link>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">問題ごとの指標</h2>
          <div className="flex gap-2">
            <Select value={round} onValueChange={setRound}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全周回</SelectItem>
                <SelectItem value="1">1周目</SelectItem>
                <SelectItem value="2">2周目</SelectItem>
                <SelectItem value="3">3周目</SelectItem>
              </SelectContent>
            </Select>
            <Select value={level} onValueChange={setLevel}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全レベル</SelectItem>
                <SelectItem value="A">A</SelectItem>
                <SelectItem value="B">B</SelectItem>
                <SelectItem value="C">C</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {statsLoading && <LoadingBlock />}
        {statsError && <ErrorBlock message={statsError} />}
        {!statsLoading && !statsError && (stats?.items.length ?? 0) === 0 && (
          <EmptyBlock label="解答記録がまだありません" />
        )}
        {!statsLoading && !statsError && (stats?.items.length ?? 0) > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>問題</TableHead>
                <TableHead>解答数</TableHead>
                <TableHead>ヒントなし正答率</TableHead>
                <TableHead>ヒント1/2/3正答</TableHead>
                <TableHead>ヒント3でも誤答</TableHead>
                <TableHead>見直し候補</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats!.items.map((it) => {
                const p = problemInfo(it.problem_id);
                return (
                  <TableRow key={it.problem_id}>
                    <TableCell>
                      <Link href={`/problems/${it.problem_id}`} className="hover:underline">
                        {p ? `${unitName(p.unit_id)} / ${formatName(p.format_id)} (難${p.difficulty})` : `#${it.problem_id}`}
                      </Link>
                    </TableCell>
                    <TableCell>{it.attempts}</TableCell>
                    <TableCell>{(it.correct_no_hint * 100).toFixed(0)}%</TableCell>
                    <TableCell>
                      {["1", "2", "3"]
                        .map((s) => `${((it.correct_by_hint[s] ?? 0) * 100).toFixed(0)}%`)
                        .join(" / ")}
                    </TableCell>
                    <TableCell>{(it.wrong_after_hint3 * 100).toFixed(0)}%</TableCell>
                    <TableCell>
                      {it.flags.map((f) => (
                        <Badge key={f} variant="warning" className="mr-1">
                          {FLAG_LABEL[f] ?? f}
                        </Badge>
                      ))}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
