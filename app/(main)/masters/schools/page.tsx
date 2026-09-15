"use client";

import { schoolsApi } from "@/lib/api/masters";
import { useApiData } from "@/lib/hooks/useApiData";
import { SimpleNameCrud } from "@/components/masters/SimpleNameCrud";
import { MastersNav } from "@/components/masters/MastersNav";

export default function SchoolsPage() {
  const { data, loading, error, reload } = useApiData(() => schoolsApi.list(), []);

  return (
    <div className="flex flex-col gap-6">
      <MastersNav />
      <SimpleNameCrud
        title="学校"
        itemLabel="学校"
        data={data}
        loading={loading}
        error={error}
        onCreate={(name) => schoolsApi.create({ name })}
        onUpdate={(id, name) => schoolsApi.update(id, { name })}
        onDelete={(id) => schoolsApi.remove(id)}
        onReload={reload}
      />
    </div>
  );
}
