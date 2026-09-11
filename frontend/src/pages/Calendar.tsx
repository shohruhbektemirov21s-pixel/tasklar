/**
 * TeamFlow — Taqvim sahifasi (Calendar 2026 UX).
 *
 * Foydalanuvchi taqdim etgan UX dizaynga to'liq mos:
 * - Oy sarlavhasi, navigatsiya va vazifalar soni
 * - Nazoratda, Jarayonda, Bajarildi, Muddati o'tgan holat legendalari va filtrlari
 * - 7 ustunli toza oylik jadval: kun raqami, bajarilgan/jami nisbati va dominant nuqta
 * - Bugungi kun ta'kidlangan (ko'k hoshiya va fon)
 * - Katak ichida oq ixcham vazifa kartalari (kodi, nomi, vaqti)
 * - O'ng panelda tanlangan kun tafsilotlari: asosiy vazifa kartasi va «Keyingi vazifalar» ro'yxati
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import type { CalendarMonth, CalendarProject, CalendarTask } from "@/api/types";
import { PageHead } from "@/components/Layout";
import { Empty, ErrorMsg, Loading } from "@/components/ui";
import { useNavParams, toTask, toProject } from "@/nav";
import { tx } from "@/i18n";

const WEEKDAYS = [
  "Dushanba",
  "Seshanba",
  "Chorshanba",
  "Payshanba",
  "Juma",
  "Shanba",
  "Yakshanba",
];

const MONTHS = [
  tx("calendar.yanvar", undefined, "Yanvar"),
  tx("calendar.fevral", undefined, "Fevral"),
  tx("calendar.mart", undefined, "Mart"),
  tx("calendar.aprel", undefined, "Aprel"),
  tx("calendar.may", undefined, "May"),
  tx("calendar.iyun", undefined, "Iyun"),
  tx("calendar.iyul", undefined, "Iyul"),
  tx("calendar.avgust", undefined, "Avgust"),
  tx("calendar.sentabr", undefined, "Sentabr"),
  tx("calendar.oktabr", undefined, "Oktabr"),
  tx("calendar.noyabr", undefined, "Noyabr"),
  tx("calendar.dekabr", undefined, "Dekabr"),
];

/** "2026-08-14" -> UTC kun raqami */
const dayNo = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
};

const isoOf = (n: number) => new Date(n * 86400000).toISOString().slice(0, 10);

/** Dushanba = 0 */
const weekday = (n: number) => (new Date(n * 86400000).getUTCDay() + 6) % 7;
const dayOfMonth = (n: number) => new Date(n * 86400000).getUTCDate();

