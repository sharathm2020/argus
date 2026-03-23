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
  const {
    peers_used = [],
    multiples = {},
    revenue_growth,
    peer_revenue_growth_median,
    rev_growth_vs_peers,
  } = compsData;

  const rows = Object.values(multiples);

  const hasRevGrowth =
    revenue_growth != null || peer_revenue_growth_median != null;

  const totalRows = rows.length + (hasRevGrowth ? 1 : 0);

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

  function fmtPct(val) {
    if (val == null) return "—";
    const sign = val >= 0 ? "+" : "";
    return `${sign}${(val * 100).toFixed(1)}%`;
  }

  function rowStyle(i, total) {
    return {
      gridTemplateColumns: "1fr 1fr 1fr 1.6fr",
      background: i % 2 === 0 ? "rgba(2,8,20,0.4)" : "rgba(13,21,40,0.4)",
      borderBottom:
        i < total - 1 ? "1px solid rgba(51,65,85,0.3)" : "none",
    };
  }

  function PremDiscBadge({ pct, threshold = 0 }) {
    if (pct == null) {
      return <span className="text-xs text-slate-600">—</span>;
    }
    const isPremium = pct > threshold;
    const isDiscount = pct < -threshold;
    if (!isPremium && !isDiscount) {
      return (
        <span
          className="text-xs font-semibold px-2 py-0.5 rounded-full"
          style={{
            color: "#F59E0B",
            background: "rgba(245,158,11,0.1)",
            border: "1px solid rgba(245,158,11,0.3)",
          }}
        >
          In-line
        </span>
      );
    }
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

  function RevGrowthBadge({ diff }) {
    if (diff == null) return <span className="text-xs text-slate-600">—</span>;
    if (diff > 0.10) {
      return (
        <span
          className="text-xs font-semibold px-2 py-0.5 rounded-full"
          style={{
            color: "#4ADE80",
            background: "rgba(74,222,128,0.1)",
            border: "1px solid rgba(74,222,128,0.3)",
          }}
        >
          High Growth
        </span>
      );
    }
    if (diff < -0.10) {
      return (
        <span
          className="text-xs font-semibold px-2 py-0.5 rounded-full"
          style={{
            color: "#F87171",
            background: "rgba(248,113,113,0.1)",
            border: "1px solid rgba(248,113,113,0.3)",
          }}
        >
          Low Growth
        </span>
      );
    }
    return (
      <span
        className="text-xs font-semibold px-2 py-0.5 rounded-full"
        style={{
          color: "#F59E0B",
          background: "rgba(245,158,11,0.1)",
          border: "1px solid rgba(245,158,11,0.3)",
        }}
      >
        In-line
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

        {/* Multiples rows */}
        {rows.map((m, i) => (
          <div
            key={m.label}
            className="grid items-center px-4 py-3 text-sm"
            style={rowStyle(i, totalRows)}
          >
            <span className="text-xs font-semibold text-slate-400">
              {m.label}
              {m.note && (
                <span className="block text-slate-600 font-normal normal-case tracking-normal" style={{ fontSize: "0.65rem" }}>
                  {m.note}
                </span>
              )}
            </span>
            <span className="mono text-slate-200 text-xs">
              {fmt(m.ticker_value)}
            </span>
            <span className="mono text-slate-400 text-xs">
              {fmt(m.peer_median)}
            </span>
            <span>
              <PremDiscBadge
                pct={m.premium_discount_pct}
                threshold={m.badge_threshold ?? 0}
              />
            </span>
          </div>
        ))}

        {/* Revenue growth row */}
        {hasRevGrowth && (
          <div
            className="grid items-center px-4 py-3 text-sm"
            style={rowStyle(rows.length, totalRows)}
          >
            <span className="text-xs font-semibold text-slate-400">Rev Growth</span>
            <span
              className="mono text-xs font-semibold"
              style={{
                color:
                  revenue_growth == null
                    ? "#64748b"
                    : revenue_growth > 0
                    ? "#4ade80"
                    : "#f87171",
              }}
            >
              {fmtPct(revenue_growth)}
            </span>
            <span className="mono text-slate-400 text-xs">
              {fmtPct(peer_revenue_growth_median)}
            </span>
            <span>
              <RevGrowthBadge diff={rev_growth_vs_peers} />
            </span>
          </div>
        )}
      </div>

      {/* Revenue growth contextual note */}
      {hasRevGrowth && (
        <p className="text-xs text-slate-600">
          Revenue growth shown to contextualize valuation multiples.
        </p>
      )}

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
