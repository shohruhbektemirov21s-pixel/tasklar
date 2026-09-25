import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { ApiError, api, listOf } from "@/api/client";
import type { Project, Workspace } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import AddMemberBox from "@/components/AddMemberBox";
import { IconChat, IconCheck, IconClose, IconPlus } from "@/components/icons";
import { lockScroll, unlockScroll } from "@/components/scrollLock";
import { Avatar, Empty, ErrorMsg, Loading, Progress } from "@/components/ui";
import { toNewProject, toProject, toUser, toWorkspaceChat } from "@/nav";
import { tx } from "@/i18n";
import { Button, LinkButton } from "@/components/Button";

export interface WorkspaceDetailModalProps {
  slug: string;
  onClose: () => void;
  onUpdated?: () => void;
}

type WorkspaceModalTab = "projects" | "members" | "settings";

export default function WorkspaceDetailModal({ slug, onClose, onUpdated }: WorkspaceDetailModalProps) {
  const { meta, user } = useAuth();
  const [tab, setTab] = useState<WorkspaceModalTab>("projects");
  const [ws, setWs] = useState<Workspace | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    lockScroll();
    return () => {
      document.removeEventListener("keydown", onKey);
      unlockScroll();
    };
  }, [onClose]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const wsData = await api.get<Workspace>(`/workspaces/${slug}/`);
      setWs(wsData);
      const prjData = await api.get<unknown>("/projects/", {
        workspace: slug,
        scope: "discover",
      });
      setProjects(listOf<Project>(prjData));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tx("workspace_detail.ish_maydonini_ochib_bolmadi", undefined, "Ish maydonini ochib bo'lmadi"));
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleJoin() {
    if (!ws) return;
    setActionBusy(true);
    setError(null);
    try {
      await api.post(`/workspaces/${ws.slug}/join/`, {});
      await load();
      onUpdated?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tx("workspaces.qoshilib_bolmadi", undefined, "Qo'shilib bo'lmadi"));
    } finally {
      setActionBusy(false);
    }
  }

  async function handleMemberRoleChange(memberId: number, newRole: string) {
    if (!ws) return;
    setActionBusy(true);
    setError(null);
    try {
      await api.post(`/workspaces/${ws.slug}/members/`, {
        member_id: memberId,
        role: newRole,
      });
      await load();
      onUpdated?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tx("common.amalni_bajarib_bolmadi", undefined, "Amalni bajarib bo'lmadi"));
    } finally {
      setActionBusy(false);
    }
  }

  function handleCopyCode() {
    if (!ws?.join_code) return;
    navigator.clipboard?.writeText(ws.join_code).then(() => {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    });
  }

  return createPortal(
    <div
      className="modal-overlay"
      style={{ zIndex: 99999, padding: "20px 16px" }}
      onClick={onClose}
    >
      <div
        className="modal-card"
        style={{ maxWidth: 880, width: "95vw", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header" style={{ alignItems: "flex-start", gap: 12, borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0, flex: 1 }}>
            <div className="row middle" style={{ gap: 8, flexWrap: "wrap" }}>
              {ws && <span className="lang-dot" style={{ background: ws.color || "var(--accent)", width: 12, height: 12 }} />}
              <span className={`badge ${ws?.is_open ? "badge-ok" : "badge-warn"}`}>
                {ws?.is_open ? tx("common.ochiq", undefined, "Ochiq") : tx("workspace_detail.yopiq", undefined, "Yopiq")}
              </span>
              {ws?.my_role && (
                <span className="badge badge-brand">
                  {ws.my_role}
                </span>
              )}
            </div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
              {ws?.name || slug}
            </h3>
            {ws?.description && (
              <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.4 }}>
                {ws.description}
              </p>
            )}
          </div>

          <div className="row middle" style={{ gap: 8, flexShrink: 0 }}>
            {ws && !ws.my_role && (
              <Button
                variant="primary"
                size="sm"
                disabled={actionBusy}
                onClick={() => void handleJoin()}
              >
                {tx("common.qoshilish", undefined, "Qo'shilish")}
              </Button>
            )}
            {ws?.my_role && (
              <LinkButton size="sm" variant="ghost" {...toWorkspaceChat(ws.slug)} onClick={onClose}>
                <IconChat size={14} />
                <span>{tx("common.suhbat", undefined, "Suhbat")}</span>
              </LinkButton>
            )}
            <Button
              iconOnly
              variant="ghost"
              size="sm"
              aria-label={tx("common.yopish", undefined, "Yopish")}
              onClick={onClose}
            >
              <IconClose size={16} />
            </Button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div
          className="row middle"
          style={{
            padding: "8px 16px",
            borderBottom: "1px solid var(--border)",
            gap: 6,
            background: "var(--surface-1)",
          }}
        >
          <button
            type="button"
            className={`btn btn-sm ${tab === "projects" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setTab("projects")}
          >
            {tx("common.loyihalar", undefined, "Loyihalar")} ({projects.length})
          </button>
          <button
            type="button"
            className={`btn btn-sm ${tab === "members" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setTab("members")}
          >
            {tx("workspace_detail.azolar", undefined, "A'zolar")} ({ws?.member_count || 0})
          </button>
          <button
            type="button"
            className={`btn btn-sm ${tab === "settings" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setTab("settings")}
          >
            {tx("workspace_detail.malumot", undefined, "Ma'lumot va sozlamalar")}
          </button>
        </div>

        {/* Content Body */}
        <div className="modal-body" style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          <ErrorMsg error={error} />

          {loading ? (
            <Loading />
          ) : !ws ? (
            <Empty title={tx("workspace_detail.ish_maydonini_ochib_bolmadi", undefined, "Ish maydoni topilmadi")} />
          ) : tab === "projects" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="row middle" style={{ justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)" }}>
                  {tx("workspaces.loyiha_royxati", undefined, "Maydondagi barcha loyihalar")}
                </span>
                {user?.can_create_project && (
                  <LinkButton variant="primary" size="sm" {...toNewProject()} onClick={onClose}>
                    <IconPlus size={14} />
                    <span>{tx("common.yangi_loyiha", undefined, "Yangi loyiha")}</span>
                  </LinkButton>
                )}
              </div>

              {!projects.length ? (
                <Empty
                  title={tx("workspace_detail.loyiha_yoq", undefined, "Loyihalar mavjud emas")}
                  text={tx("workspace_detail.bu_maydonda_hali_loyiha_yaratilmagan", undefined, "Bu maydonda hali loyiha yaratilmagan.")}
                />
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
                  {projects.map((p) => (
                    <div
                      key={p.id}
                      className="card-clean"
                      style={{
                        padding: 14,
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                        border: "1px solid var(--border)",
                        borderRadius: 10,
                        background: "var(--surface)",
                      }}
                    >
                      <div className="row middle" style={{ justifyContent: "space-between", gap: 8 }}>
                        <div className="row middle" style={{ gap: 8, minWidth: 0 }}>
                          <span
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: "50%",
                              background: p.color || "var(--accent)",
                              flexShrink: 0,
                            }}
                          />
                          <Link
                            {...toProject(p.id)}
                            onClick={onClose}
                            style={{ fontWeight: 650, fontSize: 14, color: "var(--accent)" }}
                            className="nowrap"
                          >
                            {p.name}
                          </Link>
                        </div>
                        {p.matches_my_specialty && (
                          <span className="badge badge-info" style={{ fontSize: 10 }}>
                            {tx("workspace_detail.sizga_mos", undefined, "Mos")}
                          </span>
                        )}
                      </div>

                      {p.description && (
                        <p className="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.35, maxHeight: 36, overflow: "hidden" }}>
                          {p.description}
                        </p>
                      )}

                      <div>
                        <div className="row middle" style={{ justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                          <span className="muted">{tx("projects.ustun_jarayon", undefined, "Jarayon")}</span>
                          <span className="mono" style={{ fontWeight: 600 }}>{p.progress || 0}%</span>
                        </div>
                        <Progress value={p.progress || 0} />
                      </div>

                      <div className="row middle" style={{ justifyContent: "space-between", fontSize: 12, color: "var(--muted)", borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                        <span>{p.open_tasks} {tx("common.ochiq", undefined, "ochiq")}</span>
                        <span>{p.member_count} {tx("workspace_detail.azo", undefined, "a'zo")}</span>
                        <LinkButton size="sm" variant="ghost" {...toProject(p.id, "doska")} onClick={onClose} style={{ padding: "2px 8px", fontSize: 11 }}>
                          {tx("workspace_detail.doska", undefined, "Doska")}
                        </LinkButton>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : tab === "members" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {ws.can_manage && (
                <div style={{ padding: "12px 14px", background: "var(--surface-1)", borderRadius: 10, border: "1px solid var(--border)" }}>
                  <AddMemberBox
                    workspaceSlug={ws.slug}
                    roles={(meta?.workspace_role || []).filter((r) => r.value !== "OWNER")}
                    defaultRole="MEMBER"
                    onChange={() => {
                      void load();
                      onUpdated?.();
                    }}
                  />
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(ws.members || []).map((m) => (
                  <div
                    key={m.id}
                    className="row middle"
                    style={{
                      padding: "10px 14px",
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      gap: 12,
                    }}
                  >
                    <Avatar user={m.user} size="sm" />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <Link {...toUser(m.user.id)} onClick={onClose} style={{ fontWeight: 600, fontSize: 13 }}>
                        {m.user.full_name}
                      </Link>
                      <div className="muted" style={{ fontSize: 11 }}>
                        {m.user.specialty_display || m.user.email}
                      </div>
                    </div>

                    {ws.can_manage && m.role !== "OWNER" ? (
                      <select
                        defaultValue={m.role}
                        style={{ width: 130, fontSize: 12, padding: "4px 8px" }}
                        disabled={actionBusy}
                        onChange={(e) => void handleMemberRoleChange(m.id, e.target.value)}
                      >
                        {(meta?.workspace_role || [])
                          .filter((r) => r.value !== "OWNER")
                          .map((r) => (
                            <option key={String(r.value)} value={String(r.value)}>
                              {r.label}
                            </option>
                          ))}
                      </select>
                    ) : (
                      <span className="badge">{m.role_display}</span>
                    )}
                  </div>
                ))}

                {!(ws.members || []).length && (
                  <Empty title={tx("workspace_detail.azo_yoq", undefined, "A'zolar mavjud emas")} />
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: 12,
                }}
              >
                <div style={{ padding: 14, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }}>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                    {tx("workspace_detail.egasi", undefined, "Egasi")}
                  </div>
                  <div style={{ fontWeight: 650, fontSize: 14 }}>{ws.owner.full_name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{ws.owner.email}</div>
                </div>

                <div style={{ padding: 14, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }}>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                    {tx("workspace_detail.turi", undefined, "Maydon turi")}
                  </div>
                  <div style={{ fontWeight: 650, fontSize: 14 }}>
                    {ws.is_open ? tx("common.ochiq", undefined, "Ochiq maydon") : tx("workspace_detail.yopiq", undefined, "Yopiq maydon")}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {ws.is_open ? tx("workspaces.hamma_kora_oladi", undefined, "Barcha a'zolar kira oladi") : tx("workspaces.faqat_taklif", undefined, "Faqat kod yoki taklif bilan")}
                  </div>
                </div>

                {ws.can_manage && ws.join_code && (
                  <div style={{ padding: 14, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }}>
                    <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                      {tx("workspace_detail.qoshilish_kodi", undefined, "Qo'shilish kodi")}
                    </div>
                    <div className="row middle" style={{ gap: 8 }}>
                      <code style={{ fontSize: 15, fontWeight: 700, letterSpacing: 1, color: "var(--accent)" }}>
                        {ws.join_code}
                      </code>
                      <Button size="sm" variant="ghost" onClick={handleCopyCode} style={{ padding: "2px 8px", fontSize: 11 }}>
                        {copiedCode ? <IconCheck size={12} /> : tx("common.nusxalash", undefined, "Nusxalash")}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {ws.description && (
                <div style={{ padding: 14, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }}>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                    {tx("workspace_detail.maydon_haqida", undefined, "Maydon haqida")}
                  </div>
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                    {ws.description}
                  </p>
                </div>
              )}

              <div className="row middle" style={{ justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                <LinkButton variant="ghost" to={`/ish-maydonlari/${ws.slug}`} onClick={onClose}>
                  {tx("common.toliq_sahifada_ochish", undefined, "To'liq sahifada ochish →")}
                </LinkButton>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
