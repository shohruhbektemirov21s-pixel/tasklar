/**
 * Umumiy tarix — Loyihalar va fayllar tarixi.
 *
 * Loyihalar kesimida:
 * - Har bir loyihaning amallar va fayllar soni
 * - Bosilganda loyihaga oid barcha fayllar, ularning tahrir tarixi (versiyalari)
 * - Har bir faylni ko'rish (FilePreviewModal) va yuklab olish imkoniyati
 * - Loyihaning so'nggi amallar lentasi
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import type { Activity, ActivityProjectRow, ProjectFile } from "@/api/types";
import {
  EmptyState,
  FilterBar,
  PageHeader,
  TableSkeleton,
  fmtDateTime,
  timeAgo,
} from "@/components/ui";
import { toTask, useNavParams } from "@/nav";
import { tx } from "@/i18n";
import { IconChevron, IconDownload, IconEye, IconFile } from "@/components/icons";
import FilePreviewModal, { PreviewFile } from "@/components/FilePreviewModal";
import { AnchorButton, Button, LinkButton } from "@/components/Button";

function formatSummaryText(summary: string, cleanCode?: string) {
  let s = summary || "";
  if (cleanCode) {
    if (s.startsWith(`${cleanCode}: `)) {
      s = s.slice(cleanCode.length + 2);
    } else if (s.startsWith(`${cleanCode} - `)) {
      s = s.slice(cleanCode.length + 3);
    }
  }
  return s;
}

const CATEGORY_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  task: { bg: "var(--accent-soft)", color: "var(--accent)", label: "Vazifa" },
  order: { bg: "var(--success-soft)", color: "var(--success)", label: "Buyurtma" },
  project: { bg: "var(--done-soft)", color: "var(--done)", label: "Loyiha" },
  comment: { bg: "var(--attention-soft)", color: "var(--attention)", label: "Izoh" },
  system: { bg: "var(--surface-2)", color: "var(--muted)", label: "Tizim" },
};

/** Loyiha hujjatlari va ularning tahrir tarixi (versiyalari) */
function ProjectDocumentsSection({
  projectId,
  onPreview,
}: {
  projectId: number;
  onPreview: (file: PreviewFile) => void;
}) {
  const [files, setFiles] = useState<ProjectFile[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.get<ProjectFile[]>(`/projects/${projectId}/files/`)
      .then((data) => {
        if (alive) setFiles(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (alive) setFiles([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [projectId]);

  if (loading) {
    return (
      <div style={{ padding: "16px", display: "flex", gap: "10px", alignItems: "center", color: "var(--muted)" }}>
        <span className="spinner-xs" />
        <span style={{ fontSize: 13 }}>Yuklanmoqda...</span>
      </div>
    );
  }

  if (!files || files.length === 0) {
    return (
      <div
        style={{
          padding: "16px",
          background: "var(--surface-2)",
          border: "1px dashed var(--border)",
          borderRadius: 8,
          textAlign: "center",
          color: "var(--muted)",
          fontSize: 13,
        }}
      >
        📁 {tx("feed.fayllar_yoq", undefined, "Ushbu loyihaga hali hujjat yuklanmagan.")}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {files.map((f) => (
        <div
          key={f.id}
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
              <div style={{ color: "var(--done)", flexShrink: 0 }}>
                <IconFile size={20} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Button variant="link"
                    onClick={() => f.url && onPreview({ url: f.url, name: f.original_name, size: f.size_display })}
                    title="Veb-saytda ochish / ko'rish"
                  >
                    {f.original_name}
                  </Button>
                  <span
                    style={{
                      background: "var(--surface-3)",
                      color: "var(--text-secondary)",
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "1px 6px",
                      borderRadius: 6,
                    }}
                  >
                    v{f.version}
                  </span>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>
                  {f.size_display}
                  {f.uploaded_by && ` · ${f.uploaded_by.full_name}`}
                  {f.doc_date && ` · Hujjat sanasi: ${fmtDateTime(f.doc_date)}`}
                  {f.created_at && ` · Yuklangan: ${timeAgo(f.created_at)}`}
                  {f.description && ` · «${f.description}»`}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {f.url && (
                <Button
                  size="sm"
                  onClick={() => onPreview({ url: f.url!, name: f.original_name, size: f.size_display })}
                  title="Veb-saytda ko'rish"
                >
                  <IconEye size={14} />
                  <span>{tx("feed.korish", undefined, "Ko'rish")}</span>
                </Button>
              )}
              {f.url && (
                <AnchorButton
                  href={f.url}
                  download={f.original_name}
                  target="_blank"
                  rel="noreferrer"
                  variant="ghost" size="sm"
                  title="Yuklab olish"
                >
                  <IconDownload size={14} />
                  <span>{tx("feed.yuklab_olish", undefined, "Yuklab olish")}</span>
                </AnchorButton>
              )}
            </div>
          </div>

          {/* Versiyalar / Tahrir tarixi */}
          {f.versions && f.versions.length > 0 && (
            <details style={{ marginTop: 4, background: "var(--surface-2)", borderRadius: 6, padding: "6px 10px" }}>
              <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                🕒 {tx("feed.tahrir_tarixi", undefined, "Tahrir tarixi")} ({f.versions.length} {tx("feed.ta_eski_nusxa", undefined, "ta eski nusxa")})
              </summary>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8, paddingLeft: 8 }}>
                {f.versions.map((ver) => (
                  <div
                    key={ver.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      fontSize: 12,
                      padding: "4px 0",
                      borderBottom: "1px dashed var(--border)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
                      <span style={{ fontWeight: 700, color: "var(--muted)", minWidth: 26 }}>
                        v{ver.version}
                      </span>
                      <span style={{ fontWeight: 500, color: "var(--text)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {ver.original_name}
                      </span>
                      <span style={{ color: "var(--muted)", fontSize: 11 }}>
                        ({ver.size_display})
                      </span>
                      {ver.uploaded_by && (
                        <span style={{ color: "var(--muted)", fontSize: 11 }}>
                          · {ver.uploaded_by.full_name}
                        </span>
                      )}
                      {ver.created_at && (
                        <span style={{ color: "var(--muted)", fontSize: 11 }}>
                          · {fmtDateTime(ver.created_at)}
                        </span>
                      )}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {ver.url && (
                        <Button
                          size="xs"
                          onClick={() => onPreview({ url: ver.url!, name: ver.original_name, size: ver.size_display })}
                        >
                          <IconEye size={12} />
                          <span>{tx("feed.korish", undefined, "Ko'rish")}</span>
                        </Button>
                      )}
                      {ver.url && (
                        <AnchorButton
                          href={ver.url}
                          download={ver.original_name}
                          target="_blank"
                          rel="noreferrer"
                          variant="ghost" size="xs"
                        >
                          <IconDownload size={12} />
                        </AnchorButton>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}

/** Loyiha amallari lentasi */
function ProjectTimelineSection({ projectId }: { projectId: number }) {
  const [items, setItems] = useState<Activity[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.get<{ results?: Activity[] }>(`/activity/`, { project: projectId, page_size: 15 })
      .then((data) => {
        if (alive) setItems(data.results || []);
      })
      .catch(() => {
        if (alive) setItems([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [projectId]);

  if (loading) {
    return (
      <div style={{ padding: "16px", display: "flex", gap: "10px", alignItems: "center", color: "var(--muted)" }}>
        <span className="spinner-xs" />
        <span style={{ fontSize: 13 }}>Yuklanmoqda...</span>
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div style={{ padding: "14px", color: "var(--muted)", fontSize: 12.5 }}>
        Ushbu loyihada hali faoliyat yozuvlari mavjud emas.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {items.map((a) => {
        const dt = fmtDateTime(a.created_at);
        const catStyle = CATEGORY_COLORS[a.category] || CATEGORY_COLORS.system;
        return (
          <div
            key={a.id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 12px",
              background: "var(--surface)",
              borderRadius: 6,
              border: "1px solid var(--border)",
              fontSize: 12.5,
              gap: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
              <span
                style={{
                  display: "inline-block",
                  padding: "1px 6px",
                  borderRadius: 4,
                  fontSize: 10.5,
                  fontWeight: 600,
                  background: catStyle.bg,
                  color: catStyle.color,
                  flexShrink: 0,
                }}
              >
                {catStyle.label}
              </span>
              <span style={{ fontWeight: 600, color: "var(--text)" }}>
                {a.actor?.full_name || "Tizim"}:
              </span>
              <span style={{ color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {formatSummaryText(a.summary, a.task_code || undefined)}
              </span>
              {a.task && a.task_code && (
                <Link
                  {...toTask(a.task)}
                  style={{
                    fontWeight: 600,
                    color: "var(--accent)",
                    fontFamily: "var(--mono)",
                    fontSize: 12,
                    flexShrink: 0,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  #{a.task_code}
                </Link>
              )}
            </div>
            <span style={{ fontSize: 11, color: "var(--muted)", flexShrink: 0 }}>
              {dt} ({timeAgo(a.created_at)})
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function Feed() {
  const [params, setParams] = useNavParams();

  // Loyihalar holati
  const [projects, setProjects] = useState<ActivityProjectRow[] | null>(null);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const projectSearch = params.get("q") || "";
  const openProjectId = params.get("loyiha") ? Number(params.get("loyiha")) : null;

  // Fayl preview modal
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);

  // Loyihalar bo'yicha ma'lumotlarni yuklash
  const loadProjects = useCallback(async () => {
    setProjectsLoading(true);
    try {
      const data = await api.get<ActivityProjectRow[]>("/activity/by-project/", {
        q: projectSearch || undefined,
      });
      setProjects(Array.isArray(data) ? data : []);
    } catch {
      setProjects([]);
    } finally {
      setProjectsLoading(false);
    }
  }, [projectSearch]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  function setParam(key: string, val: string) {
    const next = new URLSearchParams(params);
    if (val) next.set(key, val);
    else next.delete(key);
    setParams(next);
  }

  function toggleProject(projId: number) {
    const next = new URLSearchParams(params);
    if (openProjectId === projId) {
      next.delete("loyiha");
    } else {
      next.set("loyiha", String(projId));
    }
    setParams(next);
  }

  return (
    <div className="content" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 1. Page Header */}
      <PageHeader
        title={tx("feed.umumiy_tarix")}
        subtitle="Tizimdagi barcha loyihalar bo'yicha hujjatlar va faoliyat xronologiyasi"
        breadcrumbs={[
          { label: tx("nav.bosh_sahifa") || "Bosh sahifa", href: "/" },
          { label: tx("feed.umumiy_tarix") },
        ]}
      />

      {/* 2. Loyiha qidirish filtri */}
      <FilterBar>
        <div className="filter-search-box" style={{ minWidth: 300, flex: 1 }}>
          <span style={{ color: "var(--muted)", fontSize: 13 }}>🔍</span>
          <input
            type="text"
            placeholder={tx("feed.nom_kalit_yoki_tavsif_boyicha", undefined, "Nom, kalit yoki tavsif bo'yicha qidiruv...")}
            value={projectSearch}
            onChange={(e) => setParam("q", e.target.value)}
          />
        </div>
        {projectSearch && (
          <Button
            variant="ghost" size="sm"
            onClick={() => setParam("q", "")}
            style={{ alignSelf: "flex-end" }}
          >
            {tx("common.tozalash") || "Tozalash"}
          </Button>
        )}
      </FilterBar>

      {/* 3. Loyihalar ro'yxati */}
      {projectsLoading ? (
        <TableSkeleton rows={6} />
      ) : !projects || projects.length === 0 ? (
        <div className="table-card-clean">
          <EmptyState
            icon="📁"
            title={projectSearch ? tx("feed.qidiruvni_ozgartirib_koring") || "Loyiha topilmadi" : tx("feed.hali_loyiha_yoq") || "Hali loyiha yo'q"}
            message={projectSearch ? "Boshqa kalit so'z bilan qidirib ko'ring." : "Tizimda hozircha loyihalar mavjud emas."}
            actionLabel={projectSearch ? (tx("common.tozalash") || "Filtrni tozalash") : undefined}
            onAction={projectSearch ? () => setParam("q", "") : undefined}
          />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {projects.map((p) => {
            const isOpen = openProjectId === p.id;
            return (
              <div
                key={p.id}
                style={{
                  background: "var(--surface)",
                  border: isOpen ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                  borderRadius: 12,
                  boxShadow: isOpen ? "var(--sh-raised)" : "var(--shadow-xs)",
                  overflow: "hidden",
                  transition: "all 0.18s ease",
                }}
              >
                {/* Loyiha sarlavhasi (bosiladigan qator) */}
                <div
                  onClick={() => toggleProject(p.id)}
                  style={{
                    padding: "16px 20px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 12,
                    background: isOpen ? "var(--surface-2)" : "transparent",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        background: p.color || "var(--accent)",
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
                          {p.name}
                        </span>
                        <span
                          style={{
                            background: "var(--surface-3)",
                            color: "var(--text-secondary)",
                            fontSize: 11,
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: 6,
                            fontFamily: "var(--mono)",
                          }}
                        >
                          #{p.key}
                        </span>
                        <span className="badge" style={{ fontSize: 11 }}>
                          {p.status_display}
                        </span>
                        {!p.is_public && (
                          <span className="badge badge-warn" style={{ fontSize: 11 }}>
                            {tx("feed.yopiq", undefined, "yopiq")}
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 4, fontSize: 12, color: "var(--muted)" }}>
                        {p.manager_name && <span>PM: {p.manager_name}</span>}
                        {p.last_activity && <span>{tx("feed.songgi_harakat", undefined, "so'nggi harakat:")} {timeAgo(p.last_activity)}</span>}
                      </div>
                    </div>
                  </div>

                  {/* O'ng tomon: statistika va ochish tugmasi */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span
                      style={{
                        background: "var(--done-soft)",
                        color: "var(--done)",
                        fontSize: 12,
                        fontWeight: 600,
                        padding: "3px 10px",
                        borderRadius: 12,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      <IconFile size={13} />
                      <span>{p.files_count ?? 0} ta fayl</span>
                    </span>

                    <span
                      style={{
                        background: "var(--accent-soft)",
                        color: "var(--accent)",
                        fontSize: 12,
                        fontWeight: 600,
                        padding: "3px 10px",
                        borderRadius: 12,
                      }}
                    >
                      {p.activity_count} ta yozuv
                    </span>

                    <div
                      style={{
                        color: "var(--muted)",
                        display: "inline-flex",
                        transform: isOpen ? "rotate(180deg)" : "none",
                        transition: "transform 0.2s ease",
                      }}
                    >
                      <IconChevron size={18} />
                    </div>
                  </div>
                </div>

                {/* Ochilgan bo'lim: Fayllar va ularning tarixi hamda amallar */}
                {isOpen && (
                  <div
                    style={{
                      padding: "20px",
                      borderTop: "1px solid var(--border)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 22,
                      background: "var(--surface)",
                    }}
                  >
                    {/* 1-BO'LIM: LOYIHA FAYLLARI VA ULARNING TARIXI */}
                    <div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 16 }}>📁</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                            {tx("feed.loyihaga_oid_fayllar", undefined, "Loyihaga oid fayllar va ularning tarixi")}
                          </span>
                        </div>
                        <LinkButton
                          to={`/loyiha/${p.id}/fayllar`}
                          size="xs"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span>Barcha hujjatlar boshqaruvi →</span>
                        </LinkButton>
                      </div>

                      <ProjectDocumentsSection projectId={p.id} onPreview={setPreviewFile} />
                    </div>

                    {/* 2-BO'LIM: LOYIHANING SO'NGGI AMALLAR XRONOLOGIYASI */}
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                        <span style={{ fontSize: 16 }}>⏱️</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                          {tx("feed.loyiha_amallari", undefined, "Loyiha amallari xronologiyasi")}
                        </span>
                      </div>

                      <ProjectTimelineSection projectId={p.id} />
                    </div>

                    {/* Pastki harakat tugmasi */}
                    <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 8, borderTop: "1px dashed var(--border)" }}>
                      <LinkButton
                        to={`/loyiha/${p.id}`}
                        variant="ghost" size="sm"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span>{tx("feed.loyiha_sahifasiga_otish", undefined, "Loyiha sahifasiga o'tish")}</span>
                        <span>→</span>
                      </LinkButton>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Fayl ko'rish (Preview) modali */}
      <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
    </div>
  );
}
