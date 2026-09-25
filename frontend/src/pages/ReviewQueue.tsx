import { Suspense, lazy, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api, listOf, pagesOf, totalOf } from "@/api/client";
import { useFetch } from "@/api/useFetch";
import type { Task } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { IconCheck, IconClose } from "@/components/icons";
import { PageHeader } from "@/components/ui";
import {
  AvatarStack,
  EmptyState,
  ErrorMsg,
  FilterBar,
  Loading,
  Pager,
  Priority,
  StatusBadge,
  TableSkeleton,
  fmtDate,
} from "@/components/ui";
import { useDebouncedLive } from "@/realtime/RealtimeContext";
import { toTask } from "@/nav";
import { tx } from "@/i18n";
import { Button } from "@/components/Button";

const TaskDetailModal = lazy(() => import("@/pages/TaskDetail"));

/** «Qaytarish» uchun qaror kodi - serverdagi ro'yxatdan qidiriladi. */
const REJECT_HINTS = ["CHANGES_REQUESTED", "REJECTED", "RETURNED"];

/** Har bir sahifada 15 tadan vazifa ko'rsatiladi. */
const PER_PAGE = 15;

export default function ReviewQueue() {
  const fid = useId();
  const { meta } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");

  // Modallar holati
  const [reviewTask, setReviewTask] = useState<Task | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [verdict, setVerdict] = useState("APPROVED");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, error: loadError, loading, reload } = useFetch<unknown>(
    "/tasks/review-queue/",
    { page, page_size: PER_PAGE }
  );
  const error = actionError || loadError;

  // Realtime voqealar
  useDebouncedLive((d) => {
    if (d.event === "task.update") reload();
  }, 1200);

  const rawList = useMemo(() => (data ? listOf<Task>(data) : []), [data]);
  const total = totalOf(data);
  const pages = pagesOf(data, PER_PAGE);

  const isServerPaginated = data && typeof data === "object" && "results" in data;
  const tasks = useMemo(() => {
    if (isServerPaginated) return rawList;
    const start = (page - 1) * PER_PAGE;
    return rawList.slice(start, start + PER_PAGE);
  }, [rawList, isServerPaginated, page]);

  // Frontend filter for search / project
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchTitle = t.title.toLowerCase().includes(q);
        const matchProject = t.project_name?.toLowerCase().includes(q);
        const matchAssignee = t.assignees?.some((a) => a.full_name.toLowerCase().includes(q));
        if (!matchTitle && !matchProject && !matchAssignee) return false;
      }
      if (projectFilter && t.project_name !== projectFilter) return false;
      if (priorityFilter && String(t.priority) !== priorityFilter) return false;
      return true;
    });
  }, [tasks, search, projectFilter, priorityFilter]);

  // Unique project names for filter dropdown
  const projectOptions = useMemo(() => {
    const set = new Set<string>();
    rawList.forEach((t) => {
      if (t.project_name) set.add(t.project_name);
    });
    return Array.from(set);
  }, [rawList]);

  const verdicts = meta?.review_verdict || [];
  const rejectValue = String(
    verdicts.find((v) => REJECT_HINTS.includes(String(v.value)))?.value ??
      verdicts.find((v) => String(v.value) !== "APPROVED")?.value ??
      "CHANGES_REQUESTED"
  );

  function openReviewModal(task: Task, initialVerdict: string) {
    setActionError(null);
    setVerdict(initialVerdict);
    setComment("");
    setReviewTask(task);
  }

  async function submitReview() {
    if (!reviewTask) return;
    setBusy(true);
    setActionError(null);
    try {
      await api.post(`/tasks/${reviewTask.id}/review/`, { verdict, comment });
      setReviewTask(null);
      setComment("");
      setVerdict("APPROVED");
      reload();
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err.message
          : tx("review_queue.tekshiruvni_saqlab_bolmadi", undefined, "Tekshiruvni saqlab bo'lmadi")
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="content" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PageHeader
        title={tx("common.tekshiruv_navbati", undefined, "Tekshiruv navbati")}
        subtitle={tx("review_queue.tavsif", undefined, "Tasdiqlashni kutayotgan topshirilgan vazifalar ro'yxati")}
        breadcrumbs={[
          { label: tx("common.bosh_sahifa", undefined, "Bosh sahifa"), href: "/" },
          { label: tx("common.tekshiruv_navbati", undefined, "Tekshiruv navbati") },
        ]}
        actions={
          total > 0 ? (
            <span className="badge badge-danger" style={{ fontSize: 13, padding: "4px 10px" }}>
              {total} {tx("review_queue.ta_kutmoqda", undefined, "ta kutmoqda")}
            </span>
          ) : undefined
        }
      />

      <FilterBar>
        {/* Search */}
        <div className="f" style={{ minWidth: 220 }}>
          <label htmlFor={`${fid}-search`} className="sr-only">
            {tx("common.qidiruv", undefined, "Qidiruv")}
          </label>
          <input
            id={`${fid}-search`}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tx("review_queue.qidirish_placeholder", undefined, "Vazifa yoki ijrochi...")}
          />
        </div>

        {/* Project filter */}
        {projectOptions.length > 0 && (
          <div className="f" style={{ minWidth: 160 }}>
            <label htmlFor={`${fid}-project`} className="sr-only">
              {tx("common.loyiha", undefined, "Loyiha")}
            </label>
            <select
              id={`${fid}-project`}
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
            >
              <option value="">{tx("projects.barcha_loyihalar", undefined, "Barcha loyihalar")}</option>
              {projectOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Priority filter */}
        <div className="f" style={{ minWidth: 140 }}>
          <label htmlFor={`${fid}-priority`} className="sr-only">
            {tx("common.ustuvorlik", undefined, "Ustuvorlik")}
          </label>
          <select
            id={`${fid}-priority`}
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
          >
            <option value="">{tx("common.barcha_ustuvorliklar", undefined, "Barcha ustuvorliklar")}</option>
            <option value="1">Past</option>
            <option value="2">O'rta</option>
            <option value="3">Yuqori</option>
            <option value="4">Shoshilinch</option>
          </select>
        </div>

        {(search || projectFilter || priorityFilter) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setProjectFilter("");
              setPriorityFilter("");
            }}
          >
            {tx("common.tozalash", undefined, "Tozalash")}
          </Button>
        )}
      </FilterBar>

      <ErrorMsg error={error} />

      {/* Unified Table View */}
      <div className="table-card-clean">
        {loading && !tasks.length ? (
          <TableSkeleton rows={6} cols={7} />
        ) : !filteredTasks.length ? (
          <EmptyState
            icon="✓"
            title={tx("review_queue.navbat_bosh", undefined, "Navbat bo'sh")}
            message={
              search || projectFilter || priorityFilter
                ? tx("projects.filtr_natijasi_yoq", undefined, "Tanlangan filtrlar bo'yicha hech qanday vazifa topilmadi.")
                : tx("review_queue.hozircha_tekshirishga_yuborilgan_ish_yoq", undefined, "Hozircha tekshirishga yuborilgan ishlar mavjud emas.")
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table-clean">
              <thead>
                <tr>
                  <th style={{ width: 44, textAlign: "center" }}>№</th>
                  <th>{tx("review_queue.vazifa_nomi", undefined, "Vazifa nomi")}</th>
                  <th>{tx("review_queue.topshirdi", undefined, "Topshirgan ijrochi")}</th>
                  <th>{tx("common.loyiha", undefined, "Loyiha")}</th>
                  <th>{tx("common.sana", undefined, "Topshirilgan sana")}</th>
                  <th style={{ width: 120 }}>{tx("common.holat", undefined, "Holati")}</th>
                  <th style={{ width: 180, textAlign: "right" }}>{tx("common.amallar", undefined, "Amallar")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map((t, idx) => {
                  const rowNum = (page - 1) * PER_PAGE + idx + 1;
                  return (
                    <tr
                      key={t.id}
                      className="clickable"
                      onClick={() => setSelectedTaskId(t.id)}
                    >
                      <td style={{ textAlign: "center", color: "var(--muted)", fontWeight: 600 }}>
                        {rowNum}
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          <span
                            style={{
                              fontWeight: 650,
                              fontSize: 14,
                              color: "var(--accent)",
                            }}
                          >
                            {t.title}
                          </span>
                          <div className="row middle" style={{ gap: 6, flexWrap: "wrap" }}>
                            <Priority task={t} />
                            {t.specialty_label && (
                              <span className="badge badge-brand" style={{ fontSize: 10 }}>
                                {t.specialty_label}
                              </span>
                            )}
                            {!!t.attachment_count && (
                              <span className="badge" style={{ fontSize: 10 }}>
                                {t.attachment_count} {tx("review_queue.fayl", undefined, "fayl")}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="row middle" style={{ gap: 6 }}>
                          <AvatarStack users={t.assignees} />
                          {t.assignees?.length === 1 && (
                            <span style={{ fontSize: 13 }}>{t.assignees[0].full_name}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className="nowrap" style={{ fontSize: 13, color: "var(--text)" }}>
                          {t.project_name}
                        </span>
                      </td>
                      <td>
                        <span className="nowrap muted" style={{ fontSize: 12 }}>
                          {fmtDate(t.submitted_at)}
                        </span>
                      </td>
                      <td>
                        <StatusBadge task={t} />
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div
                          className="row middle"
                          style={{ justifyContent: "flex-end", gap: 6 }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            variant="success"
                            size="sm"
                            onClick={() => openReviewModal(t, "APPROVED")}
                            style={{ padding: "4px 8px", fontSize: 12 }}
                          >
                            <IconCheck size={13} />
                            <span>{tx("common.qabul_qilish", undefined, "Tasdiqlash")}</span>
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => openReviewModal(t, rejectValue)}
                            style={{ padding: "4px 8px", fontSize: 12 }}
                          >
                            {tx("review_queue.qaytarish", undefined, "Qaytarish")}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 16px",
              borderTop: "1px solid var(--border)",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              {total} {tx("common.tadan", undefined, "tadan")} {(page - 1) * PER_PAGE + 1}—
              {Math.min(page * PER_PAGE, total)} {tx("common.tasi", undefined, "tasi")} ({page}/{pages})
            </p>
            <Pager page={page} pages={pages} onPick={setPage} />
          </div>
        )}
      </div>

      {/* Task Detail Modal (opens in-place without navigating away!) */}
      {selectedTaskId && (
        <Suspense fallback={null}>
          <TaskDetailModal
            taskId={selectedTaskId}
            initialSection="submission"
            onClose={() => {
              setSelectedTaskId(null);
              reload();
            }}
          />
        </Suspense>
      )}

      {/* Review Verdict Modal */}
      {reviewTask && (
        <div
          className="modal-overlay"
          style={{ zIndex: 99999 }}
          onClick={() => setReviewTask(null)}
        >
          <div
            className="modal-card"
            style={{ maxWidth: 560, width: "94vw" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                <span className="badge badge-brand" style={{ alignSelf: "flex-start", fontSize: 11 }}>
                  {reviewTask.project_name}
                </span>
                <h3 style={{ margin: 0, fontSize: 16 }}>
                  {tx("review_queue.qaror_chiqarish", undefined, "Tekshiruv xulosasi")}: {reviewTask.title}
                </h3>
              </div>
              <Button
                iconOnly
                variant="ghost"
                size="sm"
                onClick={() => setReviewTask(null)}
              >
                <IconClose size={16} />
              </Button>
            </div>

            <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="muted" style={{ fontSize: 12.5 }}>
                {reviewTask.review_round} {tx("review_queue.aylana", undefined, "-bosqich tekshiruvi")}{" "}
                {reviewTask.logged_hours ? `· ${reviewTask.logged_hours} ${tx("review_queue.soat_sarflangan", undefined, "soat sarflangan")}` : ""}
              </div>

              {reviewTask.acceptance_criteria && (
                <div style={{ padding: "10px 12px", background: "var(--surface-1)", borderRadius: 8, border: "1px solid var(--border)" }}>
                  <strong style={{ fontSize: 12, color: "var(--text)", display: "block", marginBottom: 4 }}>
                    {tx("common.tayyorlik_mezoni", undefined, "Tayyorlik mezoni")}
                  </strong>
                  <div style={{ fontSize: 12.5, color: "var(--muted)", whiteSpace: "pre-wrap" }}>
                    {reviewTask.acceptance_criteria}
                  </div>
                </div>
              )}

              <div className="field">
                <span className="lbl">{tx("review_queue.qaror", undefined, "Qaror")}</span>
                <div className="check-list" style={{ display: "flex", gap: 12, marginTop: 4 }}>
                  {verdicts.map((v) => (
                    <label
                      key={v.value}
                      className={verdict === String(v.value) ? "on" : ""}
                      style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}
                    >
                      <input
                        type="radio"
                        checked={verdict === String(v.value)}
                        onChange={() => setVerdict(String(v.value))}
                      />
                      {v.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="field">
                <label htmlFor={`${fid}-review-comment`}>
                  {tx("review_queue.izoh", undefined, "Izoh (ijrochiga tushuntirish)")}
                </label>
                <textarea
                  id={`${fid}-review-comment`}
                  rows={3}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={tx("review_queue.nimani_tuzatish_kerak_aniq_yozing", undefined, "Agar qaytarilayotgan bo'lsa, nimani to'g'irlash kerakligini aniq yozing...")}
                />
              </div>
            </div>

            <div
              className="modal-footer"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderTop: "1px solid var(--border)",
                padding: "12px 16px",
              }}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedTaskId(reviewTask.id);
                  setReviewTask(null);
                }}
              >
                {tx("review_queue.vazifani_toliq_korish", undefined, "Vazifani to'liq ko'rish")}
              </Button>

              <div className="row middle" style={{ gap: 8 }}>
                <Button variant="ghost" onClick={() => setReviewTask(null)}>
                  {tx("common.bekor_qilish", undefined, "Bekor qilish")}
                </Button>
                <Button
                  variant={verdict === "APPROVED" ? "success" : "danger"}
                  disabled={busy}
                  onClick={() => void submitReview()}
                >
                  {busy ? tx("common.yuklanmoqda", undefined, "Saqlanmoqda...") : tx("review_queue.qarorni_saqlash", undefined, "Qarorni tasdiqlash")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
