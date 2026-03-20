import React from "react";

/**
 * CompsView
 *
 * Renders a comparable-company analysis table showing valuation multiples
 * for the subject ticker vs. its FMP peer group medians.
 *
 * Props:
 *   compsData — the comps object from the API (available: true guaranteed by parent)
 *   ticker    — subject ticker symbol string
 */
export default function CompsView({ compsData, ticker }) {
  const { peers_used = [], multiples = {} } = compsData;

  const rows = Object.values(multiples);

  // Overall signal: count how many multiples show premium vs discount
  const premiumCount = rows.filter(
    (m) => m.premium_discount_pct != null && m.premium_discount_pct > 0
  ).length;
  const discountCount = rows.filter(
    (m) => m.premium_discount_pct != null && m.premium_discount_pct < 0
  ).length;

  let overallSignal = "Mixed valuation signals vs peers";
  let signalColor = "#94A3B8";
  if (premiumCount >= 3) {
    overallSignal = "Trading at a premium to peers";
    signalColor = "#F87171";
  } else if (discountCount >= 3) {
    overallSignal = "Trading at a discount to peers";
    signalColor = "#4ADE80";
  }

  function fmt(val) {
    if (val == null) return "—";
    return `${val.toFixed(1)}x`;
  }

  function PremDiscBadge({ pct }) {
    if (pct == null) {
      return (
        <span className="text-xs text-slate-600">—</span>
      );
    }
    const isPremium = pct > 0;
    const style = isPremium
      ? {
          color: "#F87171",
          background: "rgba(248,113,113,0.1)",
          border: "1px solid rgba(248,113,113,0.3)",
        }
      : {
          color: "#4ADE80",
          background: "rgba(74,222,128,0.1)",
          border: "1px solid rgba(74,222,128,0.3)",
        };
    const text = isPremium
      ? `+${Math.abs(pct).toFixed(1)}% premium`
      : `${Math.abs(pct).toFixed(1)}% discount`;

    return (
      <span
        className="text-xs font-semibold px-2 py-0.5 rounded-full"
        style={style}
      >
        {text}
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div>
        <h4
          className="text-xs font-semibold uppercase tracking-wider mb-1"
          style={{ color: "#F59E0B" }}
        >
          Comparable Company Analysis
        </h4>
        {peers_used.length > 0 && (
          <p className="text-xs text-slate-500">
            Peers: {peers_used.join(", ")}
          </p>
        )}
      </div>

      {/* Multiples table */}
      <div
        className="rounded-lg overflow-hidden"
        style={{ border: "1px solid rgba(51,65,85,0.5)" }}
      >
        {/* Table header */}
        <div
          className="grid text-xs font-semibold uppercase tracking-wider px-4 py-2"
          style={{
            gridTemplateColumns: "1fr 1fr 1fr 1.6fr",
            background: "rgba(2,8,20,0.7)",
            color: "#64748B",
            borderBottom: "1px solid rgba(51,65,85,0.5)",
          }}
        >
          <span>Multiple</span>
          <span>{ticker}</span>
          <span>Peer Median</span>
          <span>vs. Peers</span>
        </div>

        {/* Table rows */}
        {rows.map((m, i) => (
          <div
            key={m.label}
            className="grid items-center px-4 py-3 text-sm"
            style={{
              gridTemplateColumns: "1fr 1fr 1fr 1.6fr",
              background: i % 2 === 0 ? "rgba(2,8,20,0.4)" : "rgba(13,21,40,0.4)",
              borderBottom:
                i < rows.length - 1
                  ? "1px solid rgba(51,65,85,0.3)"
                  : "none",
            }}
          >
            <span className="text-xs font-semibold text-slate-400">
              {m.label}
            </span>
            <span className="mono text-slate-200 text-xs">
              {fmt(m.ticker_value)}
            </span>
            <span className="mono text-slate-400 text-xs">
              {fmt(m.peer_median)}
            </span>
            <span>
              <PremDiscBadge pct={m.premium_discount_pct} />
            </span>
          </div>
        ))}
      </div>

      {/* Overall signal */}
      <div
        className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold"
        style={{
          background: "rgba(2,8,20,0.5)",
          border: "1px solid rgba(51,65,85,0.4)",
          color: signalColor,
        }}
      >
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: signalColor }}
        />
        {overallSignal}
      </div>

      {/* Disclaimer */}
      <p className="text-xs italic" style={{ color: "#475569" }}>
        Comps based on FMP peer data. For informational purposes only.
      </p>
    </div>
  );
}
