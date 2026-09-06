import { Link } from "react-router-dom";
import { useFetch } from "@/api/useFetch";
import type { OnboardingData, Project } from "@/api/types";
import Timeline from "@/components/Timeline";
import { Avatar, Card, ErrorMsg, Loading, Priority, Progress, StatusBadge, fmtDate, formatMemberRole, timeAgo } from "@/components/ui";
import { IconExternalLink, IconFile } from "@/components/icons";
import { toDeveloper, toProject, toTask } from "@/nav";
import { tx } from "@/i18n";

type BriefSectionDef = {
  key: keyof NonNullable<OnboardingData["brief"]>;
  labelKey: string;
  icon: string;
  boxClass?: string;
  isTech?: boolean;
};

const BRIEF_CONFIG: BriefSectionDef[] = [
  { key: "goal", labelKey: "project_onboarding.loyiha_maqsadi", icon: "🎯", boxClass: "is-goal" },
  { key: "tech_stack", labelKey: "project_onboarding.texnologiyalar", icon: "⚡", boxClass: "is-tech", isTech: true },
  { key: "architecture", labelKey: "project_onboarding.arxitektura", icon: "🏗️", boxClass: "is-arch" },
  { key: "pitfalls", labelKey: "project_onboarding.ehtiyot_boling", icon: "⚠️", boxClass: "is-pitfall" },
  { key: "contacts", labelKey: "project_onboarding.kim_nima_boyicha_javob_beradi", icon: "👥", boxClass: "is-contacts" },
];

