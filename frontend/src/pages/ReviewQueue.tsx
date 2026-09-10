import { Fragment, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api, listOf, pagesOf, totalOf } from "@/api/client";
import { useFetch } from "@/api/useFetch";
import type { Task } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { PageHead } from "@/components/Layout";
import {
  AvatarStack, Card, Empty, ErrorMsg, Loading, Pager, Priority, StatusBadge, fmtDate,
} from "@/components/ui";
import { useDebouncedLive } from "@/realtime/RealtimeContext";
import { toTask } from "@/nav";
import { tx } from "@/i18n";

/** «Qaytarish» uchun qaror kodi - serverdagi ro'yxatdan qidiriladi. */
const REJECT_HINTS = ["CHANGES_REQUESTED", "REJECTED", "RETURNED"];

/** Har bir sahifada 15 tadan vazifa ko'rsatiladi. */
const PER_PAGE = 15;

export default function ReviewQueue() {
  const fid = useId();
  const { meta } = useAuth();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<number | null>(null);
  const [verdict, setVerdict] = useState("APPROVED");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  // Amal (tekshiruvni saqlash) xatosi - yuklash xatosidan alohida turadi.
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, error: loadError, loading, reload } =
    useFetch<any>("/tasks/review-queue/", { page, page_size: PER_PAGE });
  const error = actionError || loadError;

  // Ish topshirilsa navbat darrov to'ldiriladi (debounce bilan himoyalangan).
  useDebouncedLive((d) => { if (d.event === "task.update") reload(); }, 1200);

  const rawList = useMemo(() => (data ? listOf<Task>(data) : []), [data]);
  const total = totalOf(data);
  const pages = pagesOf(data, PER_PAGE);

  // Agar server natijani sahifalab bergan bo'lsa (results), uning o'zini olamiz.
  // Agar server to'liq massiv qaytargan bo'lsa (kesh yoki eski versiya), mijozda 15 tadan kesamiz.
  const isServerPaginated = data && typeof data === "object" && "results" in data;
  const tasks = useMemo(() => {
    if (isServerPaginated) return rawList;
    const start = (page - 1) * PER_PAGE;
    return rawList.slice(start, start + PER_PAGE);
  }, [rawList, isServerPaginated, page]);

  const verdicts = meta?.review_verdict || [];
  const rejectValue = String(
    verdicts.find((v) => REJECT_HINTS.includes(String(v.value)))?.value
    ?? verdicts.find((v) => String(v.value) !== "APPROVED")?.value
    ?? "CHANGES_REQUESTED",
  );

  /**
   * Qaror paneli qatorning ostida ochiladi.
   *
   * Dizaynda har qatorda ikkita tugma turadi, lekin qaror izohsiz
   * yuborilmasligi kerak - ayniqsa qaytarishda: "nimani tuzatish kerak"
   * degan savol javobsiz qolsa, ish yana o'sha holida qaytib keladi.
   * Shuning uchun tugma qarorni **tanlaydi** va panelni ochadi.
   */
  function begin(taskId: number, value: string) {
    setActionError(null);
    setVerdict(value);
    setOpen(open === taskId && verdict === value ? null : taskId);
  }

  async function submit(taskId: number) {
    setBusy(true);
    setActionError(null);
    try {
      await api.post(`/tasks/${taskId}/review/`, { verdict, comment });
      setOpen(null);
      setComment("");
      setVerdict("APPROVED");
      reload();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : tx("review_queue.tekshiruvni_saqlab_bolmadi"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead
        title={<strong>{tx("common.tekshiruv_navbati")}</strong>}
        actions={total > 0 && (
          <span className="badge badge-danger">{total} {tx("review_queue.ta_kutmoqda")}</span>
        )}
      />
      <div className="content">
        <ErrorMsg error={error} />
        {loading ? <Loading /> : tasks?.length ? (
          <div className="card">
            <div className="table-wrap"><table className="table table-review">
              <thead>
                <tr>
                  <th style={{ width: 44, textAlign: "center" }}>#</th>
                  <th>{tx("review_queue.vazifa_nomi")}</th>
                  {/* Dizaynda ustun «Yaratuvchi» deb nomlangan, lekin navbatda
                      tekshiruvchiga kerak bo'ladigan odam - ishni TOPSHIRGAN
                      ijrochi. Vazifani ochgan odam vazifa sahifasida ko'rinadi. */}
                  <th>{tx("review_queue.topshirdi")}</th>
                  <th>{tx("common.loyiha")}</th>
                  <th>{tx("common.sana")}</th>
                  <th>{tx("common.holat")}</th>
                  <th className="right">{tx("common.amallar")}</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t, idx) => {
                  const rowNum = (page - 1) * PER_PAGE + idx + 1;
                  return (
                    <Fragment key={t.id}>
                      <tr>
                        <td className="mono muted" style={{ fontSize: 12, textAlign: "center" }}>
                          {rowNum}
                        </td>
                        <td>
                          <Link {...toTask(t.id)} style={{ fontWeight: 600 }}>{t.title}</Link>
                          <div className="row" style={{ gap: 6, marginTop: 3 }}>
                            <span className="mono muted" style={{ fontSize: 11.5 }}>{t.code}</span>
                            <Priority task={t} />
                            {t.specialty_label && (
                              <span className="badge badge-brand">{t.specialty_label}</span>
                            )}
                            {!!t.attachment_count && (
                              <span className="badge">{t.attachment_count} {tx("review_queue.fayl")}</span>
                            )}
                          </div>
                        </td>
                        <td><AvatarStack users={t.assignees} /></td>
                        <td className="muted">{t.project_name}</td>
                        <td className="muted nowrap">{fmtDate(t.submitted_at)}</td>
                        <td><StatusBadge task={t} /></td>
                        <td>
                          <div className="row-actions">
                            <button className="btn btn-sm btn-ok"
                                    onClick={() => begin(t.id, "APPROVED")}>{tx("common.qabul_qilish")}</button>
                            <button className="btn btn-sm btn-danger"
                                    onClick={() => begin(t.id, rejectValue)}>{tx("review_queue.qaytarish")}</button>
                          </div>
                        </td>
                      </tr>

                      {open === t.id && (
                        <tr className="review-panel-row">
                          <td colSpan={7}>
                            <div className="review-panel">
                              <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
                                {t.review_round}{tx("review_queue.aylana")} {t.logged_hours} {tx("review_queue.soat_sarflangan")}
                              </div>
                              {t.acceptance_criteria && (
                                <>
                                  <strong style={{ fontSize: 13 }}>{tx("common.tayyorlik_mezoni")}</strong>
                                  <div className="tl-detail">{t.acceptance_criteria}</div>
                                </>
                              )}
                              <div className="field mt">
                                <span className="lbl">{tx("review_queue.qaror")}</span>
                                <div className="check-list">
                                  {verdicts.map((v) => (
                                    <label key={v.value} className={verdict === String(v.value) ? "on" : ""}>
                                      <input type="radio" checked={verdict === String(v.value)}
                                             onChange={() => setVerdict(String(v.value))} />
                                      {v.label}
                                    </label>
                                  ))}
                                </div>
                              </div>
                              <div className="field">
                                <label htmlFor={`${fid}-${t.id}`}>{tx("review_queue.izoh")}</label>
                                <textarea id={`${fid}-${t.id}`} rows={3} value={comment}
                                          onChange={(e) => setComment(e.target.value)}
                                          placeholder={tx("review_queue.nimani_tuzatish_kerak_aniq_yozing")} />
                              </div>
                              <div className="row">
                                <button className="btn btn-primary" disabled={busy}
                                        onClick={() => void submit(t.id)}>{tx("review_queue.qarorni_saqlash")}</button>
                                <Link className="btn" {...toTask(t.id)}>{tx("review_queue.vazifani_toliq_korish")}</Link>
                                <button className="btn btn-ghost" onClick={() => setOpen(null)}>
                                  {tx("common.bekor_qilish")}
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table></div>
            {pages > 1 && (
              <div
                className="card-body row between middle"
                style={{
                  borderTop: "1px solid var(--border-color)",
                  padding: "12px 16px",
                  flexWrap: "wrap",
                  gap: 12,
                }}
              >
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                  {total} {tx("common.tadan")} {(page - 1) * PER_PAGE + 1}—
                  {Math.min(page * PER_PAGE, total)} {tx("common.tasi")} ({page}/{pages} {tx("ui.sahifalar")})
                </p>
                <Pager
                  page={page}
                  pages={pages}
                  onPick={(p) => {
                    setOpen(null);
                    setPage(p);
                  }}
                />
              </div>
            )}
          </div>
        ) : (
          <Card>
            <Empty icon="✓" title={tx("review_queue.navbat_bosh")}
                   text={tx("review_queue.hozircha_tekshirishga_yuborilgan_ish_yoq")}>
              <div className="row" style={{ justifyContent: "center", gap: 10, marginTop: 12 }}>
                <Link className="btn btn-primary" to="/vazifalar">
                  {tx("common.vazifalar")}
                </Link>
                <Link className="btn" to="/loyihalar">
                  {tx("common.loyihalar")}
                </Link>
              </div>
            </Empty>
          </Card>
        )}
      </div>
    </>
  );
}
