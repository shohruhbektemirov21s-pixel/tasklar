import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link, NavLink, useParams } from "react-router-dom";
import { ApiError } from "@/api/client";
import { completeProject } from "@/api/projects";
import { useFetch } from "@/api/useFetch";
import type { Project } from "@/api/types";
import { PageHead } from "@/components/Layout";
import { lockScroll, unlockScroll } from "@/components/scrollLock";
import { Empty, ErrorMsg, Loading } from "@/components/ui";
import { IconCheck, IconClose, IconMore } from "@/components/icons";
import { toNewTask, toProject, toProjectEdit, useEntityId } from "@/nav";
import { tx } from "@/i18n";
import { Button, LinkButton } from "@/components/Button";
import { PROJECT_MODAL_TABS, PROJECT_TABS, ProjectDetailBody } from "./project/DetailBody";

export interface ProjectDetailProps {
  /** Berilsa — komponent modal sifatida ishlaydi (loyihalar ro'yxatidan). */
  projectId?: number;
  onClose?: () => void;
}

export default function ProjectDetail({ projectId: propProjectId, onClose }: ProjectDetailProps = {}) {
  // Marshrut sahifasida loyiha raqami manzilda emas, sahifa holatida - `src/nav`
  // ga qarang. Modalda esa `projectId` to'g'ridan-to'g'ri prop sifatida keladi.
  const routeId = useEntityId("project");
  const { tab: routeTab } = useParams();
  const isModal = Boolean(onClose);
  const id = isModal ? propProjectId : routeId;
  // Modalda bo'lim URL'ga emas, mahalliy holatga yoziladi - modal manzilni
  // o'zgartirmaydi (ro'yxatdan «alohida sahifaga o'tmasdan» ochilishi shu
  // sabab ta'minlanadi).
  const [modalTab, setModalTab] = useState("");
  const active = isModal ? modalTab : (routeTab || "");
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!isModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    lockScroll();
    return () => {
      document.removeEventListener("keydown", onKey);
      unlockScroll();
    };
  }, [isModal, onClose]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuOpen]);

  const { data: project, error, loading, reload } = useFetch<Project>(
    id ? `/projects/${id}/` : null);

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

  // Manzilni qo'lda yozib kirgan yoki sessiyasi tozalangan odam shu yerga
  // tushadi: oq ekran emas, tushunarli chiqish yo'li bo'lsin. Modalda bu holat
  // bo'lmaydi - `projectId` chaqiruvchidan keladi.
  if (!id) {
    return (
      <div className="content">
        <Empty title={tx("common.loyiha_tanlanmagan")}
               text={tx("project_detail.manzilda_loyiha_raqami_saqlanmaydi_uni")}>
          <LinkButton variant="primary" to="/loyihalar">{tx("common.loyihalarim")}</LinkButton>
        </Empty>
      </div>
    );
  }

  if (loading || !project) {
    const body = loading
      ? <Loading />
      : <ErrorMsg error={error || tx("project_detail.loyihani_ochib_bolmadi_ruxsat_yoq")} />;
    if (isModal) {
      return createPortal(
        <div className="modal-overlay" onClick={onClose}>
          <div className="modal-card" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-body" style={{ textAlign: "center" }}>{body}</div>
          </div>
        </div>,
        document.body
      );
    }
    return <div className="content">{body}</div>;
  }

  const acc = project.access;
  const visibleTabs = PROJECT_TABS.filter((t) => !t.team || acc.is_member || acc.is_manager || acc.is_admin);
  const visibleModalTabs = PROJECT_MODAL_TABS.filter((t) => !t.team || acc.is_member || acc.is_manager || acc.is_admin);

  const headerActions = (
    <>
      {acc.can_create_task && (
        <LinkButton variant="primary" size="sm" {...toNewTask(id)}>
          {tx("common.yangi_vazifa")}
        </LinkButton>
      )}
      {acc.can_manage && (
        <>
          {project.status !== "DONE" && (
            <Button
              size="sm"
              disabled={statusBusy}
              onClick={() => void handleComplete()}
              title={tx("project_detail.loyihani_yakunlash")}
            >
              <IconCheck size={14} /> {tx("project_detail.loyihani_yakunlash")}
            </Button>
          )}
          <LinkButton size="sm" {...toProjectEdit(id)}>{tx("project_detail.sozlamalar")}</LinkButton>
        </>
      )}
    </>
  );

  const titleBadges = (
    <>
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
  );

  if (isModal) {
    return createPortal(
      <div
        className="modal-overlay"
        style={{ zIndex: 99999, padding: "20px 16px" }}
        onClick={onClose}
      >
        <div
          className="modal-card"
          style={{ maxWidth: 1200, width: "96vw", height: "92vh" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header" style={{ alignItems: "flex-start", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
              <div className="row middle" style={{ gap: 6, flexWrap: "wrap" }}>
                <span className="lang-dot" style={{ background: project.color }} />
                <span className={`badge ${project.status === "ACTIVE" ? "badge-info" : project.status === "DONE" ? "badge-ok" : project.status === "PAUSED" ? "badge-warn" : ""}`}>
                  <span className="badge-dot" aria-hidden="true" />
                  {project.status_display}
                </span>
                <span className="badge">{acc.role_label}</span>
                {!project.is_public && (
                  <span className="badge badge-warn"
                        title={tx("project_detail.bu_loyihani_faqat_jamoa_azolari")}>
                    {tx("project_detail.yopiq")}
                  </span>
                )}
              </div>
              <h3 style={{ margin: 0, minWidth: 0 }}>
                <span className="nowrap" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{project.name}</span>
              </h3>
              {project.description && (
                <p className="muted nowrap" style={{ margin: 0, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", maxWidth: 560 }}>
                  {project.description}
                </p>
              )}
            </div>
            <div className="row middle" style={{ gap: 8, flexShrink: 0, position: "relative" }}>
              <Button iconOnly variant="ghost" size="sm"
                      title={tx("project_detail.korproq_amallar", undefined, "Ko'proq amallar")}
                      aria-label={tx("project_detail.korproq_amallar", undefined, "Ko'proq amallar")}
                      onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}>
                <IconMore size={16} />
              </Button>
              {menuOpen && (
                <div
                  style={{
                    position: "absolute", right: 0, top: "100%", marginTop: 4,
                    background: "var(--surface)", border: "1px solid var(--border)",
                    borderRadius: 10, boxShadow: "var(--shadow-lg)", zIndex: 20,
                    minWidth: 220, overflow: "hidden", textAlign: "left",
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {acc.can_create_task && (
                    <LinkButton variant="ghost" {...toNewTask(id)} onClick={() => setMenuOpen(false)}
                                style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", borderRadius: 0 }}>
                      {tx("common.yangi_vazifa")}
                    </LinkButton>
                  )}
                  {acc.can_manage && project.status !== "DONE" && (
                    <button type="button" className="combo-item"
                            style={{ width: "100%", textAlign: "left", padding: "10px 14px" }}
                            disabled={statusBusy}
                            onClick={() => { setMenuOpen(false); void handleComplete(); }}>
                      <IconCheck size={14} /> {tx("project_detail.loyihani_yakunlash")}
                    </button>
                  )}
                  {acc.can_manage && (
                    <LinkButton variant="ghost" {...toProjectEdit(id)} onClick={() => setMenuOpen(false)}
                                style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", borderRadius: 0 }}>
                      {tx("project_detail.sozlamalar")}
                    </LinkButton>
                  )}
                  <LinkButton variant="ghost" {...toProject(id)} onClick={() => { setMenuOpen(false); onClose?.(); }}
                              style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", borderRadius: 0 }}>
                    {tx("project_detail.toliq_sahifada_ochish", undefined, "To'liq sahifada ochish")}
                  </LinkButton>
                </div>
              )}
              <Button iconOnly variant="ghost" size="sm" onClick={onClose}
                      title={tx("common.yopish")} aria-label={tx("common.yopish")}>
                <IconClose size={16} />
              </Button>
            </div>
          </div>
          <div className="row" style={{ gap: 4, padding: "0 22px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
            {visibleModalTabs.map((t) => (
              <button
                type="button"
                key={t.slug}
                className={`tab ${active === t.slug ? "active" : ""}`}
                onClick={() => setModalTab(t.slug)}
              >
                {t.label}
                {t.slug === "jamoa" && !!project.pending_requests && (
                  <span className="n" style={{ color: "var(--danger)" }}>{project.pending_requests}</span>
                )}
              </button>
            ))}
          </div>
          <div className="modal-body">
            <ErrorMsg error={statusError} />
            <ProjectDetailBody project={project} active={active} onChange={reload} />
          </div>
        </div>
      </div>,
      document.body
    );
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
            {titleBadges}
          </>
        }
        actions={headerActions}
        tabs={visibleTabs.map((t) => (
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

        <ProjectDetailBody project={project} active={active} onChange={reload} />
      </div>
    </>
  );
}
