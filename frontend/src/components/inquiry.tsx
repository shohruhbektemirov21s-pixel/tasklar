/**
 * So'rovlar (Inquiries) komponentlari.
 */
import { useState } from "react";

import { api } from "@/api/client";
import type {
  Inquiry, InquiryFile, InquiryScopeValue, InquiryStatusValue,
  VoteChoiceValue,
} from "@/api/types";
import { confirmDialog } from "@/components/Confirm";
import FilePicker, { uploadFiles } from "@/components/FilePicker";
import {
  IconClose, IconFile, IconNeutral, IconThumbDown, IconThumbUp,
} from "@/components/icons";
import { Card, ErrorMsg } from "@/components/ui";
import { tx } from "@/i18n";

export const STATUS_TONE: Record<InquiryStatusValue, string> = {
  PENDING: "badge-warn",
  APPROVED: "badge-ok",
  REJECTED: "badge-danger",
};

export const EMPTY_INQUIRY_FORM = {
  title: "", body: "", scope: "OPEN" as InquiryScopeValue, is_anonymous: false,
};

export type InquiryFormValues = typeof EMPTY_INQUIRY_FORM;

export function inquiryFormOf(item: Inquiry): InquiryFormValues {
  return {
    title: item.title, body: item.body,
    scope: item.scope, is_anonymous: item.is_anonymous,
  };
}

/* ------------------------------------------------------------------ forma */

