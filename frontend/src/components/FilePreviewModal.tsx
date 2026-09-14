import { useEffect, useRef, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import * as docx from "docx-preview";
import * as XLSX from "xlsx";
import { IconClose, IconDownload, IconFile, IconSearch } from "./icons";
import { Loading } from "./ui";
import { lockScroll, unlockScroll } from "./scrollLock";
import { tx } from "@/i18n";

export interface PreviewFile {
  url: string;
  name: string;
  size?: string;
  sizeBytes?: number;
}

interface FilePreviewModalProps {
  file: PreviewFile | null;
  onClose: () => void;
}

// Ustun harflarini hisoblash (0 -> A, 1 -> B, ..., 26 -> AA)
function getColumnLabel(index: number): string {
  let label = "";
  let i = index;
  while (i >= 0) {
    label = String.fromCharCode((i % 26) + 65) + label;
    i = Math.floor(i / 26) - 1;
  }
  return label;
}

export default function FilePreviewModal({ file, onClose }: FilePreviewModalProps) {
  const docxRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Rejimlar va holatlar
  const [isFull, setIsFull] = useState(false);
  const [copied, setCopied] = useState(false);

  // Matnli fayllar uchun
  const [textContent, setTextContent] = useState<string | null>(null);
  const [forceText, setForceText] = useState(false);

  // Excel fayllar uchun
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [activeSheet, setActiveSheet] = useState<string>("");
  const [sheetSearch, setSheetSearch] = useState("");

  // Rasm boshqaruvi
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    if (!file) return;
    lockScroll();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      unlockScroll();
    };
  }, [file, onClose]);

  const ext = file ? file.name.split(".").pop()?.toLowerCase() || "" : "";

  const isDocx = ext === "docx";
  const isPdf = ext === "pdf";
  const isExcel = ["xlsx", "xls", "xlsm", "xlsb", "ods"].includes(ext);
  const isImage = ["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp", "ico", "tiff", "avif"].includes(ext);
  const isVideo = ["mp4", "webm", "ogg", "ogv", "mov"].includes(ext);
  const isAudio = ["mp3", "wav", "ogg", "m4a", "aac", "flac"].includes(ext);
  const isStandardText = [
    "txt", "json", "csv", "tsv", "log", "sql", "py", "js", "jsx", "ts", "tsx",
    "md", "xml", "html", "htm", "css", "scss", "sass", "yaml", "yml", "sh",
    "bash", "bat", "cmd", "ini", "conf", "env", "toml", "java", "c", "cpp",
    "h", "cs", "php", "rb", "go", "rs", "kt", "swift",
  ].includes(ext);

  const shouldRenderText = (isStandardText || forceText) && !isDocx && !isExcel && !isPdf && !isImage && !isVideo && !isAudio;

  // Fayl o'zgarganda holatlarni tozalash va yuklash
  useEffect(() => {
    if (!file) return;
    setError(null);
    setTextContent(null);
    setWorkbook(null);
    setActiveSheet("");
    setSheetSearch("");
    setZoom(1);
    setRotation(0);
    setForceText(false);

    let active = true;

    if (isDocx) {
      setLoading(true);
      fetch(file.url)
        .then((res) => {
          if (!res.ok) throw new Error(tx("file_preview.yuklab_bolmadi"));
          return res.arrayBuffer();
        })
        .then((buffer) => {
          if (!active) return;
          if (docxRef.current) {
            docxRef.current.innerHTML = "";
            return docx.renderAsync(buffer, docxRef.current, undefined, {
              inWrapper: true,
              ignoreWidth: false,
              ignoreHeight: false,
              experimental: true,
              className: "teamflow-docx-render",
            });
          }
        })
        .catch((err) => {
          if (active) setError(err?.message || tx("file_preview.word_xatosi"));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    } else if (isExcel) {
      setLoading(true);
      fetch(file.url)
        .then((res) => {
          if (!res.ok) throw new Error(tx("file_preview.yuklab_bolmadi"));
          return res.arrayBuffer();
        })
        .then((buffer) => {
          if (!active) return;
          try {
            const wb = XLSX.read(buffer, { type: "array" });
            setWorkbook(wb);
            if (wb.SheetNames.length > 0) {
              setActiveSheet(wb.SheetNames[0]);
            }
          } catch {
            throw new Error(tx("file_preview.excel_xatosi"));
          }
        })
        .catch((err) => {
          if (active) setError(err?.message || tx("file_preview.excel_xatosi"));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    } else if (shouldRenderText) {
      setLoading(true);
      fetch(file.url)
        .then((res) => {
          if (!res.ok) throw new Error(tx("file_preview.yuklab_bolmadi"));
          return res.text();
        })
        .then((text) => {
          if (active) setTextContent(text);
        })
        .catch((err) => {
          if (active) setError(err?.message || tx("file_preview.matn_xatosi"));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }

    return () => {
      active = false;
    };
  }, [file, isDocx, isExcel, shouldRenderText]);

  // Agar foydalanuvchi "Matn sifatida ochish" ni tanlasa
  const handleForceText = () => {
    if (!file) return;
    setForceText(true);
    setLoading(true);
    setError(null);
    fetch(file.url)
      .then((res) => {
        if (!res.ok) throw new Error(tx("file_preview.yuklab_bolmadi"));
        return res.text();
      })
      .then((text) => {
        setTextContent(text);
      })
      .catch((err) => {
        setError(err?.message || tx("file_preview.matn_xatosi"));
      })
      .finally(() => {
        setLoading(false);
      });
  };

  // Excel varaq ma'lumotlari
  const currentSheetRows = useMemo(() => {
    if (!workbook || !activeSheet || !workbook.Sheets[activeSheet]) return [];
    const sheet = workbook.Sheets[activeSheet];
    const rawData = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
      header: 1,
      defval: "",
      blankrows: false,
    });
    return rawData;
  }, [workbook, activeSheet]);

  // Excel filtrlangan satrlar
  const filteredSheetRows = useMemo(() => {
    if (!sheetSearch.trim()) return currentSheetRows;
    const q = sheetSearch.toLowerCase();
    return currentSheetRows.filter((row) =>
      row.some((cell) => String(cell).toLowerCase().includes(q))
    );
  }, [currentSheetRows, sheetSearch]);

  // Maksimal ustunlar soni
  const maxCols = useMemo(() => {
    return filteredSheetRows.reduce((max, row) => Math.max(max, row.length), 0);
  }, [filteredSheetRows]);

  const copyText = () => {
    if (textContent !== null) {
      navigator.clipboard.writeText(textContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!file) return null;

  return createPortal(
    <div
      className="modal-overlay"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: isFull ? 0 : 16,
        background: "rgba(10, 15, 29, 0.86)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        transition: "padding 0.2s ease",
      }}
      onClick={onClose}
    >
      <div
        className="modal-card"
        style={{
          width: isFull ? "100vw" : "95vw",
          maxWidth: isFull ? "100vw" : 1240,
          height: isFull ? "100vh" : "92vh",
          display: "flex",
          flexDirection: "column",
          borderRadius: isFull ? 0 : 12,
          background: "var(--surface, #ffffff)",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
          border: isFull ? "none" : "1px solid var(--border)",
          overflow: "hidden",
          transition: "all 0.2s ease",
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Yuqori boshqaruv paneli */}
        <div
          style={{
            padding: "10px 18px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--surface)",
            gap: 12,
            flexShrink: 0,
            userSelect: "none",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                background: isDocx
                  ? "rgba(37, 99, 235, 0.12)"
                  : isExcel
                  ? "rgba(16, 185, 129, 0.14)"
                  : isPdf
                  ? "rgba(239, 68, 68, 0.12)"
                  : isVideo || isAudio
                  ? "rgba(168, 85, 247, 0.12)"
                  : isImage
                  ? "rgba(245, 158, 11, 0.12)"
                  : "rgba(100, 116, 139, 0.12)",
                color: isDocx
                  ? "#2563eb"
                  : isExcel
                  ? "#10b981"
                  : isPdf
                  ? "#ef4444"
                  : isVideo || isAudio
                  ? "#a855f7"
                  : isImage
                  ? "#d97706"
                  : "var(--text)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                fontWeight: "bold",
                flexShrink: 0,
              }}
            >
              {isDocx ? "W" : isExcel ? "X" : isPdf ? "PDF" : isVideo ? "▶" : isAudio ? "♪" : isImage ? "IMG" : <IconFile size={16} />}
            </span>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--text)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={file.name}
              >
                {file.name}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontWeight: 600 }}>{ext.toUpperCase()}</span>
                {file.size && <span>· {file.size}</span>}
                {isExcel && currentSheetRows.length > 0 && (
                  <span>· {tx("file_preview.qatorlar_soni", { n: currentSheetRows.length })}</span>
                )}
              </div>
            </div>
          </div>

          {/* O'ng tomondagi harakatlar */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            {/* Rasm boshqaruv tugmalari */}
            {isImage && (
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginRight: 8 }}>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setZoom((z) => Math.max(0.3, z - 0.2))}
                  title={tx("file_preview.kichiklashtirish")}
                  style={{ padding: "4px 8px" }}
                >
                  −
                </button>
                <span style={{ fontSize: 11, minWidth: 40, textAlign: "center", fontWeight: 600, color: "var(--muted)" }}>
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setZoom((z) => Math.min(3, z + 0.2))}
                  title={tx("file_preview.kattalashtirish")}
                  style={{ padding: "4px 8px" }}
                >
                  +
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  title={tx("file_preview.aylantirish")}
                  style={{ padding: "4px 8px" }}
                >
                  ↻
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => { setZoom(1); setRotation(0); }}
                  title={tx("file_preview.asl_olcham")}
                  style={{ fontSize: 11, padding: "4px 6px" }}
                >
                  1:1
                </button>
              </div>
            )}

            {/* Matndan nusxa olish */}
            {shouldRenderText && textContent !== null && (
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={copyText}
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                {copied ? tx("file_preview.nusxa_olindi") : tx("file_preview.nusxa_olish")}
              </button>
            )}

            {/* Yangi oynada ochish */}
            <a
              href={file.url}
              target="_blank"
              rel="noreferrer"
              className="btn btn-sm btn-ghost"
              title={tx("file_preview.yangi_oynada_ochish")}
              style={{ display: "flex", alignItems: "center", padding: "6px 8px" }}
            >
              ↗
            </a>

            {/* Yuklab olish */}
            <a
              href={file.url}
              download={file.name}
              className="btn btn-sm btn-outline"
              style={{ display: "flex", alignItems: "center", gap: 6 }}
              title={tx("file_preview.saqlash_title")}
            >
              <IconDownload size={14} />
              <span className="hide-mobile">{tx("file_preview.yuklab_olish")}</span>
            </a>

            {/* To'liq ekran */}
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => setIsFull((f) => !f)}
              title={tx("file_preview.toliq_ekran")}
              style={{ padding: "6px 8px" }}
            >
              {isFull ? "🗗" : "🗖"}
            </button>

            {/* Yopish */}
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={onClose}
              title={tx("file_preview.yopish")}
              style={{ padding: "6px 8px" }}
            >
              <IconClose size={16} />
            </button>
          </div>
        </div>

        {/* Excel varaqlar va qidiruv qatori */}
        {isExcel && workbook && (
          <div
            style={{
              padding: "8px 16px",
              background: "var(--canvas-inset, #f1f5f9)",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              flexShrink: 0,
            }}
          >
            {/* Varaqlar (Sheets) */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, overflowX: "auto", maxWidth: "70%" }}>
              {workbook.SheetNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setActiveSheet(name)}
                  style={{
                    padding: "4px 12px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    border: "1px solid",
                    borderColor: activeSheet === name ? "#10b981" : "var(--border)",
                    background: activeSheet === name ? "#10b981" : "var(--surface)",
                    color: activeSheet === name ? "#ffffff" : "var(--text)",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    transition: "all 0.15s ease",
                  }}
                >
                  {name}
                </button>
              ))}
            </div>

            {/* Jadvaldan qidirish */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, position: "relative", minWidth: 200 }}>
              <span style={{ position: "absolute", left: 8, color: "var(--muted)", display: "flex", pointerEvents: "none" }}>
                <IconSearch size={14} />
              </span>
              <input
                type="text"
                value={sheetSearch}
                onChange={(e) => setSheetSearch(e.target.value)}
                placeholder={tx("file_preview.izlash_placeholder")}
                style={{
                  padding: "4px 8px 4px 28px",
                  fontSize: 12,
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  color: "var(--text)",
                  width: "100%",
                }}
              />
            </div>
          </div>
        )}

        {/* Asosiy kontent maydoni */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "auto",
            position: "relative",
            background: isDocx ? "#e2e8f0" : isImage ? "#090d16" : "var(--surface-2, #f8fafc)",
            display: "flex",
            flexDirection: "column",
            alignItems: isImage ? "center" : "stretch",
            justifyContent: isImage ? "center" : "flex-start",
            padding: 0,
          }}
        >
          {loading && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(255, 255, 255, 0.8)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                zIndex: 10,
              }}
            >
              <Loading />
              <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 500 }}>
                {tx("file_preview.hujjat_ochilmoqda")}
              </span>
            </div>
          )}

          {error && (
            <div style={{ padding: 40, textAlign: "center", margin: "auto" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
              <p style={{ color: "var(--danger)", fontWeight: 600, fontSize: 14 }}>{error}</p>
              <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 16 }}>
                <button type="button" onClick={handleForceText} className="btn btn-outline">
                  {tx("file_preview.matn_sifatida_ochish")}
                </button>
                <a href={file.url} download={file.name} className="btn btn-primary">
                  <IconDownload size={14} /> {tx("file_preview.faylni_yuklab_olish")}
                </a>
              </div>
            </div>
          )}

          {/* 1. WORD (.docx) */}
          {isDocx && (
            <div
              ref={docxRef}
              style={{
                width: "100%",
                maxWidth: 900,
                minHeight: "100%",
                margin: "0 auto",
                padding: "24px 16px",
              }}
            />
          )}

          {/* 2. EXCEL (.xlsx, .xls, .csv, .ods) */}
          {isExcel && workbook && (
            <div style={{ width: "100%", height: "100%", overflow: "auto", background: "var(--surface)" }}>
              {filteredSheetRows.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
                  {tx("file_preview.katakcha_bosh")}
                </div>
              ) : (
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 12,
                    fontFamily: "var(--font, system-ui, sans-serif)",
                    background: "var(--surface)",
                  }}
                >
                  <thead style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--surface-2, #f1f5f9)" }}>
                    <tr>
                      <th
                        style={{
                          width: 44,
                          minWidth: 44,
                          padding: "6px 8px",
                          borderBottom: "2px solid var(--border)",
                          borderRight: "2px solid var(--border)",
                          color: "var(--muted)",
                          fontWeight: 700,
                          textAlign: "center",
                          background: "var(--surface-2, #e2e8f0)",
                        }}
                      >
                        #
                      </th>
                      {Array.from({ length: maxCols }).map((_, cIdx) => (
                        <th
                          key={cIdx}
                          style={{
                            padding: "6px 12px",
                            borderBottom: "2px solid var(--border)",
                            borderRight: "1px solid var(--border)",
                            color: "var(--muted)",
                            fontWeight: 700,
                            textAlign: "center",
                            minWidth: 90,
                          }}
                        >
                          {getColumnLabel(cIdx)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSheetRows.map((row, rIdx) => (
                      <tr
                        key={rIdx}
                        style={{
                          borderBottom: "1px solid var(--border)",
                          background: rIdx % 2 === 0 ? "var(--surface)" : "var(--canvas-inset, rgba(0,0,0,0.015))",
                        }}
                      >
                        <td
                          style={{
                            padding: "5px 8px",
                            textAlign: "center",
                            fontWeight: 600,
                            color: "var(--muted)",
                            background: "var(--surface-2, #f8fafc)",
                            borderRight: "2px solid var(--border)",
                            userSelect: "none",
                          }}
                        >
                          {rIdx + 1}
                        </td>
                        {Array.from({ length: maxCols }).map((_, cIdx) => {
                          const val = row[cIdx];
                          const strVal = val !== undefined && val !== null ? String(val) : "";
                          const isNumber = typeof val === "number";
                          return (
                            <td
                              key={cIdx}
                              style={{
                                padding: "6px 12px",
                                borderRight: "1px solid var(--border)",
                                color: "var(--text)",
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-word",
                                textAlign: isNumber ? "right" : "left",
                              }}
                            >
                              {strVal}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* 3. PDF */}
          {isPdf && (
            <iframe
              src={file.url}
              style={{
                width: "100%",
                height: "100%",
                border: "none",
                background: "#ffffff",
              }}
              title={file.name}
            />
          )}

          {/* 4. RASMLAR */}
          {isImage && (
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "auto",
                padding: 24,
              }}
            >
              <img
                src={file.url}
                alt={file.name}
                style={{
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                  transformOrigin: "center center",
                  transition: "transform 0.15s ease",
                  maxWidth: zoom === 1 ? "100%" : undefined,
                  maxHeight: zoom === 1 ? "100%" : undefined,
                  objectFit: "contain",
                  borderRadius: 6,
                  boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
                }}
              />
            </div>
          )}

          {/* 5. VIDEO */}
          {isVideo && (
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#000000",
                padding: 16,
              }}
            >
              <video
                controls
                autoPlay
                playsInline
                src={file.url}
                style={{
                  maxWidth: "100%",
                  maxHeight: "100%",
                  borderRadius: 8,
                  boxShadow: "0 10px 30px rgba(0,0,0,0.7)",
                }}
              >
                {tx("file_preview.videoni_qollab_quvvatlamaydi")}
              </video>
            </div>
          )}

          {/* 6. AUDIO */}
          {isAudio && (
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: 32,
                gap: 24,
              }}
            >
              <div
                style={{
                  width: 90,
                  height: 90,
                  borderRadius: "50%",
                  background: "rgba(168, 85, 247, 0.15)",
                  color: "#a855f7",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 40,
                }}
              >
                ♪
              </div>
              <div style={{ textAlign: "center" }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>{file.name}</h3>
                <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{file.size || ext.toUpperCase()}</p>
              </div>
              <audio controls src={file.url} style={{ width: "100%", maxWidth: 500 }}>
                {tx("file_preview.audioni_qollab_quvvatlamaydi")}
              </audio>
            </div>
          )}

          {/* 7. MATN VA DASTURLASH KODI */}
          {shouldRenderText && textContent !== null && (
            <div style={{ width: "100%", padding: 16 }}>
              <div
                style={{
                  display: "flex",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  overflow: "hidden",
                  fontSize: 13,
                  fontFamily: "var(--mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace)",
                }}
              >
                {/* Qator raqamlari */}
                <div
                  style={{
                    padding: "16px 12px",
                    background: "var(--surface-2, #f8fafc)",
                    borderRight: "1px solid var(--border)",
                    color: "var(--muted)",
                    textAlign: "right",
                    userSelect: "none",
                    lineHeight: 1.6,
                  }}
                >
                  {textContent.split("\n").map((_, i) => (
                    <div key={i}>{i + 1}</div>
                  ))}
                </div>
                {/* Kod / matn */}
                <pre
                  style={{
                    margin: 0,
                    padding: 16,
                    flex: 1,
                    overflowX: "auto",
                    lineHeight: 1.6,
                    color: "var(--text)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {textContent}
                </pre>
              </div>
            </div>
          )}

          {/* 8. BOSHQA BARCHA NOMA'LUM FORMATLAR */}
          {!isDocx && !isExcel && !isPdf && !isImage && !isVideo && !isAudio && !shouldRenderText && (
            <div style={{ padding: 60, textAlign: "center", margin: "auto" }}>
              <div style={{ fontSize: 52, marginBottom: 16 }}>📁</div>
              <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8, color: "var(--text)" }}>
                {file.name}
              </h3>
              <p style={{ color: "var(--muted)", fontSize: 13, maxWidth: 500, margin: "0 auto 24px", lineHeight: 1.6 }}>
                {tx("file_preview.nomalum_format_izoh", { ext: ext.toUpperCase() || "fayl" })}
              </p>
              <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={handleForceText}
                  className="btn btn-outline"
                  style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                >
                  📄 {tx("file_preview.matn_sifatida_ochish")}
                </button>
                <a
                  href={file.url}
                  download={file.name}
                  className="btn btn-primary"
                  style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                >
                  <IconDownload size={16} /> {tx("file_preview.faylni_yuklab_olish")}
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
