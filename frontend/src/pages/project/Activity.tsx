/**
 * Loyihaning to'liq faoliyat lentasi — "Umumiy" tabdagi qisqa
 * "So'nggi faoliyat" ro'yxatining kengaytirilgan, sahifalangan varianti.
 */
import { listOf, pagesOf } from "@/api/client";
import { useFetch } from "@/api/useFetch";
import type { Activity, Project } from "@/api/types";
import Timeline from "@/components/Timeline";
import { EmptyState, Pager, TableSkeleton } from "@/components/ui";
import { IconAlertTriangle, IconClock } from "@/components/icons";
import { tx } from "@/i18n";
import { Button } from "@/components/Button";
import { useState } from "react";

const PER_PAGE = 20;

export default function ActivityTab({ project }: { project: Project }) {
  const [page, setPage] = useState(1);

  const { data, error, loading, reload } = useFetch<{ count: number; results: Activity[] } | Activity[]>(
    "/activity/",
    { project: project.id, page, page_size: PER_PAGE }
  );

  const items = data ? listOf<Activity>(data) : null;
  const pages = pagesOf(data, PER_PAGE);

  if (error) {
    return (
      <EmptyState
        icon={<IconAlertTriangle size={22} />}
        title={tx("project_activity.xatolik", undefined, "Ma'lumotlarni yuklashda xatolik yuz berdi")}
        message={error}
        action={<Button variant="danger" onClick={reload}>{tx("project_activity.qayta_urinish", undefined, "Qayta urinish")}</Button>}
      />
    );
  }

  if (loading && !items?.length) {
    return <TableSkeleton rows={6} cols={1} />;
  }

  if (!items || items.length === 0) {
    return (
      <EmptyState
        icon={<IconClock size={22} />}
        title={tx("project_activity.hali_faoliyat_yoq", undefined, "Bu loyihada hali faoliyat yo'q")}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Timeline items={items} showProject={false} />
      {pages > 1 && <Pager page={page} pages={pages} onPick={setPage} />}
    </div>
  );
}
