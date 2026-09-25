import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import type { Activity, Project, Task, UserBrief } from "@/api/types";
import Timeline from "@/components/Timeline";
import AddMemberBox from "@/components/AddMemberBox";
import { Avatar, Card, Empty, Priority, Progress, Stat, StatusBadge, fmtDate, fmtDateTime, formatMemberRole } from "@/components/ui";

import { toDeveloper, toProject, toTask } from "@/nav";
import { tx } from "@/i18n";
import { AnchorButton, Button, LinkButton } from "@/components/Button";

// `onChange` — "+ A'zo qo'shish" muvaffaqiyatli bo'lganda ota komponentga
// loyihani qayta yuklashni buyuradi (a'zolar soni, `project.members` yangi
// bo'lishi uchun).
export default function Overview({ project, onChange }: { project: Project; onChange: () => void }) {
  const { meta } = useAuth();
  const [feed, setFeed] = useState<Activity[]>([]);
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [relatedOrders, setRelatedOrders] = useState<any[]>([]);
  // Ochilgan mutaxassislik: «Frontend dasturchi» bosilsa - kimligi ko'rinsin.
  const [openSpec, setOpenSpec] = useState<string | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [addMemberVersion, setAddMemberVersion] = useState(0);

  /**
   * Jamoa a'zolari mutaxassislik bo'yicha guruhlangan.
   *
   * Qo'shimcha so'rov YO'Q: `project.members` loyiha bilan birga keladi
   * (`ProjectDetailSerializer.get_members`), shuning uchun ro'yxat shu
   * yerda yig'iladi. Aks holda har bir mutaxassislik uchun alohida
   * so'rov ketardi.
   */
  const bySpecialty = useMemo(() => {
    const map = new Map<string, UserBrief[]>();
    for (const m of project.members || []) {
      const key = m.user.specialty || "";
      const list = map.get(key);
      if (list) list.push(m.user);
      else map.set(key, [m.user]);
    }
    return map;
  }, [project.members]);

  useEffect(() => {
    // Ikkovi ham yordamchi ro'yxat: kelmasa sahifa baribir ishlaydi,
    // shuning uchun xato bo'sh ro'yxatga aylanadi va konsolga chiqadi.
    let alive = true;
    void api.get<{ results?: Activity[] }>("/activity/", { project: project.id, page_size: 12 })
      .then((d) => { if (alive) setFeed(d.results || []); })
      .catch(() => { if (alive) setFeed([]); });
    void api.get<{ results?: Task[] }>("/tasks/", { project: project.id, assignee: "me", open: "1", page_size: 6 })
      .then((d) => { if (alive) setMyTasks(d.results || []); })
      .catch(() => { if (alive) setMyTasks([]); });
    void api.get<{ results?: any[] }>("/orders/", { project: project.id, page_size: 5 })
      .then((d) => { if (alive) setRelatedOrders(d.results || []); })
      .catch(() => { if (alive) setRelatedOrders([]); });
    return () => { alive = false; };
  }, [project.id]);

  const tasksUrl = (status: string) =>
    toProject(project.id, "vazifalar", `status=${status}`);

  const totalTasks = (project.open_tasks || 0) + (project.done_tasks || 0);
  const statusToneClass = project.status === "ACTIVE" ? "badge-info"
    : project.status === "DONE" ? "badge-ok"
    : project.status === "PAUSED" ? "badge-warn" : "";

  return (
    <div className="split">
      <div>
        <Card title={tx("project_overview.loyiha_malumotlari", undefined, "Loyiha ma'lumotlari")}>
          <div className="grid grid-2" style={{ gap: "16px 28px" }}>
            <div>
              <div className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 4 }}>
                {tx("projects.ustun_loyiha", undefined, "Loyiha nomi")}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{project.name}</div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 4 }}>
                {tx("projects.ustun_holat", undefined, "Holati")}
              </div>
              <span className={`badge ${statusToneClass}`}>
                <span className="badge-dot" aria-hidden="true" />
                {project.status_display}
              </span>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 4 }}>
                {tx("common.menejer", undefined, "Mas'ul shaxs")}
              </div>
              {project.manager ? (
                <div className="row middle" style={{ gap: 8 }}>
                  <Avatar user={project.manager} size="sm" />
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{project.manager.full_name}</span>
                </div>
              ) : (
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {tx("projects.menejer_tayinlanmagan", undefined, "Tayinlanmagan")}
                </span>
              )}
            </div>
            <div>
              <div className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 4 }}>
                {tx("project_overview.muddat")}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{fmtDate(project.due_date)}</div>
            </div>
            <div style={{ gridColumn: "1 / 3" }}>
              <div className="row middle between" style={{ marginBottom: 6 }}>
                <span className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".4px" }}>
                  {tx("projects.ustun_jarayon", undefined, "Jarayon")}
                </span>
                <strong style={{ fontSize: 12.5, color: "var(--accent)" }}>{project.progress}%</strong>
              </div>
              <Progress value={project.progress} />
            </div>
            {project.description && (
              <div style={{ gridColumn: "1 / 3" }}>
                <div className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 4 }}>
                  {tx("common.tavsif", undefined, "Tavsif")}
                </div>
                <p className="pre-wrap" style={{ margin: 0, fontSize: 13.5 }}>{project.description}</p>
                <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
                  {project.repo_url && <AnchorButton size="sm" href={project.repo_url} target="_blank" rel="noreferrer">{tx("project_overview.repozitoriy")}</AnchorButton>}
                  {project.docs_url && <AnchorButton size="sm" href={project.docs_url} target="_blank" rel="noreferrer">{tx("common.hujjatlar")}</AnchorButton>}
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Tezkor statistika - har katak o'z filtri bilan "Vazifalar" tabiga
            o'tadi, filtr manzilda emas, sahifa holatida uzatiladi. */}
        <div className="grid grid-4 mb">
          <Stat value={totalTasks} label={tx("project_overview.jami_vazifalar", undefined, "Jami vazifalar")} tone="accent"
                to={toProject(project.id, "vazifalar")} />
          <Stat value={project.open_tasks} label={tx("common.ochiq_vazifa", undefined, "Ochiq")} tone="warn"
                to={toProject(project.id, "vazifalar", "open=1")} />
          <Stat value={project.done_tasks} label={tx("common.bajarilgan_2", undefined, "Yakunlangan")} tone="ok"
                to={tasksUrl("DONE")} />
          <Stat value={project.overdue_tasks} label={tx("project_overview.kechikkan", undefined, "Kechikkan")} tone="danger"
                to={toProject(project.id, "vazifalar", "overdue=1")} />
        </div>

        {myTasks.length > 0 && (
          <Card title={tx("project_overview.sizning_ochiq_vazifalaringiz")} padded={false}>
            <div className="table-wrap"><table className="table">
              <tbody>
                {myTasks.map((t) => (
                  <tr key={t.id}>
                    <td><Link {...toTask(t.id)}>{t.title}</Link></td>
                    <td><StatusBadge task={t} /></td>
                    <td className="right"><Priority task={t} /></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </Card>
        )}

        {relatedOrders.length > 0 && (
          <Card
            title={tx("projects.bogliq_buyurtmalar", undefined, "Bog'liq buyurtmalar")}
            padded={false}
            action={
              <LinkButton variant="ghost" size="sm" to="/buyurtmalar">
                {tx("common.barchasi", undefined, "Barchasi")}
              </LinkButton>
            }
          >
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  {relatedOrders.map((o) => (
                    <tr key={o.id}>
                      <td style={{ fontWeight: 600 }}>{o.system_name}</td>
                      <td style={{ maxWidth: 260, fontSize: 13, color: "var(--muted)" }}>
                        <span className="nowrap" style={{ overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>
                          {o.requested_change}
                        </span>
                      </td>
                      <td>
                        <span className="badge">{o.status_display || o.status}</span>
                      </td>
                      <td className="right nowrap" style={{ fontSize: 12, color: "var(--muted)" }}>
                        {o.due_date ? fmtDate(o.due_date) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <Card title={tx("project_overview.songgi_harakatlar")}>
          <Timeline items={feed} showProject={false} />
        </Card>
      </div>

      <div>
        <Card title={tx("project_overview.loyiha_azolari", undefined, "Loyiha a'zolari")} padded={false}
              badge={<span className="badge">{(project.members || []).length}</span>}
              action={
                <div className="row" style={{ gap: 6 }}>
                  {project.access.can_manage && (
                    <Button size="sm" variant="ghost" onClick={() => setShowAddMember((v) => !v)}>
                      + {tx("add_member_box.azo_qoshish", undefined, "A'zo qo'shish")}
                    </Button>
                  )}
                  <LinkButton size="sm" variant="ghost" {...toProject(project.id, "jamoa")}>{tx("project_overview.boshqarish")}</LinkButton>
                </div>
              }>
          {showAddMember && project.access.can_manage && (
            <div style={{ padding: 16, borderBottom: "1px solid var(--border)" }}>
              <AddMemberBox
                projectId={project.id}
                roles={(meta?.project_role || [])
                  .filter((r) => r.value !== "MANAGER" || project.access.can_grant_manager)}
                defaultRole="DEVELOPER"
                refreshKey={addMemberVersion}
                onChange={() => { setAddMemberVersion((n) => n + 1); onChange(); }}
              />
            </div>
          )}
          <div className="card-list">
            {(project.members || []).map((m) => (
              <div className="card-body tight row" key={m.id}>
                <Avatar user={m.user} />
                <div style={{ minWidth: 0 }}>
                  <Link {...toDeveloper(project.id, m.user.id)}>{m.user.full_name}</Link>
                  <br />
                  <small className="muted">{formatMemberRole(m.user.specialty_display, m.role_display)}</small>

                </div>
                <span className="spacer" />
                {m.user.id === project.manager?.id && (
                  <span className="badge" style={{ fontWeight: 600 }}>
                    {tx("project_overview.loyiha_rahbari", undefined, "Loyiha rahbari")}
                  </span>
                )}
              </div>
            ))}
            {!(project.members || []).length && <Empty title={tx("project_overview.jamoa_bosh")} />}
          </div>
        </Card>

        <Card title={tx("project_overview.jamoa_tarkibi")}>
          {project.team_composition?.length ? (
            <div className="stack">
              {project.team_composition.map((t) => {
                const people = bySpecialty.get(t.value) || [];
                const open = openSpec === t.value;
                return (
                  <div key={t.value}>
                    {/* Qator bosiladi: «Frontend dasturchi 1» degani kim
                        ekanini aytmaydi - ochilganda ism-familiya chiqadi.
                        Ro'yxat bo'sh bo'lsa qator oddiy matn bo'lib qoladi
                        (bosiladigandek ko'rinib, hech narsa ochmasin). */}
                    {people.length ? (
                      <button type="button" className={`spec-row ${open ? "open" : ""}`}
                              aria-expanded={open}
                              onClick={() => setOpenSpec(open ? null : t.value)}>
                        <span>{t.label}</span>
                        <span className="spacer" />
                        <span className="badge">{t.count}</span>
                        <span className="spec-caret" aria-hidden="true">{open ? "▾" : "▸"}</span>
                      </button>
                    ) : (
                      <div className="row spec-row static">
                        <span>{t.label}</span>
                        <span className="spacer" />
                        <span className="badge">{t.count}</span>
                      </div>
                    )}

                    {open && (
                      <div className="spec-people">
                        {people.map((u) => (
                          <Link className="spec-person" key={u.id} {...toDeveloper(project.id, u.id)}>
                            <Avatar user={u} size="sm" />
                            <span className="spec-person-text">
                              <strong>{u.full_name}</strong>
                            </span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : <p className="muted">{tx("project_overview.malumot_yoq")}</p>}
        </Card>

        <Card title={tx("project_overview.malumotlar")}>
          <ul className="list-plain" style={{ fontSize: 13 }}>
            <li><span className="muted">{tx("common.menejer")}</span> {project.manager?.full_name || "—"}</li>
            <li><span className="muted">{tx("project_overview.muddat")}</span> {fmtDate(project.due_date)}</li>
            {project.updated_at && (
              <li>
                <span className="muted">{tx("projects.tahrirlandi", undefined, "Tahrirlandi")}</span>{" "}
                {fmtDateTime(project.updated_at)}
                {project.updated_by && <strong> ({project.updated_by.full_name})</strong>}
              </li>
            )}
            {project.access.can_manage && (
              <li><span className="muted">{tx("project_overview.qoshilish_kodi")}</span> <code>{project.join_code}</code></li>
            )}
          </ul>
        </Card>
      </div>
    </div>
  );
}
