"use client";

import { use, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { lessonsApi } from "@/lib/api/lessons";
import { testsApi } from "@/lib/api/tests";
import { worksheetsApi } from "@/lib/api/worksheets";
import { studentsApi } from "@/lib/api/students";
import { useApiData } from "@/lib/hooks/useApiData";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { ANSWER_SHEET_STATUS_LABEL } from "@/lib/constants";

export default function LessonDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const lessonId = Number(id);
  const { user } = useAuth();
  const isOperator = user?.role === "operator";

  const { data: sheets, loading, error, reload } = useApiData(
    () => lessonsApi.listAnswerSheets(lessonId),
    [lessonId]
  );
  const { data: lessons } = useApiData(() => lessonsApi.list(), []);
  const lesson = lessons?.find((l) => l.id === lessonId);
  const { data: test } = useApiData(
    () => (lesson ? testsApi.get(lesson.test_id) : Promise.resolve(null)),
    [lesson?.test_id]
  );
  const worksheets = useApiData(
    () => (lesson ? worksheetsApi.listForTest(lesson.test_id) : Promise.resolve([])),
    [lesson?.test_id]
  );
  const students = useApiData(
    () => (test ? studentsApi.list({ school_id: test.school_id, active: true }) : Promise.resolve([])),
    [test?.school_id]
  );

  const [pickStudentId, setPickStudentId] = useState("");
  const [pickWorksheetId, setPickWorksheetId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const assignedStudentIds = new Set(sheets?.map((s) => s.student_id) ?? []);
  const availableStudents = (students.data ?? []).filter((s) => !assignedStudentIds.has(s.id));

  const confirmedCount = sheets?.filter((s) => s.status === "confirmed").length ?? 0;
  const inProgressCount = sheets?.filter((s) => s.status === "in_progress" || s.status === "llm_draft").length ?? 0;
  const redCardCount = sheets?.reduce((sum, s) => sum + s.red_card_count, 0) ?? 0;

  async function handleAssign() {
    if (!pickStudentId || !pickWorksheetId) return;
    setAssigning(true);
    setAssignError(null);
    try {
      await lessonsApi.createAnswerSheets(lessonId, {
        assignments: [{ student_id: Number(pickStudentId), worksheet_id: Number(pickWorksheetId) }],
      });
      setPickStudentId("");
      reload();
    } catch (err) {
      setAssignError(err instanceof ApiRequestError ? err.message : "割り当てに失敗しました");
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/lessons" className="text-sm text-slate-500 hover:text-slate-800">
          ← 授業回一覧へ戻る
        </Link>
        {lesson && (
          <h1 className="mt-2 text-lg font-semibold text-slate-900">
            {lesson.lesson_date} {lesson.class_name}（第{lesson.round}周）
          </h1>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <span className="text-xs text-slate-500">確定数 / 全体</span>
            <p className="text-2xl font-semibold">
              {confirmedCount} / {sheets?.length ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <span className="text-xs text-slate-500">入力中・下書き数</span>
            <p className="text-2xl font-semibold">{inProgressCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <span className="text-xs text-slate-500">赤カード件数</span>
            <p className="text-2xl font-semibold text-red-600">{redCardCount}</p>
          </CardContent>
        </Card>
      </div>

      {isOperator && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-2 p-4">
            <span className="text-sm font-medium text-slate-700">生徒に解答用紙を割り当て</span>
            <Select value={pickStudentId} onValueChange={setPickStudentId}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="生徒" />
              </SelectTrigger>
              <SelectContent>
                {availableStudents.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.student_code}（{s.level}）
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={pickWorksheetId} onValueChange={setPickWorksheetId}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="冊子" />
              </SelectTrigger>
              <SelectContent>
                {worksheets.data?.map((w) => (
                  <SelectItem key={w.id} value={String(w.id)}>
                    レベル{w.level} v{w.version}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={handleAssign}
              disabled={assigning || !pickStudentId || !pickWorksheetId}
            >
              <Plus className="h-4 w-4" />
              割り当て
            </Button>
            {assignError && <ErrorBlock message={assignError} />}
          </CardContent>
        </Card>
      )}

      {loading && <LoadingBlock />}
      {error && <ErrorBlock message={error} />}
      {!loading && !error && (sheets?.length ?? 0) === 0 && (
        <EmptyBlock label="解答用紙がまだありません" />
      )}
      {!loading && !error && (sheets?.length ?? 0) > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>生徒番号</TableHead>
              <TableHead>学校</TableHead>
              <TableHead>使用冊子</TableHead>
              <TableHead>状態</TableHead>
              <TableHead>赤カード</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sheets!.map((s) => (
              <TableRow key={s.id}>
                <TableCell>{s.student_code}</TableCell>
                <TableCell>{s.school_name}</TableCell>
                <TableCell>レベル{s.worksheet_level}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      s.status === "confirmed"
                        ? "success"
                        : s.status === "llm_draft"
                        ? "llm"
                        : s.status === "in_progress"
                        ? "warning"
                        : "outline"
                    }
                  >
                    {ANSWER_SHEET_STATUS_LABEL[s.status]}
                  </Badge>
                </TableCell>
                <TableCell>
                  {s.red_card_count > 0 && (
                    <Badge variant="destructive">{s.red_card_count}</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Link href={`/answer-sheets/${s.id}`} className="text-sm text-slate-600 hover:underline">
                    入力
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
