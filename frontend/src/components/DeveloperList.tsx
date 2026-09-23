/**
 * Loyiha formasidagi «Jamoa va vazifalar» kartasi: tizimdagi dasturchilar.
 *
 * Ilgari kartada faqat qidiruv maydoni bor edi - menejer kimni chaqirishni
 * bilish uchun ismni esdan yozishi kerak edi. Endi dasturchilar ro'yxati
 * darrov ko'rinadi va bir bosishda jamoaga qo'shiladi.
 *
 * Ro'yxat serverdan keladi (`/users/?role=DEVELOPER`) va sahifalanadi:
 * jami son `count` dan olinadi, ekrandagi qatorlardan emas.
 */
import { useEffect, useState } from "react";
import { api, listOf, pagesOf, totalOf } from "@/api/client";
import type { UserBrief } from "@/api/types";
import { IconPlus } from "./icons";
import { Avatar, ErrorMsg, Pager, SpecialtyTag } from "./ui";
import { tx } from "@/i18n";

const PAGE_SIZE = 10;

interface Props {
  /** Allaqachon jamoaga olinganlar - ro'yxatda qayta ko'rsatilmaydi. */
  pickedIds: number[];
  excludeId?: number;
  onPick: (u: UserBrief) => void;
}

export default function DeveloperList({ pickedIds, excludeId, onPick }: Props) {
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<UserBrief[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    api.get<unknown>("/users/", {
      role: "DEVELOPER", exclude_management: "1", ordering: "full_name",
      page, page_size: PAGE_SIZE,
    }, ctrl.signal)
      .then((data) => {
        setRows(listOf<UserBrief>(data));
        setTotal(totalOf(data));
        setPages(pagesOf(data, PAGE_SIZE));
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [page]);

  const visible = rows.filter((u) => u.id !== excludeId && !pickedIds.includes(u.id));

  return (
    <div className="dev-list">
      <div className="dev-list-head">
        <strong>{tx("team_picker.dasturchilar")}</strong>
        {!loading && !error && <span className="muted">{tx("team_picker.ta_dasturchi", { n: total })}</span>}
      </div>

      <ErrorMsg error={error} />

      {loading ? (
        <p className="muted dev-list-note">{tx("common.yuklanmoqda")}</p>
      ) : !error && total === 0 ? (
        <p className="muted dev-list-note">{tx("team_picker.dasturchi_yoq")}</p>
      ) : !error && visible.length === 0 ? (
        <p className="muted dev-list-note">{tx("team_picker.sahifadagilar_qoshildi")}</p>
      ) : (
        <ul className="dev-list-rows">
          {visible.map((u) => (
            <li key={u.id}>
              <Avatar user={u} size="sm" />
              <div className="dev-list-who">
                <strong>{u.full_name}</strong> <SpecialtyTag user={u} compact />
                <small className="muted">{u.email}</small>
              </div>
              <button type="button" className="btn btn-sm" onClick={() => onPick(u)}
                      title={tx("team_picker.jamoaga_qoshish")} aria-label={tx("team_picker.jamoaga_qoshish")}>
                <IconPlus size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && <Pager page={page} pages={pages} onPick={setPage} />}
    </div>
  );
}
