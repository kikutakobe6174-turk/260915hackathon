"use client";

import { use } from "react";
import { ProblemEditor } from "@/components/problems/ProblemEditor";
import type { Difficulty } from "@/lib/types/models";

export default function NewProblemPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = use(searchParams);
  const num = (v: string | string[] | undefined) => {
    const s = Array.isArray(v) ? v[0] : v;
    return s ? Number(s) : undefined;
  };

  return (
    <ProblemEditor
      initialQuery={{
        unitId: num(sp.unit_id),
        formatId: num(sp.format_id),
        difficulty: num(sp.difficulty) as Difficulty | undefined,
        testId: num(sp.test_id),
      }}
    />
  );
}
