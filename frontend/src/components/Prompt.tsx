import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { tx } from "@/i18n";
import { lockScroll, unlockScroll } from "./scrollLock";

export interface PromptOptions {
  title: string;
  body?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  multiline?: boolean;
  inputType?: string;
  danger?: boolean;
  required?: boolean;
}

type Pending = PromptOptions & { resolve: (val: string | null) => void };

let show: ((p: Pending) => void) | null = null;

/**
 * Matn kiritish oynasi - `window.prompt` o'rniga.
 * Markazda chiroyli modal oyna ko'rinishida ochiladi.
 * Bekor qilinsa (Escape yoki Bekor qilish) `null` qaytaradi,
 * tasdiqlansa kiritilgan matnni qaytaradi.
 */
export function promptDialog(opts: PromptOptions): Promise<string | null> {
  if (!show) {
    const res = window.prompt(
      `${opts.title}${opts.body ? `\n\n${opts.body}` : ""}`.trim(),
      opts.defaultValue || ""
    );
    return Promise.resolve(res);
  }
  return new Promise<string | null>((resolve) => show!({ ...opts, resolve }));
}

export default function PromptHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    show = (p) => {
      setValue(p.defaultValue || "");
      setPending(p);
    };
    return () => {
      show = null;
    };
  }, []);

  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        pending.resolve(null);
        setPending(null);
      }
    };
    document.addEventListener("keydown", onKey);
    lockScroll();
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", onKey);
      unlockScroll();
    };
  }, [pending]);

  if (!pending) return null;

  const done = (ok: boolean) => {
    if (!ok) {
      pending.resolve(null);
    } else {
      pending.resolve(value);
    }
    setPending(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !pending.multiline) {
      e.preventDefault();
      done(true);
    } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && pending.multiline) {
      e.preventDefault();
      done(true);
    }
  };

  return createPortal(
    <div className="modal-scrim" style={{ zIndex: 200001 }} onClick={() => done(false)}>
      <div
        className="modal-box"
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-title"
        style={{ maxWidth: 460 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="prompt-title" style={{ fontSize: 16.5, fontWeight: 600, margin: "0 0 8px" }}>
          {pending.title}
        </h3>
        {pending.body && (
          <p className="muted" style={{ margin: "0 0 14px", fontSize: 13.5, lineHeight: 1.5 }}>
            {pending.body}
          </p>
        )}
        <div style={{ marginTop: 12, marginBottom: 16 }}>
          {pending.multiline ? (
            <textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              className="textarea"
              rows={3}
              value={value}
              placeholder={pending.placeholder || ""}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{
                width: "100%",
                resize: "vertical",
                boxSizing: "border-box",
                borderRadius: "var(--radius, 8px)",
                padding: "8px 12px",
                fontSize: 14,
                border: "1px solid var(--border, #cbd5e1)",
                background: "var(--surface, #fff)",
                color: "var(--text, inherit)",
              }}
            />
          ) : (
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              type={pending.inputType || "text"}
              className="input"
              value={value}
              placeholder={pending.placeholder || ""}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{
                width: "100%",
                boxSizing: "border-box",
                borderRadius: "var(--radius, 8px)",
                padding: "8px 12px",
                fontSize: 14,
                border: "1px solid var(--border, #cbd5e1)",
                background: "var(--surface, #fff)",
                color: "var(--text, inherit)",
              }}
            />
          )}
        </div>
        <div className="modal-actions" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="btn" onClick={() => done(false)}>
            {pending.cancelText || tx("common.bekor_qilish")}
          </button>
          <button
            type="button"
            className={`btn ${pending.danger ? "btn-danger" : "btn-primary"}`}
            disabled={pending.required && !value.trim()}
            onClick={() => done(true)}
          >
            {pending.confirmText || tx("confirm.davom_etish")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
