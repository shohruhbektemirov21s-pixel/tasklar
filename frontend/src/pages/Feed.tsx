/**
 * Umumiy tarix — loyihalar kesimida.
 *
 * Ilgari bu sahifa hamma loyihaning yozuvlarini bitta aralash lentaga
 * qo'yardi: yozuv ko'payganda unda hech narsa topib bo'lmasdi. Endi avval
 * **loyihalar ro'yxati** chiqadi, odam qaysinisini ochishni o'zi tanlaydi.
 *
 * Qidiruv ikki darajada ishlaydi:
 *   - loyiha yopiq turganda — nom, kalit va tavsif bo'yicha loyiha qidiriladi;
 *   - loyiha ochilganda — o'sha loyihaning yozuvlari matn bo'yicha filtrlanadi.
 */
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, listOf } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import type { Activity, ProjectFile } from "@/api/types";
import { IconFile } from "@/components/icons";
import { PageHead } from "@/components/Layout";
import Timeline from "@/components/Timeline";
import { Card, DateField, Empty, Loading, fmtDate, timeAgo } from "@/components/ui";
import { toProject, useNavParams } from "@/nav";
import { tx } from "@/i18n";

interface ProjectRow {
  id: number;
  name: string;
  key: string;
  color: string;
  status_display: string;
  is_public: boolean;
  manager_name: string;
  activity_count: number;
  last_activity: string | null;
}

/** Ochilgan loyihaning hujjatlari — yozuvlardan OLDIN turadi.
 *
 * Tarixni ochgan odamning birinchi savoli ko'pincha "bu loyihada qanday
 * hujjat bor?" bo'ladi: texnik topshiriq, dizayn, shartnoma. Ular yozuvlar
 * lentasining ostida qolib ketmasin.
 *
 * Fayllar faqat loyihani ko'ra oladigan odamga ko'rinadi — begonaga server
 * 403 qaytaradi, o'shanda bo'lim umuman chizilmaydi.
 */
function ProjectDocuments({ projectId }: { projectId: number }) {
  const [files, setFiles] = useState<ProjectFile[] | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let alive = true;
    setFiles(null);
    setDenied(false);
    void api.get<unknown>(`/projects/${projectId}/files/`)
      .then((d) => { if (alive) setFiles(listOf<ProjectFile>(d)); })
      .catch(() => { if (alive) { setFiles([]); setDenied(true); } });
    return () => { alive = false; };
  }, [projectId]);

  if (denied || files === null) return null;

  return (
    <div className="feed-docs">
      <div className="row wrap">
        <span className="muted nowrap">
          <IconFile size={13} /> {tx("feed.loyiha_fayllari")}
        </span>
        {files.length > 0 ? (
          <>
            {files.slice(0, 12).map((f) => (
              <a key={f.id} className="chip" href={f.url || "#"} target="_blank"
                 rel="noreferrer"
                 title={[f.original_name, f.size_display, f.description]
                   .filter(Boolean).join(" · ")}>
                {/* Uzun nom kesiladi, hajm esa doim ko'rinadi - fayl nomi
                    ko'pincha uzun bo'ladi, hajmi qisqa va foydali. */}
                <span className="doc-name">{f.original_name}</span>
                <span className="muted doc-size">{f.size_display}</span>
              </a>
            ))}
            {files.length > 12 && (
              <Link className="chip" {...toProject(projectId, "fayllar")}>
                {tx("common.yana")} {files.length - 12} {tx("common.ta")}
              </Link>
            )}
          </>
        ) : (
          <span className="muted">{tx("feed.hujjat_yuklanmagan")}</span>
        )}
      </div>
    </div>
  );
}

