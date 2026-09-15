import { Suspense, lazy, useState } from "react";
import { Link, NavLink, useParams } from "react-router-dom";
import { ApiError } from "@/api/client";
import { completeProject } from "@/api/projects";
import { useFetch } from "@/api/useFetch";
import type { Project } from "@/api/types";
import { PageHead } from "@/components/Layout";
import { Empty, ErrorMsg, Loading, Progress, fmtDateTime } from "@/components/ui";
import { toBulkTasks, toNewTask, toProject, toProjectEdit, useEntityId } from "@/nav";
import { tx } from "@/i18n";

/**
 * Bo'limlar talab bo'yicha yuklanadi.
 *
 * Ilgari hammasi shu yerda statik import qilinardi va bitta bo'lakka
 * tushardi: «Umumiy» ni ochgan odam ham doska, suhbat, prognoz, tarix va
 * hujjatlar kodini yuklab olardi. Endi har bo'lim bosilganda keladi.
 */
const Overview = lazy(() => import("./project/Overview"));
const Board = lazy(() => import("./project/Board"));
const TaskList = lazy(() => import("./project/TaskList"));
const Members = lazy(() => import("./project/Members"));
const History = lazy(() => import("./project/History"));
const Brief = lazy(() => import("./project/Brief"));

const Chat = lazy(() => import("@/components/Chat"));
const Files = lazy(() => import("./project/Files"));
const ForecastTab = lazy(() => import("./project/Forecast"));

// `team`: faqat jamoa a'zosiga ochiladigan bo'limlar. Loyihani ko'ra
// oladigan odam hujjatlarni ham, tarixni ham ko'radi — ular loyiha nima
// ekanini tushuntiradi. Yopiq qoladigan yagona joy — suhbat: u jamoaning
// ish yozishmasi, tomoshabinga emas (serverda ham shunday).
const TABS = [
  { slug: "", label: tx("project_detail.umumiy") },
  { slug: "doska", label: tx("project_detail.doska") },
  { slug: "vazifalar", label: tx("common.vazifalar") },
  { slug: "jamoa", label: tx("common.jamoa") },
  { slug: "muddatlar", label: tx("project_detail.muddatlar") },
  { slug: "fayllar", label: tx("common.hujjatlar") },
  { slug: "chat", label: tx("common.suhbat"), team: true },
  { slug: "tarix", label: tx("project_detail.tarix") },
  // Slug `brif` bo'lib qoladi - u serverdagi `ProjectBrief` bilan bir
  // xil nom va marshrutda ham shu. O'zbekcha yorlig'i esa loyihaning
  // texnik tavsifi ekanini aniqroq aytadi.
  { slug: "brif", label: tx("project_detail.arxitekturasi") },
];


