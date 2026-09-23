/**
 * TeamFlow — Zamonaviy Professional Taqvim (Calendar) sahifasi.
 *
 * Professional SaaS dizayn tizimi bo'yicha:
 * - Oy / Hafta / Kun rejimlari
 * - Ranglar qoidasi:
 *   Purple = Loyiha (#8b5cf6)
 *   Blue = Vazifa (#3562ff)
 *   Orange = Muddat / Kechikkan (#f59e0b / #ef4444)
 *   Green = Yakunlangan (#10b981)
 * - Toza grid, yumshoq chegaralar, ixcham event kartalari
 * - Event bosilganda toza detail panel
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import type { CalendarMonth, CalendarProject, CalendarTask } from "@/api/types";
import { Avatar, Card, EmptyState, ErrorMsg, PageHeader, Skeleton, fmtDate } from "@/components/ui";
import { toProject, toTask, useNavParams, type NavTarget } from "@/nav";
import { tx } from "@/i18n";
import { Button, ButtonGroup } from "@/components/Button";

const WEEKDAYS = ["dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba", "yakshanba"];
const MONTHS = [
  tx("calendar.yanvar"),
  tx("calendar.fevral"),
  tx("calendar.mart"),
  tx("calendar.aprel"),
  tx("calendar.may"),
  tx("calendar.iyun"),
  tx("calendar.iyul"),
  tx("calendar.avgust"),
  tx("calendar.sentabr"),
  tx("calendar.oktabr"),
  tx("calendar.noyabr"),
  tx("calendar.dekabr"),
];

const dayNo = (iso: string) => {
  if (!iso) return 0;
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
};

const isoOf = (n: number) => new Date(n * 86400000).toISOString().slice(0, 10);
const weekday = (n: number) => (new Date(n * 86400000).getUTCDay() + 6) % 7;
const dayOfMonth = (n: number) => new Date(n * 86400000).getUTCDate();

function shiftMonth(month: string, by: number) {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + by;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

interface EventBar {
  key: string;
  kind: "project" | "task";
  status?: string;
  from: number;
  to: number;
  label: string;
  color: string;
  overdue: boolean;
  done?: boolean;
  openEnded?: boolean;
  startsHere: boolean;
  endsHere: boolean;
  target: NavTarget;
  people?: string;
  timeStr?: string;
}

const LANE_LIMIT = 3;

function assignLanes(bars: EventBar[]) {
  const lanes: EventBar[][] = [];
  const placed: { bar: EventBar; lane: number }[] = [];
  for (const bar of bars) {
    let lane = lanes.findIndex((row) => row.every((b) => b.to < bar.from || b.from > bar.to));
    if (lane === -1) {
      lanes.push([]);
      lane = lanes.length - 1;
    }
    lanes[lane].push(bar);
    placed.push({ bar, lane });
  }
  return { placed, laneCount: lanes.length };
}

export default function CalendarPage() {
  const [params, setParams] = useNavParams();
  const [data, setData] = useState<CalendarMonth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showTasks, setShowTasks] = useState(true);
  const [viewMode, setViewMode] = useState<"month" | "week" | "day">("month");

  const month = params.get("oy") || "";
  const picked = params.get("kun") || "";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.get<CalendarMonth>("/projects/calendar/", { month }));
    } catch {
      setError(tx("calendar.taqvimni_yuklab_bolmadi", undefined, "Taqvim ma'lumotlarini yuklab bo'lmadi"));
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  function set(k: string, v: string) {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next);
  }

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

  const bars = useMemo<EventBar[]>(() => {
    if (!data) return [];
    // Purple = project (#8b5cf6)
    const fromProjects: EventBar[] = data.projects
      .filter((p: CalendarProject) => p.from && p.to)
      .map((p: CalendarProject) => ({
        key: `p${p.id}`,
        kind: "project",
        from: dayNo(p.from),
        to: dayNo(p.to),
        label: p.name,
        color: "#8b5cf6",
        overdue: p.overdue,
        openEnded: p.open_ended,
        startsHere: p.starts_here,
        endsHere: p.ends_here,
        target: toProject(p.id),
      }));

    if (!showTasks) return fromProjects;

    // Blue = task (#3562ff), Green = completed (#10b981), Orange = overdue (#f59e0b)
    const fromTasks: EventBar[] = data.tasks
      .filter((t: CalendarTask) => t.from && t.to)
      .map((t: CalendarTask) => {
        let taskColor = "#3562ff";
        if (t.done) taskColor = "#10b981";
        else if (t.overdue) taskColor = "#f59e0b";

        return {
          key: `t${t.id}`,
          kind: "task",
          from: dayNo(t.from),
          to: dayNo(t.to),
          label: t.title,
          color: taskColor,
          overdue: t.overdue,
          done: t.done,
          status: t.status,
          startsHere: t.starts_here,
          endsHere: t.ends_here,
          target: toTask(t.id),
          people: t.assignees.map((u) => u.full_name).join(", ") || "",
        };
      });

    return [...fromProjects, ...fromTasks];
  }, [data, showTasks]);

  const byDay = useMemo(() => {
    const map: Record<string, CalendarMonth["days"][number]> = {};
    for (const d of data?.days || []) map[d.date] = d;
    return map;
  }, [data]);

  const title = data
    ? `${MONTHS[Number(data.month.split("-")[1]) - 1]} ${data.month.split("-")[0]}`
    : tx("calendar.taqvim", undefined, "Taqvim");

  const pickedDay = picked ? dayNo(picked) : null;
  const dayProjects = (data?.projects || []).filter(
    (p) => pickedDay !== null && p.from && p.to && dayNo(p.from) <= pickedDay && pickedDay <= dayNo(p.to)
  );
  const dayTasks = (data?.tasks || []).filter(
    (t) => pickedDay !== null && t.from && t.to && dayNo(t.from) <= pickedDay && pickedDay <= dayNo(t.to)
  );

  return (
    <div className="content">
      <PageHeader
        title={tx("calendar.taqvim", undefined, "Taqvim")}
        subtitle={tx("calendar.sahifa_izohi", undefined, "Rejalashtirilgan ishlar, loyihalar va vazifalar muddati")}
        action={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Month / Week / Day Rejim tugmalari */}
            <ButtonGroup>
              <Button size="xs" active={viewMode === "month"} onClick={() => setViewMode("month")}>
                {tx("calendar.oy", undefined, "Oy")}
              </Button>
              <Button size="xs" active={viewMode === "week"} onClick={() => setViewMode("week")}>
                {tx("calendar.hafta", undefined, "Hafta")}
              </Button>
              <Button
                size="xs" active={viewMode === "day"}
                onClick={() => {
                  setViewMode("day");
                  if (!picked && data) set("kun", data.today);
                }}
              >
                {tx("calendar.kun", undefined, "Kun")}
              </Button>
            </ButtonGroup>

            {/* Oldingi / Bugun / Keyingi navigatsiyasi */}
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Button iconOnly aria-label={tx("calendar.oldingi_oy", undefined, "Oldingi oy")}
                size="sm"
                title={tx("calendar.oldingi_oy", undefined, "Oldingi oy")}
                onClick={() => data && set("oy", shiftMonth(data.month, -1))}
              >
                ‹
              </Button>
              <Button
                variant="ghost" size="sm"
                title={tx("calendar.joriy_oy", undefined, "Joriy oy")}
                onClick={() => set("oy", "")}
              >
                {tx("common.bugun", undefined, "Bugun")}
              </Button>
              <Button iconOnly aria-label={tx("calendar.keyingi_oy", undefined, "Keyingi oy")}
                size="sm"
                title={tx("calendar.keyingi_oy", undefined, "Keyingi oy")}
                onClick={() => data && set("oy", shiftMonth(data.month, 1))}
              >
                ›
              </Button>
            </div>
          </div>
        }
      />

      <ErrorMsg error={error} />

      {!data && loading ? (
        <div style={{ padding: 40, display: "flex", flexDirection: "column", gap: 16 }}>
          <Skeleton height={42} width="100%" />
          <Skeleton height={480} width="100%" borderRadius={14} />
        </div>
      ) : !data ? null : (
        <div className={`cal-layout ${picked ? "with-day" : ""}`}>
          <div className="card" style={{ borderRadius: 16, overflow: "hidden", border: "1px solid var(--border)" }}>
            <div
              className="cal-bar-top"
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                background: "var(--surface)",
              }}
            >
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--text)" }}>{title}</h3>
              <span className="badge">{data.total}</span>
              {showTasks && !!data.task_total && (
                <span className="badge badge-info">{data.task_total} {tx("calendar.vazifa", undefined, "vazifa")}</span>
              )}

              <span className="spacer" />

              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={showTasks}
                  onChange={() => setShowTasks((v) => !v)}
                />
                {tx("common.vazifalar", undefined, "Vazifalar")}
              </label>

              {/* Aniq, tartibli ranglar legendasi */}
              <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 12, color: "var(--muted)" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#8b5cf6" }} />
                  {tx("common.loyiha", undefined, "Loyiha")}
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#3562ff" }} />
                  {tx("common.vazifa", undefined, "Vazifa")}
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f59e0b" }} />
                  {tx("calendar.muddat_muddati_otgan", undefined, "Kechikkan")}
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981" }} />
                  {tx("common.bajarildi", undefined, "Yakunlangan")}
                </span>
              </div>
            </div>

            <div className="cal">
              <div className="cal-head">
                {WEEKDAYS.map((w) => (
                  <div key={w} style={{ textTransform: "capitalize" }}>
                    {w}
                  </div>
                ))}
              </div>

              {weeks.map((week) => {
                const wFrom = week[0];
                const wTo = week[6];
                const inWeek = bars
                  .filter((b) => b.to >= wFrom && b.from <= wTo)
                  .map((b) => ({ ...b, from: Math.max(b.from, wFrom), to: Math.min(b.to, wTo) }));
                const { placed, laneCount } = assignLanes(inWeek);

                const visible = placed.filter((x) => x.lane < LANE_LIMIT);
                const moreByDay = new Map<number, number>();
                for (const { bar, lane } of placed) {
                  if (lane < LANE_LIMIT) continue;
                  for (let d = bar.from; d <= bar.to; d += 1) {
                    moreByDay.set(d, (moreByDay.get(d) || 0) + 1);
                  }
                }
                const laneRows = Math.max(Math.min(laneCount, LANE_LIMIT), 1);
                const rows = laneRows + (moreByDay.size ? 1 : 0);

                return (
                  <div
                    className="cal-week"
                    key={wFrom}
                    style={{ gridTemplateRows: `auto repeat(${rows}, 22px)` }}
                  >
                    {week.map((d, i) => {
                      const iso = isoOf(d);
                      const outside = iso < data.first_day || iso > data.last_day;
                      return (
                        <div
                          key={`c${d}`}
                          className={`cal-col ${outside ? "out" : ""}${
                            iso === data.today ? " today" : ""
                          }${iso === picked ? " picked" : ""}`}
                          style={{ gridColumn: i + 1 }}
                          onClick={() => set("kun", iso === picked ? "" : iso)}
                        />
                      );
                    })}

                    {week.map((d, i) => {
                      const iso = isoOf(d);
                      const outside = iso < data.first_day || iso > data.last_day;
                      const day = byDay[iso];
                      const tasksToday = day ? day.todo + day.in_progress + day.done : 0;
                      return (
                        <div
                          className={`cal-daynum ${outside ? "out" : ""}${
                            iso === data.today ? " today" : ""
                          }`}
                          key={`n${d}`}
                          style={{ gridColumn: i + 1, gridRow: 1 }}
                        >
                          <span className="cal-d">{dayOfMonth(d)}</span>
                          <span className="spacer" />
                          {!outside && showTasks && !!tasksToday && (
                            <span
                              className="cal-mini"
                              title={`Nazoratda: ${day.todo} · Jarayonda: ${day.in_progress} · Bajarildi: ${day.done}`}
                            >
                              <b className="st-todo">{day.todo}</b>
                              <i>/</i>
                              <b className="st-prog">{day.in_progress}</b>
                              <i>/</i>
                              <b className="st-done">{day.done}</b>
                            </span>
                          )}
                        </div>
                      );
                    })}

                    {visible.map(({ bar, lane }) => (
                      <Link
                        key={bar.key + bar.from}
                        {...bar.target}
                        title={
                          bar.kind === "task"
                            ? `${bar.label} ${bar.people ? `· ${bar.people}` : ""}`
                            : `${bar.label}${bar.openEnded ? " (Muddat belgilanmagan)" : ""}`
                        }
                        className={`cal-bar ${bar.kind}${bar.status ? ` cal-st-${bar.status}` : ""}${
                          bar.overdue ? " overdue" : ""
                        }${bar.done ? " done" : ""}${bar.startsHere ? " starts" : ""}${
                          bar.endsHere ? " ends" : ""
                        }`}
                        style={{
                          gridColumn: `${weekday(bar.from) + 1} / ${weekday(bar.to) + 2}`,
                          gridRow: lane + 2,
                          background: bar.color,
                          color: "#ffffff",
                          borderRadius: 4,
                          fontWeight: 600,
                          fontSize: 11.5,
                          padding: "2px 6px",
                          display: "flex",
                          alignItems: "center",
                          overflow: "hidden",
                          whiteSpace: "nowrap",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {bar.label}
                        {bar.people && <span className="cal-who" style={{ opacity: 0.85, fontWeight: 400 }}> · {bar.people}</span>}
                      </Link>
                    ))}

                    {week.map((d, i) => {
                      const extra = moreByDay.get(d) || 0;
                      if (!extra) return null;
                      const iso = isoOf(d);
                      return (
                        <button
                          type="button"
                          key={`m${d}`}
                          className="cal-more"
                          style={{ gridColumn: i + 1, gridRow: laneRows + 2 }}
                          title={tx("calendar.yana_nechta_ochish", { n: extra })}
                          onClick={() => set("kun", iso)}
                        >
                          +{extra} {tx("common.ta", undefined, "ta")}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tanlangan kun Tafsilotlari Paneli (Detail Panel) */}
          {picked && (
            <aside className="cal-day">
              <Card
                title={`${dayOfMonth(dayNo(picked))}-${MONTHS[
                  Number(picked.split("-")[1]) - 1
                ]?.toLowerCase()} ${picked.split("-")[0]}`}
                badge={
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => set("kun", "")}
                  >
                    ✕ {tx("common.yopish", undefined, "Yopish")}
                  </Button>
                }
                padded={false}
              >
                {!dayProjects.length && !dayTasks.length ? (
                  <EmptyState
                    icon="📅"
                    title={tx("calendar.bu_kuni_hech_narsa_yoq", undefined, "Bu kunda reja yo'q")}
                    message={tx("calendar.boshqa_kunni_tanlang", undefined, "Boshqa kunni tanlab ko'ring.")}
                  />
                ) : (
                  <div className="card-list">
                    {dayProjects.map((p) => (
                      <div className="card-body tight row wrap" key={`dp${p.id}`} style={{ padding: "12px 16px" }}>
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: "#8b5cf6",
                            flexShrink: 0,
                          }}
                        />
                        <Link {...toProject(p.id)} style={{ fontWeight: 650, color: "var(--text)" }}>
                          {p.name}
                        </Link>
                        <span className="badge">{p.status_display}</span>
                        {p.overdue && <span className="badge badge-danger">{tx("calendar.kechikkan", undefined, "Kechikkan")}</span>}
                        <span className="spacer" />
                        <small className="muted nowrap" style={{ fontSize: 11.5 }}>
                          {fmtDate(p.due_date || p.start_date)}
                          {p.manager_name && ` · PM: ${p.manager_name}`}
                        </small>
                      </div>
                    ))}
                    {showTasks &&
                      dayTasks.map((t) => (
                        <div className="card-body tight row wrap" key={`dt${t.id}`} style={{ padding: "12px 16px" }}>
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              background: t.done ? "#10b981" : t.overdue ? "#f59e0b" : "#3562ff",
                              flexShrink: 0,
                            }}
                          />
                          <Link {...toTask(t.id)} style={{ fontWeight: 600, color: "var(--text)" }}>
                            {t.title}
                          </Link>
                          <span className="badge">{t.status_display}</span>
                          {t.overdue && <span className="badge badge-danger">{tx("calendar.kechikkan", undefined, "Kechikkan")}</span>}
                          <span className="spacer" />
                          {t.assignees.length ? (
                            <span className="row" style={{ gap: 6 }}>
                              {t.assignees.map((u) => (
                                <span className="row" style={{ gap: 4 }} key={u.id}>
                                  <Avatar user={u} size="sm" showHoverCard={false} />
                                  <small style={{ fontSize: 11.5 }}>{u.full_name}</small>
                                </span>
                              ))}
                            </span>
                          ) : (
                            <small className="muted">{tx("calendar.biriktirilmagan", undefined, "Biriktirilmagan")}</small>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </Card>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