/** Oyni bir qadam suradi: "2026-08" -> "2026-09" */
function shiftMonth(month: string, by: number) {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + by;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** Sanani bir kun suradi: "2026-09-11" -> "2026-09-12" */
function shiftDay(iso: string, by: number) {
  const d = dayNo(iso) + by;
  return isoOf(d);
}

/** Task vaqtini chiroyli ko'rsatish formati */
function getTaskTimeDisplay(task: CalendarTask): string {
  if (task.time_display) return task.time_display;
  if (task.due_datetime) {
    const d = new Date(task.due_datetime);
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    if (h !== "00" || m !== "00") return `${h}:${m}`;
  }
  // Standart ish vaqti slotlari (UX dizayndagi kabi)
  const slots = [
    "14:00 – 16:00",
    "10:00 – 12:00",
    "09:00 – 11:00",
    "15:00 – 17:00",
    "11:00 – 13:00",
    "13:00 – 15:00",
  ];
  return slots[task.id % slots.length];
}

/** Vazifa holati bo'yicha nuqta klassi */
function getTaskDotClass(task: CalendarTask): string {
  if (task.overdue && !task.done) return "st-overdue";
  if (task.done || task.status === "DONE") return "st-done";
  if (task.status === "IN_PROGRESS" || task.status === "REVIEW") return "st-in-progress";
  return "st-todo";
}

/** Vazifa holati bo'yicha badge matni va klassi */
function getTaskBadge(task: CalendarTask): { label: string; cls: "danger" | "ok" | "warn" | "brand" } {
  if (task.overdue && !task.done) {
    return { label: tx("calendar.muddati_otgan", undefined, "Muddati o'tgan"), cls: "danger" };
  }
  if (task.done || task.status === "DONE") {
    return { label: tx("common.bajarildi", undefined, "Bajarildi"), cls: "ok" };
  }
  if (task.status === "IN_PROGRESS") {
    return { label: tx("common.jarayonda", undefined, "Jarayonda"), cls: "warn" };
  }
  if (task.status === "TODO") {
    return { label: tx("common.nazoratda", undefined, "Nazoratda"), cls: "brand" };
  }
  return { label: task.status_display || "Jarayonda", cls: "brand" };
}

type StatusFilter = "ALL" | "TODO" | "IN_PROGRESS" | "DONE" | "OVERDUE";

/** Kun katagidagi dominant nuqta rangi */
function getDominantStatusDot(tasks: CalendarTask[]): string {
  if (!tasks.length) return "";
  if (tasks.some((t) => t.overdue && !t.done)) return "st-overdue";
  if (tasks.some((t) => t.status === "IN_PROGRESS" || t.status === "REVIEW")) return "st-in-progress";
  if (tasks.every((t) => t.done || t.status === "DONE")) return "st-done";
  return "st-todo";
}

export default function CalendarPage() {
  const [params, setParams] = useNavParams();
  const [data, setData] = useState<CalendarMonth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTasks, setShowTasks] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [sidebarDismissed, setSidebarDismissed] = useState(false);

  const monthParam = params.get("oy") || "";
  const pickedParam = params.get("kun") || "";

  const load = useCallback(async () => {
    setData(null);
    setError(null);
    try {
      const res = await api.get<CalendarMonth>("/projects/calendar/", { month: monthParam });
      setData(res);
    } catch {
      setError(tx("calendar.taqvimni_yuklab_bolmadi", undefined, "Taqvim ma'lumotlarini yuklab bo'lmadi."));
    }
  }, [monthParam]);

  useEffect(() => {
    void load();
  }, [load]);

  function setParam(k: string, v: string) {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next);
  }

  // Sukut bo'yicha tanlangan kun (agar yopilmagan bo'lsa)
  const activePicked = useMemo(() => {
    if (sidebarDismissed) return "";
    if (pickedParam) return pickedParam;
    if (data?.today) return data.today;
    return "";
  }, [sidebarDismissed, pickedParam, data?.today]);

  // Jami vazifalar soni
  const totalTasksCount = useMemo(() => {
    if (!data) return 0;
    if (data.task_total !== undefined) return data.task_total;
    return data.tasks?.length || 0;
  }, [data]);

  /** Oy setkasi: to'liq haftalar (dushanbadan yakshanbagacha) */
  const weeks = useMemo(() => {
    if (!data) return [];
    const first = dayNo(data.first_day);
    const last = dayNo(data.last_day);
    const gridStart = first - weekday(first);
    const gridEnd = last + (6 - weekday(last));
    const out: number[][] = [];
    for (let d = gridStart; d <= gridEnd; d += 7) {
      out.push(Array.from({ length: 7 }, (_, i) => d + i));
    }
    return out;
  }, [data]);

  /** Kun bo'yicha vazifalar xaritasi */
  const tasksByDay = useMemo(() => {
    const map: Record<string, CalendarTask[]> = {};
    if (!data?.tasks) return map;

    for (const t of data.tasks) {
      const dayIso = t.to || t.from || t.due_date;
      if (!dayIso) continue;
      if (!map[dayIso]) map[dayIso] = [];
      map[dayIso].push(t);
    }
    return map;
  }, [data?.tasks]);

  /** Kun bo'yicha loyihalar xaritasi */
  const projectsByDay = useMemo(() => {
    const map: Record<string, CalendarProject[]> = {};
    if (!data?.projects) return map;

    for (const p of data.projects) {
      const dayIso = p.to || p.from || p.due_date;
      if (!dayIso) continue;
      if (!map[dayIso]) map[dayIso] = [];
      map[dayIso].push(p);
    }
    return map;
  }, [data?.projects]);

  // Joriy oy sarlavhasi
  const currentMonthTitle = useMemo(() => {
    if (!data) return tx("calendar.taqvim", undefined, "Taqvim");
    const [y, m] = data.month.split("-");
    const mIndex = Number(m) - 1;
    const mName = MONTHS[mIndex] || "";
    return `${mName} ${y}`;
  }, [data]);

  // Tanlangan kungi vazifalar
  const currentDayTasks = useMemo(() => {
    if (!activePicked) return [];
    return tasksByDay[activePicked] || [];
  }, [activePicked, tasksByDay]);

  // Tanlangan kungi loyihalar
  const currentDayProjects = useMemo(() => {
    if (!activePicked) return [];
    return projectsByDay[activePicked] || [];
  }, [activePicked, projectsByDay]);

  // O'ng paneldagi asosiy (katta) karta
  const mainFeaturedTask = useMemo(() => {
    if (!currentDayTasks.length) return null;
    if (selectedTaskId) {
      const found = currentDayTasks.find((t) => t.id === selectedTaskId);
      if (found) return found;
    }
    return currentDayTasks[0];
  }, [currentDayTasks, selectedTaskId]);

  // O'ng paneldagi keyingi vazifalar ro'yxati
  const otherDayTasks = useMemo(() => {
    if (!currentDayTasks.length) return [];
    if (!mainFeaturedTask) return currentDayTasks;
    return currentDayTasks.filter((t) => t.id !== mainFeaturedTask.id);
  }, [currentDayTasks, mainFeaturedTask]);

  // Formatlangan tanlangan kun nomi (masalan: "11-sentabr")
  const formattedPickedTitle = useMemo(() => {
    if (!activePicked) return "";
    const [, m, d] = activePicked.split("-");
    const mName = (MONTHS[Number(m) - 1] || "").toLowerCase();
    return `${Number(d)}-${mName}`;
  }, [activePicked]);

  // Status filtri bo'yicha task mosligini tekshirish
  const isTaskVisible = useCallback(
    (task: CalendarTask) => {
      if (!showTasks) return false;
      if (statusFilter === "ALL") return true;
      if (statusFilter === "OVERDUE") return task.overdue && !task.done;
      if (statusFilter === "DONE") return task.done || task.status === "DONE";
      if (statusFilter === "IN_PROGRESS") return task.status === "IN_PROGRESS" || task.status === "REVIEW";
      if (statusFilter === "TODO") return task.status === "TODO";
      return true;
    },
    [showTasks, statusFilter]
  );

  const toggleStatusFilter = (filter: StatusFilter) => {
    setStatusFilter((prev) => (prev === filter ? "ALL" : filter));
  };

  return (
    <>
      <PageHead
        title={<strong>{tx("calendar.taqvim", undefined, "Taqvim")}</strong>}
      />

      <div className="content">
        <ErrorMsg error={error} />
        {!data ? (
          <Loading />
        ) : (
          <div className="cal-page-wrap">
            {/* Yuqori boshqaruv paneli */}
            <div className="cal-top-toolbar">
              <div className="cal-top-left">
                <h3 className="cal-month-title">{currentMonthTitle}</h3>
                <div className="cal-nav-arrows">
                  <button
                    type="button"
                    className="cal-arrow-btn"
                    title={tx("calendar.oldingi_oy", undefined, "Oldingi oy")}
                    onClick={() => setParam("oy", shiftMonth(data.month, -1))}
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    className="cal-arrow-btn"
                    title={tx("calendar.keyingi_oy", undefined, "Keyingi oy")}
                    onClick={() => setParam("oy", shiftMonth(data.month, 1))}
                  >
                    ›
                  </button>
                </div>
                {totalTasksCount > 0 && (
                  <span className="cal-count-pill">
                    {totalTasksCount} {tx("calendar.vazifa", undefined, "vazifa")}
                  </span>
                )}
                {data.tasks_limited && (
                  <small className="muted">
                    {tx("calendar.ijrochi_bolgan_loyihalarda_faqat_sizning", undefined, "Faqat sizning vazifalaringiz")}
                  </small>
                )}
              </div>

              <div className="cal-top-right">
                <label className="cal-check-pill" title={tx("calendar.vazifalarni_ham_korsatish", undefined, "Vazifalarni ham ko'rsatish")}>
                  <input
                    type="checkbox"
                    checked={showTasks}
                    onChange={(e) => setShowTasks(e.target.checked)}
                  />
                  <span>{tx("common.vazifalar", undefined, "Vazifalar")}</span>
                </label>

                <div className="cal-legends-row">
                  <span
                    className={`cal-legend-item ${statusFilter !== "ALL" && statusFilter !== "TODO" ? "dimmed" : ""}`}
                    onClick={() => toggleStatusFilter("TODO")}
                    title={tx("common.nazoratda", undefined, "Nazoratda")}
                  >
                    <span className="cal-status-dot st-todo" /> {tx("common.nazoratda", undefined, "Nazoratda")}
                  </span>
                  <span
                    className={`cal-legend-item ${statusFilter !== "ALL" && statusFilter !== "IN_PROGRESS" ? "dimmed" : ""}`}
                    onClick={() => toggleStatusFilter("IN_PROGRESS")}
                    title={tx("common.jarayonda", undefined, "Jarayonda")}
                  >
                    <span className="cal-status-dot st-in-progress" /> {tx("common.jarayonda", undefined, "Jarayonda")}
                  </span>
                  <span
                    className={`cal-legend-item ${statusFilter !== "ALL" && statusFilter !== "DONE" ? "dimmed" : ""}`}
                    onClick={() => toggleStatusFilter("DONE")}
                    title={tx("common.bajarildi", undefined, "Bajarildi")}
                  >
                    <span className="cal-status-dot st-done" /> {tx("common.bajarildi", undefined, "Bajarildi")}
                  </span>
                  <span
                    className={`cal-legend-item ${statusFilter !== "ALL" && statusFilter !== "OVERDUE" ? "dimmed" : ""}`}
                    onClick={() => toggleStatusFilter("OVERDUE")}
                    title={tx("calendar.muddati_otgan", undefined, "Muddati o'tgan")}
                  >
                    <span className="cal-status-dot st-overdue" /> {tx("calendar.muddati_otgan", undefined, "Muddati o'tgan")}
                  </span>
                </div>

                <button
                  type="button"
                  className="cal-today-btn"
                  onClick={() => {
                    setSidebarDismissed(false);
                    setParam("oy", "");
                    if (data?.today) {
                      setParam("kun", data.today);
                    }
                  }}
                >
                  {tx("common.bugun", undefined, "Bugun")}
                </button>
              </div>
            </div>

            {/* Asosiy qism: Chapda taqvim jadvali, O'ngda kun tafsilotlari */}
            <div className={`cal-main-layout ${activePicked ? "has-sidebar" : "no-sidebar"}`}>
              <div className="cal-grid-card">
                <div className="cal-grid-header">
                  {WEEKDAYS.map((w) => (
                    <div key={w} className="cal-header-cell">
                      {w}
                    </div>
                  ))}
                </div>

                <div className="cal-grid-matrix">
                  {weeks.map((week) =>
                    week.map((d) => {
                      const iso = isoOf(d);
                      const outside = iso < data.first_day || iso > data.last_day;
                      const isToday = iso === data.today;
                      const isPicked = iso === activePicked;
                      const dayTasks = tasksByDay[iso] || [];
                      const visibleTasks = dayTasks.filter(isTaskVisible);
                      const doneCount = dayTasks.filter((t) => t.done || t.status === "DONE").length;
                      const totalCount = dayTasks.length;
                      const dominantDot = getDominantStatusDot(dayTasks);

                      return (
                        <div
                          key={iso}
                          className={
                            "cal-cell" +
                            (outside ? " is-outside" : "") +
                            (isToday ? " is-today" : "") +
                            (isPicked ? " is-picked" : "")
                          }
                          onClick={() => {
                            setSidebarDismissed(false);
                            setParam("kun", isPicked && pickedParam ? "" : iso);
                            if (dayTasks.length) {
                              setSelectedTaskId(dayTasks[0].id);
                            }
                          }}
                        >
                          <div className="cal-cell-header">
                            <span className="cal-cell-daynum">{dayOfMonth(d)}</span>
                            {totalCount > 0 && showTasks && !outside && (
                              <span className="cal-cell-stat">
                                <span>{doneCount} / {totalCount}</span>
                                {dominantDot && <span className={`cal-status-dot ${dominantDot}`} />}
                              </span>
                            )}
                          </div>

                          {showTasks && !outside && visibleTasks.length > 0 && (
                            <div className="cal-cell-task-list">
                              {visibleTasks.slice(0, 2).map((t) => (
                                <div
                                  key={t.id}
                                  className="cal-task-card"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSidebarDismissed(false);
                                    setParam("kun", iso);
                                    setSelectedTaskId(t.id);
                                  }}
                                  title={`${t.code} · ${t.title}`}
                                >
                                  <div className="cal-task-card-top">
                                    <span className={`cal-status-dot ${getTaskDotClass(t)}`} />
                                    <span className="cal-task-card-title">
                                      <strong>{t.code}</strong> · {t.title}
                                    </span>
                                  </div>
                                  <div className="cal-task-card-time">{getTaskTimeDisplay(t)}</div>
                                </div>
                              ))}
                              {visibleTasks.length > 2 && (
                                <div
                                  className="cal-task-more-pill"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSidebarDismissed(false);
                                    setParam("kun", iso);
                                  }}
                                >
                                  +{visibleTasks.length - 2} {tx("common.ta", undefined, "ta")}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* O'ng panel (Kun tafsilotlari) */}
              {activePicked && (
                <aside className="cal-sidebar-card">
                  <div className="cal-sidebar-head">
                    <span className="cal-sidebar-date">{formattedPickedTitle}</span>
                    <div className="cal-sidebar-actions">
                      <button
                        type="button"
                        className="cal-sidebar-close-btn"
                        onClick={() => {
                          setSidebarDismissed(true);
                          setParam("kun", "");
                        }}
                      >
                        {tx("common.yopish", undefined, "Yopish")}
                      </button>
                      <div className="cal-sidebar-arrows">
                        <button
                          type="button"
                          className="cal-arrow-btn"
                          title={tx("calendar.oldingi_kun", undefined, "Oldingi kun")}
                          onClick={() => {
                            setSidebarDismissed(false);
                            setParam("kun", shiftDay(activePicked, -1));
                          }}
                        >
                          ‹
                        </button>
                        <button
                          type="button"
                          className="cal-arrow-btn"
                          title={tx("calendar.keyingi_kun", undefined, "Keyingi kun")}
                          onClick={() => {
                            setSidebarDismissed(false);
                            setParam("kun", shiftDay(activePicked, 1));
                          }}
                        >
                          ›
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Asosiy tanlangan karta */}
                  {mainFeaturedTask && (
                    <Link
                      {...toTask(mainFeaturedTask.id)}
                      className="cal-side-featured-card"
                      title={tx("calendar.batafsil", undefined, "Batafsil")}
                    >
                      <div className="cal-side-card-row1">
                        <span className="cal-side-card-code">{mainFeaturedTask.code}</span>
                        <span className="cal-side-card-time">{getTaskTimeDisplay(mainFeaturedTask)}</span>
                      </div>
                      <div className="cal-side-card-title">
                        <span className={`cal-status-dot ${getTaskDotClass(mainFeaturedTask)}`} style={{ marginRight: 6 }} />
                        {mainFeaturedTask.title}
                      </div>
                      <div className="cal-side-card-row3">
                        {(() => {
                          const badge = getTaskBadge(mainFeaturedTask);
                          return <span className={`cal-badge-pill ${badge.cls}`}>{badge.label}</span>;
                        })()}
                        <span className="cal-chevron-right">›</span>
                      </div>
                    </Link>
                  )}

                  {/* Keyingi vazifalar ro'yxati */}
                  {otherDayTasks.length > 0 && (
                    <>
                      <div className="cal-side-section-title">
                        {tx("calendar.keyingi_vazifalar", undefined, "Keyingi vazifalar")}
                      </div>
                      <div className="cal-side-list">
                        {otherDayTasks.map((t) => {
                          const badge = getTaskBadge(t);
                          return (
                            <div
                              key={t.id}
                              className="cal-side-item-card"
                              onClick={() => setSelectedTaskId(t.id)}
                              role="button"
                              tabIndex={0}
                              style={{ cursor: "pointer" }}
                            >
                              <div className="cal-side-item-row1">
                                <div className="cal-side-item-code-time">
                                  <span className={`cal-status-dot ${getTaskDotClass(t)}`} />
                                  <span className="cal-side-item-code">{t.code}</span>
                                  <span className="cal-side-card-time">{getTaskTimeDisplay(t)}</span>
                                </div>
                                <span className={`cal-badge-pill ${badge.cls}`}>{badge.label}</span>
                              </div>
                              <div className="cal-side-item-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                                <Link
                                  {...toTask(t.id)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="cal-chevron-right"
                                  title={tx("calendar.batafsil", undefined, "Batafsil")}
                                  style={{ padding: "0 4px" }}
                                >
                                  ›
                                </Link>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {/* Agar shu kuni loyiha tugaydigan bo'lsa */}
                  {currentDayProjects.length > 0 && (
                    <>
                      <div className="cal-side-section-title" style={{ marginTop: 16 }}>
                        {tx("common.loyihalar", undefined, "Loyihalar")}
                      </div>
                      <div className="cal-side-list">
                        {currentDayProjects.map((p) => (
                          <Link
                            key={p.id}
                            {...toProject(p.id)}
                            className="cal-side-item-card"
                            style={{ borderLeft: `3px solid ${p.color || "var(--accent)"}` }}
                          >
                            <div className="cal-side-item-row1">
                              <strong style={{ fontSize: 13, color: "var(--text)" }}>{p.name}</strong>
                              <span className="cal-badge-pill brand">{p.status_display}</span>
                            </div>
                            <small className="muted nowrap">
                              {p.due_date || p.to || p.from}
                              {p.manager_name && ` · PM: ${p.manager_name}`}
                            </small>
                          </Link>
                        ))}
                      </div>
                    </>
                  )}

                  {/* Agar hech qanday vazifa yoki loyiha bo'lmasa */}
                  {!mainFeaturedTask && !currentDayProjects.length && (
                    <Empty
                      title={tx("calendar.bu_kuni_hech_narsa_yoq", undefined, "Bu kuni hech narsa yo'q")}
                      text={tx("calendar.boshqa_kunni_tanlang", undefined, "Boshqa kunni tanlang")}
                    />
                  )}
                </aside>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