export default function ProjectDetail() {
  // Loyiha raqami manzilda emas, sahifa holatida - `src/nav` ga qarang.
  // `tab` esa manzilda qoladi: u maxfiy ham emas, kimningdir raqami ham
  // emas, lekin orqaga qaytish va sahifani yangilash uchun kerak.
  const id = useEntityId("project");
  const { tab } = useParams();
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const { data: project, error, loading, reload } = useFetch<Project>(
    id ? `/projects/${id}/` : null);

  // Manzilni qo'lda yozib kirgan yoki sessiyasi tozalangan odam shu yerga
  // tushadi: oq ekran emas, tushunarli chiqish yo'li bo'lsin.
  if (!id) {
    return (
      <div className="content">
        <Empty title={tx("common.loyiha_tanlanmagan")}
               text={tx("project_detail.manzilda_loyiha_raqami_saqlanmaydi_uni")}>
          <Link className="btn btn-primary" to="/loyihalar">{tx("common.loyihalarim")}</Link>
        </Empty>
      </div>
    );
  }

  if (loading) return <div className="content"><Loading /></div>;
  if (!project) {
    return (
      <div className="content">
        <ErrorMsg error={error || tx("project_detail.loyihani_ochib_bolmadi_ruxsat_yoq")} />
      </div>
    );
  }

  const acc = project.access;
  const active = tab || "";

  async function handleComplete() {
    if (!project) return;
    setStatusBusy(true);
    setStatusError(null);
    try {
      if (await completeProject(project.id, project.name, project.open_tasks)) {
        reload();
      }
    } catch (err) {
      setStatusError(err instanceof ApiError ? err.message : tx("common.saqlashda_xatolik"));
    } finally {
      setStatusBusy(false);
    }
  }

  return (
    <>
      <PageHead
        title={
          <>
            <span className="lang-dot" style={{ background: project.color }} />{" "}
            <Link to="/loyihalar" className="muted">{tx("project_detail.loyihalar")}</Link>
            <span className="muted"> / </span>
            <strong>{project.name}</strong>{" "}
            <span className={`badge ${project.status === "ACTIVE" ? "badge-info" : project.status === "DONE" ? "badge-ok" : ""}`}>
              {project.status_display}
            </span>
            <span className="badge">{acc.role_label}</span>
            {/* Yopiq loyihada ishlayotganini odam bilib tursin */}
            {!project.is_public && (
              <span className="badge badge-warn"
                    title={tx("project_detail.bu_loyihani_faqat_jamoa_azolari")}>
                {tx("project_detail.yopiq")}
              </span>
            )}
          </>
        }
        actions={
          <>
            {acc.can_create_task && (
              <>
                <Link className="btn btn-sm" {...toBulkTasks(id)}>{tx("project_detail.koplab_vazifa")}</Link>
                <Link className="btn btn-sm btn-primary" {...toNewTask(id)}>
                  {tx("common.yangi_vazifa")}
                </Link>
              </>
            )}
            {acc.can_manage && (
              <>
                {project.status !== "DONE" && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={statusBusy}
                    onClick={() => void handleComplete()}
                    title={tx("project_detail.loyihani_yakunlash")}
                  >
                    ✓ {tx("project_detail.loyihani_yakunlash")}
                  </button>
                )}
                <Link className="btn btn-sm" {...toProjectEdit(id)}>{tx("project_detail.sozlamalar")}</Link>
              </>
            )}
          </>
        }
        tabs={TABS.filter((t) => !t.team || acc.is_member || acc.is_manager || acc.is_admin).map((t) => (
          <NavLink
            key={t.slug}
            {...toProject(id, t.slug || undefined)}
            end
            className={`tab ${active === t.slug ? "active" : ""}`}
          >
            {t.label}
            {t.slug === "jamoa" && !!project.pending_requests && (
              <span className="n" style={{ color: "var(--danger)" }}>{project.pending_requests}</span>
            )}
          </NavLink>
        ))}
      />

      <div className="content">
        <ErrorMsg error={statusError} />



        <div className="row middle between mb" style={{ flexWrap: "wrap", gap: 10 }}>
          <div className="row middle" style={{ gap: 12, flexWrap: "wrap" }}>
            <div style={{ width: 220, maxWidth: "100%" }}>
              <Progress value={project.progress} />
            </div>
            <span className="muted" style={{ fontSize: 12 }}>
              {project.progress}{tx("project_detail.bajarildi")} • {project.open_tasks} {tx("project_detail.ochiq")} • {project.member_count} {tx("common.azo")}
            </span>
          </div>
          {project.updated_at && (
            <span className="muted" style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span>🕒</span>
              <span>
                {tx("projects.tahrirlandi", undefined, "Tahrirlandi")}: {fmtDateTime(project.updated_at)}
                {project.updated_by && (
                  <strong style={{ marginLeft: 4 }}>({project.updated_by.full_name})</strong>
                )}
              </span>
            </span>
          )}
        </div>

        <Suspense fallback={<Loading />}>
          {active === "" && <Overview project={project} onChange={reload} />}
          {active === "doska" && <Board project={project} />}
          {active === "vazifalar" && <TaskList project={project} />}
          {active === "jamoa" && <Members project={project} onChange={reload} />}
          {active === "muddatlar" && <ForecastTab project={project} />}
          {active === "fayllar" && <Files project={project} />}
          {active === "chat" && <Chat projectId={project.id} />}
          {active === "tarix" && <History project={project} />}
          {(active === "kirish" || active === "brif") && <Brief project={project} onChange={reload} />}
        </Suspense>

      </div>
    </>
  );
}
