import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api, listOf } from "@/api/client";
import type { Workspace } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { IconChat, IconClose, IconPlus, IconSearch } from "@/components/icons";
import { PageHeader } from "@/components/ui";
import { EmptyState, ErrorMsg, FilterBar, Loading, TableSkeleton } from "@/components/ui";
import { toNewWorkspace, toWorkspace, toWorkspaceChat } from "@/nav";
import { tx } from "@/i18n";
import { Button, LinkButton } from "@/components/Button";
import WorkspaceDetailModal from "./workspace/WorkspaceDetailModal";

type ScopeFilter = "all" | "mine" | "open";

export default function Workspaces() {
  const fid = useId();
  const { user } = useAuth();
  const [mine, setMine] = useState<Workspace[] | null>(null);
  const [openWorkspaces, setOpenWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [scope, setScope] = useState<ScopeFilter>("all");
  const [search, setSearch] = useState("");

  // Modals
  const [openWorkspaceSlug, setOpenWorkspaceSlug] = useState<string | null>(null);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mineRes, openRes] = await Promise.all([
        api.get<unknown>("/workspaces/", { scope: "mine" }),
        api.get<unknown>("/workspaces/", { scope: "open" }),
      ]);
      setMine(listOf<Workspace>(mineRes));
      setOpenWorkspaces(listOf<Workspace>(openRes));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tx("workspaces.yuklashda_xatolik", undefined, "Ish maydonlarini yuklab bo'lmadi"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Combine & deduplicate into single list
  const allWorkspaces = useMemo(() => {
    const map = new Map<number, Workspace>();
    (mine || []).forEach((w) => map.set(w.id, w));
    openWorkspaces.forEach((w) => {
      if (!map.has(w.id)) {
        map.set(w.id, w);
      }
    });
    return Array.from(map.values());
  }, [mine, openWorkspaces]);

  // Filtered workspaces
  const filteredWorkspaces = useMemo(() => {
    let list: Workspace[] = [];
    if (scope === "mine") {
      list = mine || [];
    } else if (scope === "open") {
      list = openWorkspaces;
    } else {
      list = allWorkspaces;
    }

    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        (w.description && w.description.toLowerCase().includes(q)) ||
        w.owner.full_name.toLowerCase().includes(q)
    );
  }, [scope, search, mine, openWorkspaces, allWorkspaces]);

  async function handleJoinWithCode(e: React.FormEvent) {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setJoinBusy(true);
    setJoinError(null);
    try {
      // Find workspace by join code or post directly
      await api.post(`/workspaces/join/`, { code: joinCode.trim().toUpperCase() });
      setShowJoinModal(false);
      setJoinCode("");
      await load();
    } catch (err) {
      // If /workspaces/join/ is not global, search matching workspace or show error
      setJoinError(err instanceof ApiError ? err.message : tx("workspaces.qoshilib_bolmadi", undefined, "Kiritilgan kod bo'yicha maydon topilmadi yoki kod eskirgan."));
    } finally {
      setJoinBusy(false);
    }
  }

  async function handleDirectJoin(ws: Workspace, e: React.MouseEvent) {
    e.stopPropagation();
    setError(null);
    try {
      await api.post(`/workspaces/${ws.slug}/join/`, {});
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tx("workspaces.qoshilib_bolmadi", undefined, "Qo'shilib bo'lmadi"));
    }
  }

  return (
    <div className="content" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PageHeader
        title={tx("workspaces.ish_maydonlari", undefined, "Ish maydonlari")}
        subtitle={tx("workspaces.tavsif", undefined, "Jamoaviy ish maydonlari, loyihalar va umumiy resurslar")}
        breadcrumbs={[
          { label: tx("common.bosh_sahifa", undefined, "Bosh sahifa"), href: "/" },
          { label: tx("workspaces.ish_maydonlari", undefined, "Ish maydonlari") },
        ]}
        actions={
          <div className="row middle" style={{ gap: 8 }}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setJoinError(null);
                setShowJoinModal(true);
              }}
            >
              {tx("workspaces.kod_bilan_qoshilish", undefined, "Kodi bilan qo'shilish")}
            </Button>
            {user?.can_create_project && (
              <LinkButton variant="primary" size="sm" {...toNewWorkspace()}>
                <IconPlus size={14} />
                <span>{tx("workspaces.yangi_maydon", undefined, "+ Yangi ish maydoni")}</span>
              </LinkButton>
            )}
          </div>
        }
      />

      <FilterBar>
        {/* Scope selector tabs */}
        <div className="row middle" style={{ gap: 4 }}>
          <button
            type="button"
            className={`btn btn-sm ${scope === "all" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setScope("all")}
          >
            {tx("common.hammasi", undefined, "Barchasi")} ({allWorkspaces.length})
          </button>
          <button
            type="button"
            className={`btn btn-sm ${scope === "mine" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setScope("mine")}
          >
            {tx("workspaces.mening_maydonlarim", undefined, "Mening maydonlarim")} ({(mine || []).length})
          </button>
          <button
            type="button"
            className={`btn btn-sm ${scope === "open" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setScope("open")}
          >
            {tx("workspaces.ochiq_maydonlar", undefined, "Ochiq maydonlar")} ({openWorkspaces.length})
          </button>
        </div>

        {/* Search */}
        <div className="f" style={{ minWidth: 220, position: "relative" }}>
          <label htmlFor={`${fid}-search`} className="sr-only">
            {tx("common.qidiruv", undefined, "Qidiruv")}
          </label>
          <input
            id={`${fid}-search`}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tx("workspaces.qidirish_placeholder", undefined, "Maydon nomi yoki egasi...")}
          />
        </div>

        {(scope !== "all" || search) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setScope("all");
              setSearch("");
            }}
          >
            {tx("common.tozalash", undefined, "Tozalash")}
          </Button>
        )}
      </FilterBar>

      <ErrorMsg error={error} />

      {/* Unified Table View */}
      <div className="table-card-clean">
        {loading && !allWorkspaces.length ? (
          <TableSkeleton rows={5} cols={6} />
        ) : !filteredWorkspaces.length ? (
          <EmptyState
            icon="🏢"
            title={tx("workspaces.topilmadi", undefined, "Ish maydonlari topilmadi")}
            message={
              search
                ? tx("projects.filtr_natijasi_yoq", undefined, "Tanlangan filtrlar bo'yicha hech narsa topilmadi.")
                : tx("workspaces.siz_hali_ish_maydonida_emassiz", undefined, "Hozircha hech qanday ish maydoni mavjud emas.")
            }
            action={
              user?.can_create_project ? (
                <LinkButton variant="primary" {...toNewWorkspace()}>
                  <IconPlus size={14} />
                  <span>{tx("workspaces.yangi_maydon", undefined, "+ Yangi ish maydoni")}</span>
                </LinkButton>
              ) : undefined
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table-clean">
              <thead>
                <tr>
                  <th style={{ width: 44, textAlign: "center" }}>№</th>
                  <th>{tx("workspaces.maydon_nomi", undefined, "Ish maydoni")}</th>
                  <th>{tx("workspaces.egasi", undefined, "Egasi")}</th>
                  <th style={{ textAlign: "center", width: 120 }}>{tx("workspaces.loyiha", undefined, "Loyihalar")}</th>
                  <th style={{ textAlign: "center", width: 110 }}>{tx("workspaces.azo", undefined, "A'zolar")}</th>
                  <th style={{ width: 110 }}>{tx("common.turi", undefined, "Turi")}</th>
                  <th style={{ width: 130 }}>{tx("common.mening_rolim", undefined, "Mening rolim")}</th>
                  <th style={{ width: 140, textAlign: "right" }}>{tx("common.amallar", undefined, "Amallar")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredWorkspaces.map((w, idx) => (
                  <tr
                    key={w.id}
                    className="clickable"
                    onClick={() => setOpenWorkspaceSlug(w.slug)}
                  >
                    <td style={{ textAlign: "center", color: "var(--muted)", fontWeight: 600 }}>
                      {idx + 1}
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            background: w.color || "var(--accent)",
                            flexShrink: 0,
                          }}
                        />
                        <div style={{ minWidth: 0 }}>
                          <span
                            className="nowrap"
                            style={{
                              fontWeight: 650,
                              fontSize: 14,
                              color: "var(--accent)",
                              display: "inline-block",
                            }}
                          >
                            {w.name}
                          </span>
                          {w.description && (
                            <div
                              className="nowrap muted"
                              style={{ fontSize: 12, maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis" }}
                            >
                              {w.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="nowrap" style={{ fontSize: 13, fontWeight: 500 }}>
                        {w.owner.full_name}
                      </div>
                    </td>
                    <td style={{ textAlign: "center", fontWeight: 600, fontSize: 13 }}>
                      {w.project_count}
                    </td>
                    <td style={{ textAlign: "center", fontWeight: 600, fontSize: 13 }}>
                      {w.member_count}
                    </td>
                    <td>
                      <span className={`badge ${w.is_open ? "badge-ok" : "badge-warn"}`}>
                        {w.is_open ? tx("common.ochiq", undefined, "Ochiq") : tx("workspace_detail.yopiq", undefined, "Yopiq")}
                      </span>
                    </td>
                    <td>
                      {w.my_role ? (
                        <span className="badge badge-brand">{w.my_role}</span>
                      ) : (
                        <span className="muted" style={{ fontSize: 12 }}>
                          {tx("workspaces.azo_emas", undefined, "A'zo emas")}
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div className="row middle" style={{ justifyContent: "flex-end", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                        {w.my_role ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setOpenWorkspaceSlug(w.slug)}
                              style={{ padding: "4px 8px", fontSize: 12 }}
                            >
                              {tx("common.korish", undefined, "Ko'rish")}
                            </Button>
                            <LinkButton
                              variant="ghost"
                              size="sm"
                              {...toWorkspaceChat(w.slug)}
                              title={tx("common.suhbat", undefined, "Suhbat")}
                              style={{ padding: "4px 8px" }}
                            >
                              <IconChat size={13} />
                            </LinkButton>
                          </>
                        ) : (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={(e) => void handleDirectJoin(w, e)}
                            style={{ padding: "4px 10px", fontSize: 12 }}
                          >
                            {tx("common.qoshilish", undefined, "Qo'shilish")}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Workspace Detail Modal */}
      {openWorkspaceSlug && (
        <WorkspaceDetailModal
          slug={openWorkspaceSlug}
          onClose={() => setOpenWorkspaceSlug(null)}
          onUpdated={load}
        />
      )}

      {/* Join Code Modal */}
      {showJoinModal && (
        <div className="modal-overlay" style={{ zIndex: 99999 }} onClick={() => setShowJoinModal(false)}>
          <div
            className="modal-card"
            style={{ maxWidth: 460, width: "92vw" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: 16 }}>
                {tx("workspaces.qoshilish_kodi_bilan_qoshilish", undefined, "Kodi bilan qo'shilish")}
              </h3>
              <Button
                iconOnly
                variant="ghost"
                size="sm"
                onClick={() => setShowJoinModal(false)}
              >
                <IconClose size={16} />
              </Button>
            </div>
            <form onSubmit={handleJoinWithCode}>
              <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <ErrorMsg error={joinError} />
                <div className="field">
                  <label htmlFor={`${fid}-join-code`}>
                    {tx("workspaces.kod", undefined, "Qo'shilish kodi (Join Code)")}
                  </label>
                  <input
                    id={`${fid}-join-code`}
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="ABC123XYZ"
                    autoFocus
                    required
                    style={{ textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 650, fontSize: 15 }}
                  />
                  <small className="muted" style={{ marginTop: 4, display: "block" }}>
                    {tx("workspaces.kodni_kiritib_quyidagi_royxatdan_kerakli", undefined, "Ish maydoni egasidan olingan 8-10 xonali taklif kodini kiriting.")}
                  </small>
                </div>
              </div>
              <div className="modal-footer" style={{ borderTop: "1px solid var(--border)", padding: "12px 16px", display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <Button variant="ghost" type="button" onClick={() => setShowJoinModal(false)}>
                  {tx("common.bekor_qilish", undefined, "Bekor qilish")}
                </Button>
                <Button variant="primary" type="submit" disabled={joinBusy || !joinCode.trim()}>
                  {joinBusy ? tx("common.yuklanmoqda", undefined, "Yuklanmoqda...") : tx("common.qoshilish", undefined, "Qo'shilish")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
