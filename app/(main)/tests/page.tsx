"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { testsApi } from "@/lib/api/tests";
import { schoolsApi, textbooksApi } from "@/lib/api/masters";
import { useApiData } from "@/lib/hooks/useApiData";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "@/components/ui/status";
import { TEST_KIND_LABEL } from "@/lib/constants";
import { useAuth } from "@/contexts/AuthContext";

export default function TestsPage() {
  const { user } = useAuth();
  const { data, loading, error } = useApiData(() => testsApi.list(), []);
  const schools = useApiData(() => schoolsApi.list(), []);
  const textbooks = useApiData(() => textbooksApi.list(), []);

  const schoolName = (id: number) => schools.data?.find((s) => s.id === id)?.name ?? `#${id}`;
  const textbookTitle = (id: number) => textbooks.data?.find((t) => t.id === id)?.title ?? `#${id}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">テスト一覧</h1>
        {user?.role === "operator" && (
          <Link href="/tests/new">
            <Button size="sm">
              <Plus className="h-4 w-4" />
              テストを登録
            </Button>
          </Link>
        )}
      </div>

      {loading && <LoadingBlock />}
      {error && <ErrorBlock message={error} />}
      {!loading && !error && (data?.length ?? 0) === 0 && (
        <EmptyBlock label="登録されたテストはありません" />
      )}
      {!loading && !error && (data?.length ?? 0) > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>年度</TableHead>
              <TableHead>学校</TableHead>
              <TableHead>教科書</TableHead>
              <TableHead>学年</TableHead>
              <TableHead>テスト回</TableHead>
              <TableHead>種別</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data!.map((t) => (
              <TableRow key={t.id}>
                <TableCell>{t.year}</TableCell>
                <TableCell>{schoolName(t.school_id)}</TableCell>
                <TableCell>{textbookTitle(t.textbook_id)}</TableCell>
                <TableCell>{t.grade}</TableCell>
                <TableCell>{t.term}</TableCell>
                <TableCell>
                  <Badge variant={t.kind === "past" ? "secondary" : "default"}>
                    {TEST_KIND_LABEL[t.kind]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Link
                    href={`/tests/${t.id}/${user?.role === "teacher" ? "prerequisites" : "trends"}`}
                    className="text-sm text-slate-600 hover:underline"
                  >
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
