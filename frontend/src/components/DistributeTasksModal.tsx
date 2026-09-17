import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api, listOf } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { lockScroll, unlockScroll } from "@/components/scrollLock";
import TeamPicker, { addPickedMembers, createPickedTasks, taskCount, type Pick as TeamPick } from "@/components/TeamPicker";
import { Avatar, ErrorMsg, Loading, Priority, StatusBadge, fmtDate } from "@/components/ui";
import { tx } from "@/i18n";
import type { ChangeRequestItem, Project, Task } from "@/api/types";

const TaskDetailModal = lazy(() => import("@/pages/TaskDetail"));

export interface DistributeTasksModalProps {
  projectId: number;
  order?: ChangeRequestItem | null;
  onClose: () => void;
  onTasksUpdated?: () => void;
}

export default function DistributeTasksModal({
  projectId,
  order,
  onClose,
  onTasksUpdated,
}: DistributeTasksModalProps) {
  const { user, meta } = useAuth();
  const [activeTab, setActiveTab] = useState<"assign" | "list">("assign");
  const [team, setTeam] = useState<TeamPick[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !selectedTaskId) onClose();
    };
    document.addEventListener("keydown", onKey);
    lockScroll();
    return () => {
      document.removeEventListener("keydown", onKey);
      unlockScroll();
    };
  }, [onClose, selectedTaskId]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [tasksRes, projectRes] = await Promise.all([
        api.get<Task[] | { results: Task[] }>(`/tasks/`, { project: projectId, page_size: 100 }),
        api.get<Project>(`/projects/${projectId}/`).catch(() => null),
      ]);
      const list = listOf<Task>(tasksRes);
      setTasks(list);
      if (projectRes) setProject(projectRes);
      // Agar avvaldan vazifalar mavjud bo'lsa va yangi taqsimlash kiritilmagan bo'lsa
      if (list.length > 0 && team.length === 0) {
        // user can switch tabs
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [projectId, team.length]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleSaveTasks() {
    setError(null);
    setSuccessMsg(null);
    const count = taskCount(team);
    if (count === 0) {
      setError("Hech bo'lmaganda bitta vazifa kiritilishi shart.");
      return;
    }

    setSaving(true);
    try {
      const failedMembers = await addPickedMembers(projectId, team);
      const { failedTasks, failedFiles } = await createPickedTasks(projectId, team);

      if (failedMembers.length || failedTasks.length || failedFiles.length) {
        const parts: string[] = [];
        if (failedMembers.length) parts.push(tx("project_form.jamoaga_qoshilmadi") + failedMembers.join(", "));
        if (failedTasks.length) parts.push(tx("project_form.vazifa_yaratilmadi") + failedTasks.join(", "));
        if (failedFiles.length) parts.push(tx("project_form.fayllari_biriktirilmadi") + failedFiles.join(", "));
        setError(parts.join("; "));
      } else {
        setSuccessMsg(tx("orders.vazifalar_muvaffaqiyatli_biriktirildi", undefined, "Vazifalar muvaffaqiyatli biriktirildi!"));
      }

      setTeam([]);
      await loadData();
      onTasksUpdated?.();
      setActiveTab("list");
    } catch (err: unknown) {
      setError((err as Error)?.message || tx("common.saqlashda_xatolik"));
    } finally {
      setSaving(false);
    }
  }

  const projectName = project?.name || order?.project_detail?.name || order?.system_name || `Loyiha #${projectId}`;
  const totalTasks = tasks.length;
  const newTasksCount = taskCount(team);

  return createPortal(
    <div
      className="modal-overlay"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100002,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px 16px",
        background: "rgba(8, 11, 16, 0.72)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        overflow: "hidden",
      }}
      onClick={onClose}
    >
      <div
        className="modal-window card"
        style={{
          width: "min(1280px, 96vw)",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          borderRadius: 14,
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
          overflow: "hidden",
          background: "var(--bg, #f8fafc)",
          border: "1px solid var(--border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 24px",
            borderBottom: "1px solid var(--border)",
            background: "var(--card-bg, #ffffff)",
            flexShrink: 0,
            gap: 16,
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 20 }}>📋</span>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--text, #0f172a)" }}>
                {tx("orders.vazifalarni_taqsimlash", undefined, "Vazifalarni taqsimlash")}
              </h2>
              <span className="badge badge-brand" style={{ fontSize: 12, fontWeight: 600 }}>
                {projectName}
              </span>
            </div>
            {order && (
              <div style={{ fontSize: 12.5, color: "#64748b", marginTop: 4 }}>
                Buyurtma: <strong>#{order.id} — {order.system_name}</strong>
              </div>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                display: "inline-flex",
                background: "#f1f5f9",
                borderRadius: 8,
                padding: 3,
                gap: 4,
              }}
            >
              <button
                type="button"
                className="btn btn-sm"
                style={{
                  background: activeTab === "assign" ? "#ffffff" : "transparent",
                  color: activeTab === "assign" ? "#0f172a" : "#64748b",
                  fontWeight: activeTab === "assign" ? 700 : 500,
                  boxShadow: activeTab === "assign" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                  border: "none",
                  borderRadius: 6,
                  padding: "5px 12px",
                }}
                onClick={() => setActiveTab("assign")}
              >
                ⚡ {tx("orders.yangi_vazifalar_taqsimlash", undefined, "Yangi vazifalar taqsimlash")}{" "}
                {newTasksCount > 0 && <span className="badge badge-primary ml-1" style={{ fontSize: 11 }}>{newTasksCount}</span>}
              </button>
              <button
                type="button"
                className="btn btn-sm"
                style={{
                  background: activeTab === "list" ? "#ffffff" : "transparent",
                  color: activeTab === "list" ? "#0f172a" : "#64748b",
                  fontWeight: activeTab === "list" ? 700 : 500,
                  boxShadow: activeTab === "list" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                  border: "none",
                  borderRadius: 6,
                  padding: "5px 12px",
                }}
                onClick={() => setActiveTab("list")}
              >
                📋 {tx("orders.mavjud_vazifalar", undefined, "Mavjud vazifalar")} ({totalTasks})
              </button>
            </div>

            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ padding: "6px 10px", fontSize: 18, color: "#64748b" }}
              onClick={onClose}
              title={tx("common.yopish")}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {error && <ErrorMsg error={error} />}
          {successMsg && (
            <div
              style={{
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                color: "#15803d",
                padding: "10px 16px",
                borderRadius: 8,
                marginBottom: 16,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              ✓ {successMsg}
            </div>
          )}

          {activeTab === "assign" ? (
            <div>
              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: 10,
                  padding: "12px 18px",
                  marginBottom: 18,
                  fontSize: 13,
                  color: "#475569",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                <span>
                  💡 <strong>Qulaylik:</strong> Bir yoki bir nechta dasturchini tanlang. Har biriga bir nechta vazifa, boshlanish/tugash sanalari va fayllar biriktirishingiz mumkin.
                </span>
                {totalTasks > 0 && (
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    style={{ fontSize: 12.5, color: "#2563eb", fontWeight: 600 }}
                    onClick={() => setActiveTab("list")}
                  >
                    Mavjud vazifalarni ko'rish ({totalTasks}) →
                  </button>
                )}
              </div>

              <TeamPicker
                picks={team}
                onChange={setTeam}
                roles={(meta?.project_role || []).filter((r) => r.value !== "MANAGER")}
                priorities={meta?.task_priority || []}
                defaultRole="DEVELOPER"
                excludeId={user?.id}
              />

              <div
                style={{
                  marginTop: 24,
                  paddingTop: 16,
                  borderTop: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: 12,
                }}
              >
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={onClose}
                  disabled={saving}
                >
                  {tx("common.bekor_qilish")}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void handleSaveTasks()}
                  disabled={saving || newTasksCount === 0}
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 20px" }}
                >
                  <span>{saving ? "⏳" : "💾"}</span>
                  <span>
                    {saving
                      ? tx("common.saqlanmoqda")
                      : `${tx("orders.vazifa_biriktirish", undefined, "Vazifalarni biriktirish")} (${newTasksCount})`}
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <div>
              {loading ? (
                <Loading text={tx("common.yuklanmoqda")} />
              ) : tasks.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "48px 20px",
                    background: "#ffffff",
                    borderRadius: 12,
                    border: "1px dashed #cbd5e1",
                  }}
                >
                  <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", marginBottom: 6 }}>
                    {tx("orders.hozircha_vazifalar_yoq", undefined, "Hozircha vazifalar mavjud emas")}
                  </div>
                  <p style={{ fontSize: 13, color: "#64748b", maxWidth: 450, margin: "0 auto 18px" }}>
                    Ushbu loyiha uchun hali vazifalar taqsimlanmagan. Yangi vazifa yaratish uchun quyidagi tugmani bosing.
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setActiveTab("assign")}
                  >
                    ⚡ {tx("orders.yangi_vazifalar_taqsimlash", undefined, "Yangi vazifalar taqsimlash")}
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <div style={{ fontSize: 13, color: "#64748b" }}>
                      Vazifa ustiga bosib, uning to'liq sahifasini ochishingiz, tahrirlashingiz yoki tasdiqlashingiz mumkin.
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={() => setActiveTab("assign")}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                    >
                      <span>+</span>
                      <span>{tx("orders.yangi_vazifalar_taqsimlash", undefined, "Yangi vazifa taqsimlash")}</span>
                    </button>
                  </div>

                  <div
                    style={{
                      background: "#ffffff",
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      overflow: "hidden",
                    }}
                  >
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "#f8fafc", borderBottom: "1px solid var(--border)", fontSize: 12, color: "#64748b", textAlign: "left" }}>
                          <th style={{ padding: "10px 14px", width: 50, textAlign: "center" }}>#</th>
                          <th style={{ padding: "10px 14px" }}>Vazifa nomi</th>
                          <th style={{ padding: "10px 14px" }}>Ijrochilar</th>
                          <th style={{ padding: "10px 14px" }}>Holat</th>
                          <th style={{ padding: "10px 14px" }}>Muhimlik</th>
                          <th style={{ padding: "10px 14px" }}>Boshlanish</th>
                          <th style={{ padding: "10px 14px" }}>Muddat</th>
                          <th style={{ padding: "10px 14px", textAlign: "right" }}>Amal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tasks.map((t, idx) => (
                          <tr
                            key={t.id}
                            style={{
                              borderBottom: "1px solid #f1f5f9",
                              cursor: "pointer",
                              transition: "background 0.15s ease",
                            }}
                            onClick={() => setSelectedTaskId(t.id)}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "#f8fafc";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "transparent";
                            }}
                          >
                            <td style={{ padding: "12px 14px", textAlign: "center", fontSize: 12.5, color: "#94a3b8", fontWeight: 600 }}>
                              {idx + 1}
                            </td>
                            <td style={{ padding: "12px 14px" }}>
                              <div style={{ fontWeight: 600, fontSize: 13.5, color: "#0f172a" }}>
                                {t.title}
                              </div>
                              {t.acceptance_criteria && (
                                <div style={{ fontSize: 11.5, color: "#64748b", marginTop: 2, maxWidth: 380, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {t.acceptance_criteria}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: "12px 14px" }}>
                              {t.assignees && t.assignees.length > 0 ? (
                                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                  {t.assignees.map((a) => (
                                    <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                      <Avatar user={a} size="sm" />
                                      <span style={{ fontSize: 12.5, color: "#334155", fontWeight: 500 }}>
                                        {a.full_name}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span style={{ fontSize: 12, color: "#94a3b8" }}>—</span>
                              )}
                            </td>
                            <td style={{ padding: "12px 14px" }}>
                              <StatusBadge task={t} />
                            </td>
                            <td style={{ padding: "12px 14px" }}>
                              <Priority task={t} />
                            </td>
                            <td style={{ padding: "12px 14px", fontSize: 12.5, color: "#64748b", whiteSpace: "nowrap" }}>
                              {t.start_date ? fmtDate(t.start_date) : "—"}
                            </td>
                            <td style={{ padding: "12px 14px", fontSize: 12.5, color: "#64748b", whiteSpace: "nowrap" }}>
                              {t.due_date ? fmtDate(t.due_date) : "—"}
                            </td>
                            <td style={{ padding: "12px 14px", textAlign: "right" }}>
                              <button
                                type="button"
                                className="btn btn-sm btn-ghost"
                                style={{ color: "#2563eb", fontWeight: 600, fontSize: 12 }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedTaskId(t.id);
                                }}
                              >
                                Ko'rish →
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Task Detail Modal on top */}
      {selectedTaskId && (
        <Suspense fallback={null}>
          <TaskDetailModal
            taskId={selectedTaskId}
            onClose={() => {
              setSelectedTaskId(null);
              void loadData();
              onTasksUpdated?.();
            }}
          />
        </Suspense>
      )}
    </div>,
    document.body
  );
}
