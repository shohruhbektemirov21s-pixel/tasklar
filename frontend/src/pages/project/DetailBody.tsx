/**
 * Loyiha tafsilotining ICHKI qismi — bo'lim almashtirgich va tarraqiyot
 * qatori. Marshrut sahifasi (`pages/ProjectDetail.tsx`) va loyihalar
 * ro'yxatidan ochiladigan modal (`DetailModal.tsx`) BIR XIL kontentni
 * ko'rsatadi, farqi faqat qaysi bo'lim tanlangani qayerda saqlanishida
 * (birida URL, ikkinchisida mahalliy holat). Shu sabab bo'lim ro'yxati va
 * almashtirgich shu yerda, bitta joyda turadi.
 */
import { Suspense, lazy } from "react";
import type { Project } from "@/api/types";
import { Loading, Progress, fmtDateTime } from "@/components/ui";
import { tx } from "@/i18n";

const Overview = lazy(() => import("./Overview"));
const Board = lazy(() => import("./Board"));
const TaskList = lazy(() => import("./TaskList"));
const Members = lazy(() => import("./Members"));
const Chat = lazy(() => import("@/components/Chat"));
const Files = lazy(() => import("./Files"));
const ForecastTab = lazy(() => import("./Forecast"));
const ActivityTab = lazy(() => import("./Activity"));

interface ProjectTab {
  slug: string;
  label: string;
  /** faqat jamoa a'zosiga ochiladigan bo'lim. */
  team?: boolean;
}

// Yopiq qoladigan yagona joy — suhbat: u jamoaning ish yozishmasi,
// tomoshabinga emas (serverda ham shunday).
export const PROJECT_TABS: ProjectTab[] = [
  { slug: "", label: tx("project_detail.umumiy") },
  { slug: "doska", label: tx("project_detail.doska") },
  { slug: "vazifalar", label: tx("common.vazifalar") },
  { slug: "jamoa", label: tx("common.jamoa") },
  { slug: "muddatlar", label: tx("project_detail.muddatlar") },
  { slug: "fayllar", label: tx("common.hujjatlar") },
  { slug: "chat", label: tx("common.suhbat"), team: true },
];

/**
 * Ro'yxatdan ochiladigan MODALning tab panjarasi — atayin qisqartirilgan
 * (5 ta): Doska/Muddatlar/Suhbat bu yerda yo'q, lekin kodi va to'liq
 * sahifadagi (`PROJECT_TABS`) o'rni saqlanadi — faqat modal tab satridan
 * olib tashlangan.
 */
export const PROJECT_MODAL_TABS: ProjectTab[] = [
  { slug: "", label: tx("project_detail.umumiy") },
  { slug: "vazifalar", label: tx("common.vazifalar") },
  { slug: "jamoa", label: tx("project_detail.azolar", undefined, "A'zolar") },
  { slug: "fayllar", label: tx("common.hujjatlar") },
  { slug: "faoliyat", label: tx("project_detail.faoliyat", undefined, "Faoliyat") },
];

const KNOWN_TAB_SLUGS = ["doska", "vazifalar", "jamoa", "muddatlar", "fayllar", "chat", "faoliyat"];

export function ProjectDetailBody({ project, active, onChange }: {
  project: Project;
  active: string;
  onChange: () => void;
}) {
  return (
    <>
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
        {(active === "" || !KNOWN_TAB_SLUGS.includes(active)) && (
          <Overview project={project} onChange={onChange} />
        )}
        {active === "doska" && <Board project={project} />}
        {active === "vazifalar" && <TaskList project={project} />}
        {active === "jamoa" && <Members project={project} onChange={onChange} />}
        {active === "muddatlar" && <ForecastTab project={project} />}
        {active === "fayllar" && <Files project={project} />}
        {active === "chat" && <Chat projectId={project.id} />}
        {active === "faoliyat" && <ActivityTab project={project} />}
      </Suspense>
    </>
  );
}
