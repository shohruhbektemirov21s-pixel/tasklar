export function KpiCardSkeleton() {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: "16px 20px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        boxShadow: "var(--shadow-xs)",
      }}
    >
      <div
        className="skeleton-box"
        style={{ width: 46, height: 46, borderRadius: "50%", flexShrink: 0 }}
      />
      <div style={{ flex: 1 }}>
        <div className="skeleton-box" style={{ width: "65%", height: 14, marginBottom: 8 }} />
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <div className="skeleton-box" style={{ width: 48, height: 26 }} />
          <div className="skeleton-box" style={{ width: 36, height: 14 }} />
        </div>
      </div>
    </div>
  );
}

export function TableRowSkeleton({ rowNum }: { rowNum: number }) {
  return (
    <tr style={{ borderBottom: "1px solid var(--border-muted)" }}>
      <td style={{ textAlign: "center", padding: "16px 18px" }}>
        <span style={{ fontSize: 13, color: "var(--subtle)", fontWeight: 600 }}>{rowNum}</span>
      </td>
      <td style={{ padding: "16px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="skeleton-box" style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="skeleton-box" style={{ width: "80%", height: 15, marginBottom: 6 }} />
            <div className="skeleton-box" style={{ width: "50%", height: 12 }} />
          </div>
        </div>
      </td>
      <td style={{ padding: "16px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className="skeleton-box" style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="skeleton-box" style={{ width: "75%", height: 14, marginBottom: 6 }} />
            <div className="skeleton-box" style={{ width: "55%", height: 12 }} />
          </div>
        </div>
      </td>
      <td style={{ padding: "16px 18px" }}>
        <div className="skeleton-box" style={{ width: 110, height: 14, marginBottom: 5 }} />
        <div className="skeleton-box" style={{ width: 70, height: 12 }} />
      </td>
      <td style={{ padding: "16px 18px" }}>
        <div className="skeleton-box" style={{ width: "90%", height: 14 }} />
      </td>
      <td style={{ padding: "16px 18px" }}>
        <div className="skeleton-box" style={{ width: 85, height: 14, marginBottom: 5 }} />
        <div className="skeleton-box" style={{ width: 65, height: 12 }} />
      </td>
      <td style={{ padding: "16px 18px" }}>
        <div className="skeleton-box" style={{ width: 95, height: 24, borderRadius: 9999 }} />
      </td>
      <td style={{ textAlign: "right", padding: "16px 18px" }}>
        <div className="skeleton-box" style={{ width: 28, height: 20, marginLeft: "auto", borderRadius: 4 }} />
      </td>
    </tr>
  );
}
