"use client";

import { formatsApi } from "@/lib/api/masters";
import { useApiData } from "@/lib/hooks/useApiData";
import { SimpleNameCrud } from "@/components/masters/SimpleNameCrud";
import { MastersNav } from "@/components/masters/MastersNav";

export default function FormatsPage() {
  const { data, loading, error, reload } = useApiData(() => formatsApi.list(), []);

  return (
    <div className="flex flex-col gap-6">
      <MastersNav />
      <SimpleNameCrud
        title="形式"
        itemLabel="形式"
        data={data}
        loading={loading}
        error={error}
        onCreate={(name) => formatsApi.create({ name })}
        onUpdate={(id, name) => formatsApi.update(id, { name })}
        onDelete={(id) => formatsApi.remove(id)}
        onReload={reload}
      />
    </div>
  );
}