export function InquiryForm({ initial, editing, onCancel, onSaved }: {
  initial: InquiryFormValues;
  editing: Inquiry | null;
  onCancel: () => void;
  onSaved: (saved: Inquiry, warn?: string) => void;
}) {
  const [f, setF] = useState<InquiryFormValues>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [picked, setPicked] = useState<File[]>([]);
  const [kept, setKept] = useState<InquiryFile[]>(editing?.files || []);

  function set<K extends keyof InquiryFormValues>(k: K, v: InquiryFormValues[K]) {
    setF((prev) => ({ ...prev, [k]: v }));
  }


  async function dropFile(file: InquiryFile) {
    if (!editing) return;
    const yes = await confirmDialog({
      title: tx("suggestions.fayl_ochirilsinmi", { nom: file.original_name }),
      body: tx("suggestions.fayl_ochirish_izohi"),
      confirmText: tx("common.ochirish"),
      danger: true,
    });
    if (!yes) return;
    await api.delete(`/inquiries/${editing.id}/files/${file.id}/`);
    setKept((prev) => prev.filter((x) => x.id !== file.id));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const body = { title: f.title, body: f.body, scope: f.scope, is_anonymous: f.is_anonymous };
      const saved = editing
        ? await api.patch<Inquiry>(`/inquiries/${editing.id}/`, body)
        : await api.post<Inquiry>("/inquiries/", body);

      let warn: string | undefined;
      if (picked.length > 0) {
        try {
          await uploadFiles(`/inquiries/${saved.id}/files/`, picked);
        } catch (up) {
          warn = up instanceof Error ? up.message : "Fayllar yuklanmadi";
        }
      }

      onSaved(saved, warn);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : tx("common.saqlab_bolmadi"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={editing ? "So'rovni tahrirlash" : "Yangi so'rov yuborish"}>
      <form onSubmit={submit} className="stack">
        <ErrorMsg error={err} />

        <div className="form-group">
          <label htmlFor="inquiry-title">Sarlavha</label>
          <input
            id="inquiry-title"
            className="input"
            value={f.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="Qisqa va aniq sarlavha"
            required
            maxLength={200}
          />
        </div>

        <div className="form-group">
          <label htmlFor="inquiry-body">So'rov matni</label>
          <textarea
            id="inquiry-body"
            className="textarea"
            rows={5}
            value={f.body}
            onChange={(e) => set("body", e.target.value)}
            placeholder="Batafsil ma'lumot va taklifingizni yozing..."
            required
          />
        </div>

        <div className="row wrap gap-3" style={{ alignItems: "center" }}>
          <label className="radio-label" style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input
              type="radio"
              name="inquiry-scope"
              checked={f.scope === "OPEN"}
              onChange={() => set("scope", "OPEN")}
            />
            <span>🌐 Ochiq (hammaga ko'rinadi)</span>
          </label>
          <label className="radio-label" style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input
              type="radio"
              name="inquiry-scope"
              checked={f.scope === "CLOSED"}
              onChange={() => set("scope", "CLOSED")}
            />
            <span>🔒 Yopiq (faqat boshliq va sizga)</span>
          </label>
        </div>

        <div style={{ marginTop: 8 }}>
          <label className="checkbox-label" style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={f.is_anonymous}
              onChange={(e) => set("is_anonymous", e.target.checked)}
            />
            <span>🎭 Anonim yuborish (muallif ko'rsatilmaydi)</span>
          </label>
        </div>

        {kept.length > 0 && (
          <div className="stack gap-1">
            <span className="muted" style={{ fontSize: 13 }}>Mavjud fayllar:</span>
            <div className="row wrap gap-2">
              {kept.map((file) => (
                <span key={file.id} className="badge" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <IconFile size={13} /> {file.original_name}
                  <button type="button" className="btn-icon" onClick={() => dropFile(file)} title="O'chirish">
                    <IconClose size={12} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: 10 }}>
          <FilePicker files={picked} onChange={setPicked} />
        </div>

        <div className="row gap-2" style={{ justifyContent: "flex-end", marginTop: 12 }}>
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>
            {tx("common.bekor_qilish")}
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !f.title.trim() || !f.body.trim()}>
            {busy ? tx("common.saqlanmoqda") : tx("common.yuborish")}
          </button>
        </div>
      </form>
    </Card>
  );
}

/* ------------------------------------------------------------------ ovoz */

export function InquiryVoteBar({ item, onChange }: {
  item: Inquiry;
  onChange: (updated: Inquiry) => void;
}) {
  const [busy, setBusy] = useState(false);

  if (item.scope === "CLOSED") return null;

  async function cast(choice: VoteChoiceValue) {
    setBusy(true);
    try {
      const res = await api.post<Inquiry>(`/inquiries/${item.id}/vote/`, { choice });
      onChange(res);
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  }

  const isFor = item.my_vote === "FOR";
  const isAgainst = item.my_vote === "AGAINST";
  const isNeutral = item.my_vote === "NEUTRAL";

  return (
    <div className="row gap-2" style={{ alignItems: "center" }}>
      <button
        type="button"
        className={`btn btn-sm ${isFor ? "btn-primary" : "btn-outline"}`}
        onClick={() => cast("FOR")}
        disabled={busy}
        style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
      >
        <IconThumbUp size={14} /> {item.for_count}
      </button>
      <button
        type="button"
        className={`btn btn-sm ${isNeutral ? "btn-primary" : "btn-outline"}`}
        onClick={() => cast("NEUTRAL")}
        disabled={busy}
        style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
      >
        <IconNeutral size={14} /> {item.neutral_count}
      </button>
      <button
        type="button"
        className={`btn btn-sm ${isAgainst ? "btn-danger" : "btn-outline"}`}
        onClick={() => cast("AGAINST")}
        disabled={busy}
        style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
      >
        <IconThumbDown size={14} /> {item.against_count}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ boshliq paneli */

export function InquiryBossPanel({ item, onDone }: {
  item: Inquiry;
  onDone: (updated: Inquiry) => void;
}) {
  const [note, setNote] = useState(item.decision_note || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function decide(status: InquiryStatusValue) {
    setBusy(true);
    setErr("");
    try {
      const res = await api.post<Inquiry>(`/inquiries/${item.id}/decide/`, {
        status, decision_note: note,
      });
      onDone(res);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Qaror qabul qilib bo'lmadi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ background: "var(--surface-2)", borderRadius: 8 }}>
      <Card title="👑 Boshliq qarori">
        <div className="stack gap-2">
          <ErrorMsg error={err} />
          <textarea
            className="textarea"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Qaror izohi (ixtiyoriy)..."
          />
          <div className="row gap-2" style={{ justifyContent: "flex-end" }}>
            <button
              type="button"
              className="btn btn-sm btn-danger"
              onClick={() => decide("REJECTED")}
              disabled={busy}
            >
              Rad etish
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => decide("APPROVED")}
              disabled={busy}
            >
              Tasdiqlash
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