export default function Onboarding({ project }: { project: Project }) {
  const { data: d, error } = useFetch<OnboardingData>(
    "/activity/onboarding/", { project: project.id });

  if (error) return <ErrorMsg error={error} />;
  if (!d) return <Loading text={tx("project_onboarding.kontekst_yigilmoqda")} />;

  return (
    <>
      <div className="split">
        <div>
          <Card title={tx("project_onboarding.1_loyiha_nima_qiladi")}>
            <p className="pre-wrap" style={{ lineHeight: 1.6, fontSize: 13.5 }}>
              {d.project.description || tx("common.tavsif_kiritilmagan")}
            </p>
            <div className="row mb" style={{ alignItems: "center", gap: 12, marginTop: 12 }}>
              <div style={{ flex: 1, maxWidth: 300 }}><Progress value={d.project.progress} /></div>
              <span className="badge badge-info">{d.project.progress}{tx("project_onboarding.bajarildi")}</span>
            </div>
            <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
              {d.project.repo_url && (
                <a className="btn btn-sm row" style={{ gap: 6 }} href={d.project.repo_url} target="_blank" rel="noreferrer">
                  <IconExternalLink size={14} />
                  <span>{tx("project_onboarding.repozitoriy")}</span>
                </a>
              )}
              {d.project.docs_url && (
                <a className="btn btn-sm row" style={{ gap: 6 }} href={d.project.docs_url} target="_blank" rel="noreferrer">
                  <IconFile size={14} />
                  <span>{tx("common.hujjatlar")}</span>
                </a>
              )}
              {d.project.manager && (
                <span className="chip row" style={{ gap: 6 }}>
                  <Avatar user={d.project.manager} size="sm" />
                  <span>{tx("common.menejer")}: <strong>{d.project.manager.full_name}</strong></span>
                </span>
              )}
            </div>
          </Card>

          <Card title={tx("project_onboarding.2_loyiha_arxitekturasi")}
                badge={d.brief && <span className="badge">{d.brief.filled_ratio}{tx("project_onboarding.toldirilgan")}</span>}
                action={project.access.can_manage &&
                  <Link className="btn btn-sm" {...toProject(project.id, "brif")}>{tx("common.tahrirlash")}</Link>}>
            {d.brief ? (
              <div className="onboarding-brief-stack">
                {BRIEF_CONFIG.map((section) => {
                  const value = d.brief?.[section.key];
                  if (!value || typeof value !== "string" || !value.trim()) return null;
                  return (
                    <div key={String(section.key)} className={`onboarding-section-box ${section.boxClass || ""}`}>
                      <div className="onboarding-section-title">
                        <span className="onboarding-section-icon">{section.icon}</span>
                        <span>{tx(section.labelKey)}</span>
                      </div>
                      {section.isTech && value.includes(",") ? (
                        <div className="onboarding-tech-chips">
                          {value.split(",").map((tech, idx) => {
                            const clean = tech.trim();
                            if (!clean) return null;
                            return <span key={idx} className="onboarding-tech-chip">{clean}</span>;
                          })}
                        </div>
                      ) : (
                        <div className="onboarding-section-body">{value}</div>
                      )}
                    </div>
                  );
                })}
                {d.brief.filled_ratio === 0 && (
                  <p className="muted">{tx("project_onboarding.arxitektura_toldirilmagan")}</p>
                )}
              </div>
            ) : <p className="muted">{tx("project_onboarding.arxitektura_yozilmagan")}</p>}
          </Card>

          <Card title={tx("project_onboarding.3_muhim_qarorlar_va_eslatmalar")}
                badge={<span className="badge">{d.key_notes.length}</span>}>
            <ul className="list-plain">
              {d.key_notes.map((w) => (
                <li key={w.id}>
                  <div className="row">
                    <Avatar user={w.user} size="sm" />
                    <strong style={{ fontSize: 13 }}>{w.user.full_name}</strong>
                    {w.task
                      ? <Link className="mono muted" {...toTask(w.task)}>{w.task_code}</Link>
                      : <span className="mono muted">{w.task_code}</span>}
                    <span className="spacer" />
                    <small className="muted">{w.hours} {tx("project_onboarding.soat")} {fmtDate(w.work_date)}</small>
                  </div>
                  <div className="pre-wrap" style={{ marginTop: 6 }}>{w.note}</div>
                </li>
              ))}
              {!d.key_notes.length && <li className="muted">{tx("project_onboarding.hozircha_ish_jurnali_yoq")}</li>}
            </ul>
          </Card>

          <Card title={tx("project_onboarding.4_takrorlanmasligi_kerak_bolgan_xatolar")}
                badge={<span className="badge badge-danger">{d.lessons.length}</span>}>
            <ul className="list-plain">
              {d.lessons.map((r) => (
                <li key={r.id}>
                  <div className="row">
                    <span className="badge badge-warn">{r.verdict_display}</span>
                    {r.task
                      ? <Link className="mono" {...toTask(r.task)}>{r.task_code}</Link>
                      : <span className="mono">{r.task_code}</span>}
                    <span className="muted">{r.task_title}</span>
                    <span className="spacer" />
                    <small className="muted">{r.reviewer?.full_name} · {timeAgo(r.created_at)}</small>
                  </div>
                  <div className="tl-detail">{r.comment}</div>
                </li>
              ))}
              {!d.lessons.length && <li className="muted">{tx("project_onboarding.hali_qaytarilgan_ish_yoq")}</li>}
            </ul>
          </Card>

          <Card title={tx("project_onboarding.5_loyiha_bosqichlari")}>
            <Timeline items={d.milestones} showProject={false} />
          </Card>
        </div>

        <div>
          <Card title={tx("project_onboarding.kim_nima_qilgan")} padded={false}
                badge={<span className="badge">{d.contributions.length}</span>}>
            <div className="card-list">
              {d.contributions.map((c) => (
                <Link key={c.member.id} className="onboarding-member-row"
                      {...toDeveloper(project.id, c.member.user.id)}>
                  <div className="onboarding-member-head">
                    <Avatar user={c.member.user} size="sm" />
                    <div className="onboarding-member-info">
                      <div className="onboarding-member-name">{c.member.user.full_name}</div>
                      <div className="onboarding-member-role">
                        {formatMemberRole(c.member.user.specialty_display, c.member.role_display)}
                        {!c.member.is_active && tx("project_onboarding.sobiq")}
                      </div>
                    </div>
                  </div>
                  <div className="onboarding-stats-row">
                    <span className="badge badge-ok">{c.done} {tx("common.bajarilgan_2")}</span>
                    <span className="badge badge-info">{c.open} {tx("common.ochiq")}</span>
                    <span className="badge">{c.hours} {tx("common.soat")}</span>
                  </div>
                  {c.member.handover_note && (
                    <div className="tl-detail" style={{ marginTop: 8 }}>
                      <strong>{tx("project_onboarding.eslatma")}</strong> {c.member.handover_note}
                    </div>
                  )}
                </Link>
              ))}
              {!d.contributions.length && (
                <div className="empty" style={{ padding: 24 }}>
                  <p className="muted">{tx("project_onboarding.hozircha_ish_jurnali_yoq")}</p>
                </div>
              )}
            </div>
          </Card>

          <Card title={tx("project_onboarding.hozir_ochiq_turgan_ishlar")} padded={false}
                badge={<span className="badge">{d.open_now.length}</span>}>
            <div className="table-wrap"><table className="table">
              <tbody>
                {d.open_now.map((t) => (
                  <tr key={t.id}>
                    <td className="mono muted nowrap">{t.code}</td>
                    <td><Link {...toTask(t.id)}>{t.title}</Link></td>
                    <td><Priority task={t} /></td>
                  </tr>
                ))}
                {!d.open_now.length && (
                  <tr><td className="muted center">{tx("project_onboarding.ochiq_vazifa_yoq")}</td></tr>
                )}
              </tbody>
            </table></div>
          </Card>

          <Card title={tx("project_onboarding.songgi_bajarilganlar")} padded={false}
                badge={<span className="badge">{d.recent_done.length}</span>}>
            <div className="table-wrap"><table className="table">
              <tbody>
                {d.recent_done.map((t) => (
                  <tr key={t.id}>
                    <td className="mono muted nowrap">{t.code}</td>
                    <td><Link {...toTask(t.id)}>{t.title}</Link></td>
                    <td><StatusBadge task={t} /></td>
                  </tr>
                ))}
                {!d.recent_done.length && (
                  <tr><td className="muted center">{tx("project_onboarding.hali_bajarilgan_vazifa_yoq")}</td></tr>
                )}
              </tbody>
            </table></div>
          </Card>
        </div>
      </div>
    </>
  );
}

