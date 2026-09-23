import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api, listOf } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { lockScroll, unlockScroll } from "@/components/scrollLock";
import TeamPicker, { addPickedMembers, createPickedTasks, taskCount, tasksOf, type Pick as TeamPick } from "@/components/TeamPicker";
import { Avatar, ErrorMsg, Loading, Priority, StatusBadge, fmtDate } from "@/components/ui";
import { tx } from "@/i18n";
import type { ChangeRequestItem, Project, Task } from "@/api/types";
import { Button, ButtonGroup } from "@/components/Button";
import { IconClose } from "@/components/icons";

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
      setError(tx("project_form.kamida_bitta_vazifa", undefined, "Hech bo'lmaganda bitta vazifa kiritilishi shart."));
      return;
    }
    const orderDate = order?.request_date ? order.request_date.split("T")[0] : "";
    const projectStartDate = project?.start_date || "";
    const minTaskStartDate = (orderDate && projectStartDate)
      ? (orderDate > projectStartDate ? orderDate : projectStartDate)
      : (orderDate || projectStartDate);

    if (minTaskStartDate) {
      for (const p of team) {
        for (const t of tasksOf(p)) {
          if (t.start_date && t.start_date < minTaskStartDate) {
            const formatted = minTaskStartDate.split("-").reverse().join(".");
            const reason = orderDate ? "buyurtma sanasidan" : "loyiha boshlanish sanasidan";
            setError(`«${t.title}» vazifasining boshlanish sanasi ${reason} (${formatted}) oldin bo'lishi mumkin emas.`);
            return;
          }
        }
      }
    }

    setSaving(true);
    try {
      const failedMembers = await addPickedMembers(projectId, team);
      const { failedTasks, failedFiles } = await createPickedTasks(projectId, team, false, order?.id || null);

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

  const orderDate = order?.request_date ? order.request_date.split("T")[0] : "";
  const projectStartDate = project?.start_date || "";
  const minTaskStartDate = (orderDate && projectStartDate)
    ? (orderDate > projectStartDate ? orderDate : projectStartDate)
    : (orderDate || projectStartDate);
  const maxTaskDueDate = order?.pm_deadline || order?.due_date || project?.due_date || undefined;

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
        background: "var(--overlay)",
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
          boxShadow: "var(--shadow-modal)",
          overflow: "hidden",
          background: "var(--canvas)",
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
            background: "var(--surface)",
            flexShrink: 0,
            gap: 16,
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 20 }}>📋</span>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--text)" }}>
                {tx("orders.vazifalarni_taqsimlash", undefined, "Vazifalarni taqsimlash")}
              </h2>
              <span className="badge badge-brand" style={{ fontSize: 12, fontWeight: 600 }}>
                {projectName}
              </span>
            </div>
            {order && (
              <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4 }}>
                Buyurtma: <strong>#{order.id} — {order.system_name}</strong>
              </div>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <ButtonGroup>
              <Button size="sm" active={activeTab === "assign"} onClick={() => setActiveTab("assign")}>
                ⚡ {tx("orders.yangi_vazifalar_taqsimlash", undefined, "Yangi vazifalar taqsimlash")}{" "}
                {newTasksCount > 0 && <span className="badge badge-primary">{newTasksCount}</span>}
              </Button>
              <Button size="sm" active={activeTab === "list"} onClick={() => setActiveTab("list")}>
                📋 {tx("orders.mavjud_vazifalar", undefined, "Mavjud vazifalar")} ({totalTasks})
              </Button>
            </ButtonGroup>

            <Button variant="ghost" size="sm" iconOnly onClick={onClose}
                    title={tx("common.yopish")} aria-label={tx("common.yopish")}>
              <IconClose size={16} />
            </Button>
          </div>
        </div>

        {/* Modal Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {error && <ErrorMsg error={error} />}
          {successMsg && (
            <div
              style={{
                background: "var(--success-soft)",
                border: "1px solid var(--success-border)",
                color: "var(--success)",
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
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "12px 18px",
                  marginBottom: 18,
                  fontSize: 13,
                  color: "var(--text-secondary)",
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
                  <Button variant="link" size="sm" onClick={() => setActiveTab("list")}>
                    {tx("orders.mavjud_vazifalarni_korish", { n: totalTasks })}
                  </Button>
                )}
              </div>

              <TeamPicker
                picks={team}
                onChange={setTeam}
                roles={(meta?.project_role || []).filter((r) => r.value !== "MANAGER")}
                priorities={meta?.task_priority || []}
                defaultRole="DEVELOPER"
                excludeId={user?.id}
                projectStartDate={minTaskStartDate || undefined}
                projectDueDate={maxTaskDueDate || undefined}
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
                <Button
                  
                  onClick={onClose}
                  disabled={saving}
                >
                  {tx("common.bekor_qilish")}
                </Button>
                <Button
                  variant="primary"
                  onClick={() => void handleSaveTasks()}
                  disabled={saving || newTasksCount === 0}
                >
                  <span>{saving ? "⏳" : "💾"}</span>
                  <span>
                    {saving
                      ? tx("common.saqlanmoqda")
                      : `${tx("orders.vazifa_biriktirish", undefined, "Vazifalarni biriktirish")} (${newTasksCount})`}
                  </span>
                </Button>
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
                    background: "var(--surface)",
                    borderRadius: 12,
                    border: "1px dashed var(--border-strong)",
                  }}
                >
                  <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>
                    {tx("orders.hozircha_vazifalar_yoq", undefined, "Hozircha vazifalar mavjud emas")}
                  </div>
                  <p style={{ fontSize: 13, color: "var(--muted)", maxWidth: 450, margin: "0 auto 18px" }}>
                    Ushbu loyiha uchun hali vazifalar taqsimlanmagan. Yangi vazifa yaratish uchun quyidagi tugmani bosing.
                  </p>
                  <Button
                    variant="primary"
                    onClick={() => setActiveTab("assign")}
                  >
                    ⚡ {tx("orders.yangi_vazifalar_taqsimlash", undefined, "Yangi vazifalar taqsimlash")}
                  </Button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <div style={{ fontSize: 13, color: "var(--muted)" }}>
                      Vazifa ustiga bosib, uning to'liq sahifasini ochishingiz, tahrirlashingiz yoki tasdiqlashingiz mumkin.
                    </div>
                    <Button
                      size="sm"
                      onClick={() => setActiveTab("assign")}
                    >
                      <span>+</span>
                      <span>{tx("orders.yangi_vazifalar_taqsimlash", undefined, "Yangi vazifa taqsimlash")}</span>
                    </Button>
                  </div>

                  <div
                    style={{
                      background: "var(--surface)",
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      overflow: "hidden",
                    }}
                  >
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)", fontSize: 12, color: "var(--muted)", textAlign: "left" }}>
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
                              borderBottom: "1px solid var(--border-muted)",
                              cursor: "pointer",
                              transition: "background 0.15s ease",
                            }}
                            onClick={() => setSelectedTaskId(t.id)}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "var(--surface-2)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "transparent";
                            }}
                          >
                            <td style={{ padding: "12px 14px", textAlign: "center", fontSize: 12.5, color: "var(--subtle)", fontWeight: 600 }}>
                              {idx + 1}
                            </td>
                            <td style={{ padding: "12px 14px" }}>
                              <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--text)" }}>
                                {t.title}
                              </div>
                              {t.acceptance_criteria && (
                                <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2, maxWidth: 380, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
                                      <span style={{ fontSize: 12.5, color: "var(--text-secondary)", fontWeight: 500 }}>
                                        {a.full_name}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span style={{ fontSize: 12, color: "var(--subtle)" }}>—</span>
                              )}
                            </td>
                            <td style={{ padding: "12px 14px" }}>
                              <StatusBadge task={t} />
                            </td>
                            <td style={{ padding: "12px 14px" }}>
                              <Priority task={t} />
                            </td>
                            <td style={{ padding: "12px 14px", fontSize: 12.5, color: "var(--muted)", whiteSpace: "nowrap" }}>
                              {t.start_date ? fmtDate(t.start_date) : "—"}
                            </td>
                            <td style={{ padding: "12px 14px", fontSize: 12.5, color: "var(--muted)", whiteSpace: "nowrap" }}>
                              {t.due_date ? fmtDate(t.due_date) : "—"}
                            </td>
                            <td style={{ padding: "12px 14px", textAlign: "right" }}>
                              <Button
                                variant="link" size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedTaskId(t.id);
                                }}
                              >
                                {tx("common.korish")} →
                              </Button>
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
