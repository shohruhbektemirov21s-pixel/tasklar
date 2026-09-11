import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as docx from "docx-preview";
import { IconClose, IconDownload, IconFile } from "./icons";
import { Loading } from "./ui";

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

export default function FilePreviewModal({ file, onClose }: FilePreviewModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);

  useEffect(() => {
    if (!file) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [file, onClose]);

  const ext = file ? file.name.split(".").pop()?.toLowerCase() || "" : "";
  const isDocx = ext === "docx";
  const isPdf = ext === "pdf";
  const isImage = ["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp"].includes(ext);
  const isText = ["txt", "json", "csv", "log", "sql", "py", "js", "ts", "md", "xml", "html"].includes(ext);

  useEffect(() => {
    if (!file) return;
    setError(null);
    setTextContent(null);

    let active = true;

    if (isDocx) {
      setLoading(true);
      fetch(file.url)
        .then((res) => {
          if (!res.ok) throw new Error("Faylni yuklab bo'lmadi");
          return res.arrayBuffer();
        })
        .then((buffer) => {
          if (!active) return;
          if (containerRef.current) {
            containerRef.current.innerHTML = "";
            return docx.renderAsync(buffer, containerRef.current, undefined, {
              inWrapper: true,
              ignoreWidth: false,
              ignoreHeight: false,
              experimental: true,
              className: "teamflow-docx-render",
            });
          }
        })
        .catch((err) => {
          if (active) setError(err?.message || "Word faylini ochishda xatolik yuz berdi");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    } else if (isText) {
      setLoading(true);
      fetch(file.url)
        .then((res) => {
          if (!res.ok) throw new Error("Faylni o'qib bo'lmadi");
          return res.text();
        })
        .then((text) => {
          if (active) setTextContent(text);
        })
        .catch((err) => {
          if (active) setError(err?.message || "Matn faylini ochishda xatolik");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }

    return () => {
      active = false;
    };
  }, [file, isDocx, isText]);

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
        padding: 16,
        background: "rgba(10, 15, 29, 0.82)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
      onClick={onClose}
    >
      <div
        className="modal-card"
        style={{
          width: "95vw",
          maxWidth: 1100,
          height: "92vh",
          display: "flex",
          flexDirection: "column",
          borderRadius: 12,
          background: "var(--surface, #ffffff)",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
          border: "1px solid var(--border)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div
          style={{
            padding: "12px 20px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--surface)",
            gap: 12,
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                background: isDocx ? "rgba(37, 99, 235, 0.12)" : isPdf ? "rgba(239, 68, 68, 0.12)" : "rgba(100, 116, 139, 0.12)",
                color: isDocx ? "#2563eb" : isPdf ? "#ef4444" : "var(--text)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
                fontWeight: "bold",
                flexShrink: 0,
              }}
            >
              {isDocx ? "W" : isPdf ? "PDF" : <IconFile size={16} />}
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
              <div style={{ fontSize: 11, color: "var(--muted)" }}>
                {ext.toUpperCase()} {file.size ? `· ${file.size}` : ""}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <a
              href={file.url}
              download={file.name}
              className="btn btn-sm btn-outline"
              style={{ display: "flex", alignItems: "center", gap: 6 }}
              title="Faylni kompyuterga saqlash"
            >
              <IconDownload size={14} />
              Yuklab olish
            </a>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={onClose}
              title="Yopish (Esc)"
              style={{ padding: "6px 8px" }}
            >
              <IconClose size={16} />
            </button>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "auto",
            position: "relative",
            background: isDocx ? "#e2e8f0" : "var(--surface-2, #f8fafc)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: isImage ? "center" : "flex-start",
            padding: isImage ? 16 : 0,
          }}
        >
          {loading && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(255, 255, 255, 0.75)",
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
                Hujjat veb-saytda ochilmoqda...
              </span>
            </div>
          )}

          {error && (
            <div style={{ padding: 40, textAlign: "center" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
              <p style={{ color: "var(--danger)", fontWeight: 600, fontSize: 14 }}>{error}</p>
              <a href={file.url} download={file.name} className="btn btn-primary mt">
                <IconDownload size={14} /> Faylni yuklab olish
              </a>
            </div>
          )}

          {isDocx && (
            <div
              ref={containerRef}
              style={{
                width: "100%",
                maxWidth: 900,
                minHeight: "100%",
                margin: "0 auto",
                padding: "24px 16px",
              }}
            />
          )}

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

          {isImage && (
            <img
              src={file.url}
              alt={file.name}
              style={{
                maxWidth: "100%",
                maxHeight: "100%",
                objectFit: "contain",
                borderRadius: 8,
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
              }}
            />
          )}

          {isText && textContent !== null && (
            <div style={{ width: "100%", padding: 20 }}>
              <pre
                style={{
                  margin: 0,
                  padding: 16,
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: "var(--text)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontFamily: "var(--mono, monospace)",
                }}
              >
                {textContent}
              </pre>
            </div>
          )}

          {!isDocx && !isPdf && !isImage && !isText && (
            <div style={{ padding: 60, textAlign: "center", margin: "auto" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📁</div>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: "var(--text)" }}>
                {file.name}
              </h3>
              <p style={{ color: "var(--muted)", fontSize: 13, maxWidth: 440, margin: "0 auto 20px" }}>
                Ushbu formatdagi ({ext.toUpperCase()}) fayllar brauzerda to'g'ridan-to'g'ri ko'rsatilmaydi.
                Faylni ko'rish uchun qurilmangizga yuklab olishingiz mumkin.
              </p>
              <a
                href={file.url}
                download={file.name}
                className="btn btn-primary"
                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                <IconDownload size={16} /> Faylni yuklab olish
              </a>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