/** Ochilgan loyihaning yozuvlari — faqat ochilganda so'raladi. */
function ProjectFeed({ projectId }: { projectId: number }) {
  const fid = useId();
  // Turkumlar backenddan (`/meta/` -> `VERB_META`): frontendda qattiq
  // yozilganda «Ish maydoni» va «Foydalanuvchi» filtrga tushmay qolgan edi.
  const { meta } = useAuth();
  const [items, setItems] = useState<Activity[] | null>(null);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [f, setF] = useState({ search: "", category: "", days: "", half: "", date: "" });

  useEffect(() => {
    // Filtr yoki sahifa tez almashtirilsa eski javob yangisining ustiga
    // tushmasin - kechikkan so'rov bekor qilinadi.
    let alive = true;
    setItems(null);
    void api.get<{ results?: Activity[]; count?: number }>("/activity/", {
      project: projectId, search: f.search, category: f.category, days: f.days,
      half: f.half, date: f.date,
      page, page_size: 15,
    })
      .then((d) => { if (!alive) return; setItems(d.results || []); setCount(d.count || 0); })
      .catch(() => { if (!alive) return; setItems([]); setCount(0); });
    return () => { alive = false; };
  }, [projectId, f, page]);

  const set = (k: string, v: string) => { setPage(1); setF((p) => ({ ...p, [k]: v })); };
  const pages = Math.ceil(count / 15);

  return (
    <div className="card-body">
      <div className="filters">
        <div className="f grow">
          <label htmlFor={`${fid}-0`}>{tx("feed.yozuvlar_ichidan_qidirish")}</label>
          <input id={`${fid}-0`} defaultValue={f.search} placeholder={tx("feed.matn_boyicha")}
                 onKeyDown={(e) => {
                   if (e.key === "Enter") set("search", (e.target as HTMLInputElement).value);
                 }} />
        </div>
        <div className="f">
          <label htmlFor={`${fid}-1`}>{tx("feed.turkum")}</label>
          <select id={`${fid}-1`} value={f.category} onChange={(e) => set("category", e.target.value)}>
            <option value="">{tx("common.hammasi")}</option>
            {(meta?.activity_category || []).map((c) => (
              <option key={String(c.value)} value={String(c.value)}>{c.label}</option>
            ))}
          </select>
        </div>
        <div className="f">
          <label htmlFor={`${fid}-2`}>{tx("common.davr")}</label>
          <select id={`${fid}-2`} value={f.days} onChange={(e) => set("days", e.target.value)}>
            <option value="">{tx("feed.butun_tarix")}</option>
            <option value="7">{tx("feed.songgi_7_kun")}</option>
            <option value="30">{tx("feed.songgi_30_kun")}</option>
            <option value="90">{tx("feed.songgi_90_kun")}</option>
          </select>
        </div>
        <div className="f wl-date">
          <label htmlFor={`${fid}-date`}>{tx("common.sana", undefined, "Sana")}</label>
          <DateField id={`${fid}-date`} value={f.date} onChange={(v) => set("date", v)} />
        </div>
        <div className="f">
          <label htmlFor={`${fid}-half`}>{tx("dashboard.oy_yarmi", undefined, "Oy yarmi")}</label>
          <select id={`${fid}-half`} value={f.half} onChange={(e) => set("half", e.target.value)}>
            <option value="">{tx("common.hammasi")}</option>
            <option value="1">{tx("dashboard.davr_1", undefined, "1 (1—15 sanalar)")}</option>
            <option value="2">{tx("dashboard.davr_2", undefined, "2 (16—30 sanalar)")}</option>
          </select>
        </div>
      </div>

      {!items ? <Loading /> : items.length
        ? <Timeline items={items} showProject={false} />
        : <Empty title={tx("feed.yozuv_topilmadi")} text={tx("feed.filtrni_boshatib_koring")} />}

      {pages > 1 && (
        <div className="row" style={{ justifyContent: "center", marginTop: 12 }}>
          <button className="btn btn-sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
            {tx("feed.oldingi")}
          </button>
          <span className="muted">{page} / {pages}</span>
          <button className="btn btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            {tx("feed.keyingi")}
          </button>
        </div>
      )}
    </div>
  );
}

