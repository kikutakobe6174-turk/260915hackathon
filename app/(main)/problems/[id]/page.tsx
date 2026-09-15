"use client";

import { use } from "react";
import { ProblemEditor } from "@/components/problems/ProblemEditor";

export default function EditProblemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <ProblemEditor problemId={Number(id)} />;
}