export default function Feed() {
  const fid = useId();
  const [params, setParams] = useNavParams();
  const [rows, setRows] = useState<ProjectRow[] | null>(null);

  const q = params.get("q") || "";
  const half = params.get("half") || "";
  const date = params.get("date") || "";
  const page = Number(params.get("page") || 1);
  // Ochiq loyiha manzilda turadi — sahifa yangilansa ham ochiq qoladi.
  const open = Number(params.get("loyiha") || 0) || null;

  const load = useCallback(async () => {
    setRows(null);
    try {
      setRows(await api.get<ProjectRow[]>("/activity/by-project/", { q }));
    } catch {
      setRows([]);
    }
  }, [q]);

  useEffect(() => { void load(); }, [load]);

  function set(k: string, v: string) {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    if (k !== "page" && k !== "loyiha") next.delete("page");
    setParams(next);
  }

  const filteredRows = useMemo(() => {
    if (!rows) return [];
    return rows.filter((r) => {
      if (half) {
        const day = r.last_activity ? parseInt(fmtDate(r.last_activity).split(".")[0], 10) : null;
        const h = day ? (day <= 15 ? "1" : "2") : null;
        if (h !== half) return false;
      }
      if (date) {
        const d = r.last_activity ? fmtDate(r.last_activity) : null;
        if (d && !d.includes(date)) return false;
      }
      return true;
    });
  }, [rows, half, date]);

  const PER_PAGE = 15;
  const totalPages = Math.ceil(filteredRows.length / PER_PAGE) || 1;
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pageRows = filteredRows.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

  const total = (rows || []).reduce((n, r) => n + r.activity_count, 0);

  return (
    <>
      <PageHead
        title={<strong>{tx("feed.umumiy_tarix")}</strong>}
        actions={<span className="badge">{total} {tx("feed.yozuv")}</span>}
      />
      <div className="content">
        <div className="filters">
          <div className="f grow">
            <label htmlFor={`${fid}-3`}>{tx("feed.loyiha_qidirish")}</label>
            <input id={`${fid}-3`} defaultValue={q} placeholder={tx("feed.nom_kalit_yoki_tavsif_boyicha")}
                   onKeyDown={(e) => {
                     if (e.key === "Enter") set("q", (e.target as HTMLInputElement).value);
                   }} />
          </div>
          <div className="f wl-date">
            <label htmlFor={`${fid}-date`}>{tx("common.sana", undefined, "Sana")}</label>
            <DateField id={`${fid}-date`} value={date} onChange={(v) => set("date", v)} />
          </div>
          <div className="f">
            <label htmlFor={`${fid}-half`}>{tx("dashboard.oy_yarmi", undefined, "Oy yarmi")}</label>
            <select id={`${fid}-half`} value={half} onChange={(e) => set("half", e.target.value)}>
              <option value="">{tx("common.hammasi")}</option>
              <option value="1">{tx("dashboard.davr_1", undefined, "1 (1—15 sanalar)")}</option>
              <option value="2">{tx("dashboard.davr_2", undefined, "2 (16—30 sanalar)")}</option>
            </select>
          </div>
          {(Boolean(q) || Boolean(half) || Boolean(date)) && (
            <button type="button" className="btn btn-ghost" onClick={() => {
              const next = new URLSearchParams();
              if (open) next.set("loyiha", String(open));
              setParams(next);
            }}>
              {tx("common.tozalash")}
            </button>
          )}
        </div>

        {!rows ? <Loading /> : !pageRows.length ? (
          <Empty icon="☰" title={tx("common.loyiha_topilmadi")}
                 text={q || half || date ? tx("feed.qidiruvni_ozgartirib_koring") : tx("feed.hali_loyiha_yoq")} />
        ) : (
          <div className="card">
            <div className="card-list">
              {pageRows.map((r, idx) => {
                const isOpen = open === r.id;
                const rowNum = (currentPage - 1) * PER_PAGE + idx + 1;
                const day = r.last_activity ? parseInt(fmtDate(r.last_activity).split(".")[0], 10) : null;
                const halfNum = day ? (day <= 15 ? 1 : 2) : null;

                return (
                  <div key={r.id}>
                    {/* Butun qator ochish tugmasi — sarlavhani aniq nishonga
                        olish shart emas. Ichidagi havolalar o'z ishini qiladi. */}
                    <div className="repo-item clickable"
                         onClick={() => set("loyiha", isOpen ? "" : String(r.id))}>
                      <div className="row wrap" style={{ alignItems: "center" }}>
                        <span style={{
                          minWidth: 28,
                          textAlign: "center",
                          color: "var(--muted)",
                          fontWeight: 600,
                          fontSize: 13,
                        }}>
                          {rowNum}
                        </span>
                        <h3 style={{ margin: 0 }}>
                          <span className="lang-dot" style={{ background: r.color }} />{" "}
                          <Link {...toProject(r.id)}
                                onClick={(e) => e.stopPropagation()}>{r.name}</Link>
                        </h3>
                        <span className="badge">{r.status_display}</span>
                        {!r.is_public && <span className="badge badge-warn">{tx("feed.yopiq")}</span>}
                        {halfNum && (
                          <span
                            className="badge"
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              padding: "1px 5px",
                              borderRadius: 4,
                              background: halfNum === 1 ? "var(--accent-bg, #eff6ff)" : "var(--warning-bg, #fef3c7)",
                              color: halfNum === 1 ? "var(--accent, #2563eb)" : "var(--warning, #d97706)",
                              border: `1px solid ${halfNum === 1 ? "rgba(37,99,235,0.2)" : "rgba(217,119,6,0.2)"}`,
                            }}
                            title={halfNum === 1 ? tx("my_work.davr_1", undefined, "1-davr: 1—15 sanalar (1)") : tx("my_work.davr_2", undefined, "2-davr: 16—30 sanalar (2)")}
                          >
                            {halfNum}
                          </span>
                        )}
                        <span className="spacer" />
                        <span className="badge">{r.activity_count} {tx("feed.yozuv")}</span>
                        <span className="muted" style={{ fontSize: 18, lineHeight: 1 }}>
                          {isOpen ? "▴" : "▾"}
                        </span>
                      </div>
                      <div className="repo-meta" style={{ paddingLeft: 34 }}>
                        {r.manager_name && <span>{tx("common.pm")} {r.manager_name}</span>}
                        {r.last_activity && <span>{tx("feed.songgi_harakat")} {timeAgo(r.last_activity)}</span>}
                      </div>
                    </div>
                    {isOpen && (
                      <Card padded={false}>
                        {/* Avval hujjatlar, keyin yozuvlar lentasi. */}
                        <ProjectDocuments projectId={r.id} />
                        <ProjectFeed projectId={r.id} />
                      </Card>
                    )}
                  </div>
                );
              })}
            </div>
            {totalPages > 1 && (
              <div className="card-body pager-bar" style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10, borderTop: "1px solid var(--border)" }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={currentPage <= 1}
                  onClick={() => set("page", String(currentPage - 1))}
                >
                  {tx("feed.oldingi", undefined, "Oldingi")}
                </button>
                <span className="muted" style={{ fontSize: 13 }}>
                  {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => set("page", String(currentPage + 1))}
                >
                  {tx("feed.keyingi", undefined, "Keyingi")}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
