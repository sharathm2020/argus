import React, { useState } from "react";

/** Map conviction string to display color and short label. */
function convictionStyle(conviction) {
  if (conviction === "high")   return { color: "#F59E0B", label: "HIGH" };
  if (conviction === "medium") return { color: "#94a3b8", label: "MED"  };
  return                              { color: "#64748b", label: "LOW"  };
}

/** Convert snake_case hedge_type to a readable tag string. */
function hedgeTypeLabel(hedgeType) {
  const map = {
    inverse_etf:      "INVERSE ETF",
    safe_haven:       "SAFE HAVEN",
    sector_rotation:  "SECTOR ROTATION",
    options_concept:  "OPTIONS",
  };
  return map[hedgeType] ?? (hedgeType ?? "").toUpperCase().replace(/_/g, " ");
}

/**
 * HedgingSuggestions
 *
 * Displays AI-generated hedging suggestions at two levels:
 *   1. Per-position hedges (only for negative-sentiment / overvalued tickers)
 *   2. Portfolio-level recommendations
 *
 * Has a tab bar for "Position-Level Hedges" and "Options Protection".
 *
 * Props:
 *   hedgingSuggestions — hedging_suggestions dict from the API response
 *   results            — full results array from the API response
 */
export default function HedgingSuggestions({ hedgingSuggestions, results = [] }) {
  const [isHovered, setIsHovered] = useState(false);
  const [activeTab, setActiveTab] = useState("hedges");

  if (!hedgingSuggestions) return null;

  const { ticker_hedges = [], portfolio_recommendations = [], error } = hedgingSuggestions;

  // Build a lookup map: ticker → options_hedge (skip: true entries excluded)
  const optionsHedgeByTicker = Object.fromEntries(
    (results || [])
      .filter((r) => r.options_hedge && r.options_hedge.skip !== true)
      .map((r) => [r.ticker, r.options_hedge])
  );
  const optionsEntries = Object.entries(optionsHedgeByTicker);

  // Show a subtle unavailable state only when both sections are empty / errored
  const isUnavailable =
    error &&
    ticker_hedges.length === 0 &&
    portfolio_recommendations.length === 1 &&
    portfolio_recommendations[0].toLowerCase().includes("unable");

  // Positive confirmation: data present, no error, no hedges needed
  const isAllClear = !error && ticker_hedges.length === 0;

  // Shared tab button style (mirrors TickerCard.jsx tab bar)
  const tabStyle = (id) =>
    activeTab === id
      ? {
          color: "#F59E0B",
          borderBottom: "2px solid #F59E0B",
          marginBottom: "-1px",
          background: "transparent",
        }
      : {
          color: "rgba(148,163,184,0.5)",
          borderBottom: "2px solid transparent",
          marginBottom: "-1px",
          background: "transparent",
        };

  return (
    <section
      className="rounded-lg p-6 animate-fade-in-up transition-all duration-200 ease-in-out"
      style={{
        background: isHovered ? "rgba(40,60,100,0.95)" : "#131e38",
        borderTop: "4px solid #F59E0B",
        borderRight: isHovered ? "1px solid rgba(255,255,255,0.25)" : "1px solid rgba(71,85,105,0.5)",
        borderBottom: isHovered ? "1px solid rgba(255,255,255,0.25)" : "1px solid rgba(71,85,105,0.5)",
        borderLeft: isHovered ? "1px solid rgba(255,255,255,0.25)" : "1px solid rgba(71,85,105,0.5)",
        boxShadow: isHovered
          ? "0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.15)"
          : "0 1px 3px rgba(0,0,0,0.3)",
        transform: isHovered ? "translateY(-2px)" : "translateY(0)",
      }}
      aria-label="Hedging suggestions"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="mb-4">
        <h2 className="font-semibold text-slate-100 text-lg tracking-tight mb-1">
          🛡️ Hedging Suggestions
        </h2>
        <p className="text-xs text-slate-500 italic">
          AI-generated suggestions based on portfolio risk signals. Not financial advice.
        </p>
      </div>

      {/* ── Tab bar ─────────────────────────────────────────────────────── */}
      {!isUnavailable && !isAllClear && (
        <div
          className="flex gap-0 mb-5"
          style={{ borderBottom: "1px solid rgba(71,85,105,0.4)" }}
        >
          {[
            { id: "hedges",  label: "Position-Level Hedges" },
            { id: "options", label: "Options Protection" },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className="text-xs font-semibold px-4 py-2 transition-colors"
              style={tabStyle(id)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ── Unavailable state ───────────────────────────────────────────── */}
      {isUnavailable ? (
        <p className="text-sm text-slate-600 italic">Hedging analysis unavailable.</p>
      ) : isAllClear ? (
        /* ── All-clear positive state ────────────────────────────────────── */
        <div className="py-2">
          <p className="text-sm text-slate-300/90 mb-2">
            ✅ No hedging action needed. Portfolio sentiment and valuations look healthy
            across all positions.
          </p>
          <p className="text-xs text-slate-500 italic">
            Argus will flag hedging opportunities when risk signals are detected.
          </p>
        </div>
      ) : (
        <>
          {/* ════════════════════════════════════════════════════════════════
              TAB: Position-Level Hedges
          ════════════════════════════════════════════════════════════════ */}
          {activeTab === "hedges" && (
            <>
              {/* Section 1: Per-ticker hedges */}
              {ticker_hedges.length > 0 && (
                <div className="mb-6">
                  <div className="space-y-0">
                    {ticker_hedges.map((item, i) => {
                      // Backward compat: old format has hedge_instrument at item level
                      const hedges = item.hedges ?? [
                        {
                          rank: 1,
                          hedge_instrument: item.hedge_instrument,
                          hedge_type: null,
                          conviction: "high",
                          explanation: item.explanation,
                        },
                      ];

                      return (
                        <div key={item.ticker}>
                          <div className="py-3">
                            {/* Ticker badge */}
                            <span className="mono text-xs text-slate-400/70 bg-slate-700/50 border border-slate-600/40 rounded-full px-2.5 py-0.5 inline-block mb-3">
                              {item.ticker}
                            </span>

                            {/* Ranked hedges */}
                            <div className="space-y-0">
                              {hedges.map((hedge, hi) => {
                                const { color, label: convLabel } = convictionStyle(hedge.conviction);
                                const instrumentColor =
                                  hedge.rank === 1 ? "#e2e8f0"
                                  : hedge.rank === 2 ? "#94a3b8"
                                  : "#64748b";

                                return (
                                  <div key={hedge.rank}>
                                    <div className="py-2">
                                      {/* Rank + instrument + conviction + type */}
                                      <div className="flex items-center gap-2 flex-wrap mb-1">
                                        {/* Rank circle */}
                                        <span
                                          className="text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                                          style={{
                                            background: hedge.rank === 1 ? "rgba(245,158,11,0.15)" : "rgba(51,65,85,0.4)",
                                            color:      hedge.rank === 1 ? "#F59E0B" : "#94a3b8",
                                            border:     hedge.rank === 1 ? "1px solid rgba(245,158,11,0.3)" : "1px solid rgba(51,65,85,0.5)",
                                          }}
                                        >
                                          {hedge.rank}
                                        </span>
                                        <span className="text-slate-500 text-xs">→</span>
                                        {/* Instrument */}
                                        <span className="text-sm font-semibold" style={{ color: instrumentColor }}>
                                          {hedge.hedge_instrument}
                                        </span>
                                        {/* Conviction badge */}
                                        <span
                                          className="text-xs font-semibold px-1.5 py-0.5 rounded"
                                          style={{
                                            color,
                                            background: `${color}18`,
                                            border: `1px solid ${color}40`,
                                          }}
                                        >
                                          {convLabel}
                                        </span>
                                        {/* Hedge type tag */}
                                        {hedge.hedge_type && (
                                          <span className="text-xs font-medium" style={{ color: "#475569" }}>
                                            {hedgeTypeLabel(hedge.hedge_type)}
                                          </span>
                                        )}
                                      </div>
                                      {/* Explanation */}
                                      <p className="text-xs leading-relaxed pl-7" style={{ color: "rgba(148,163,184,0.65)" }}>
                                        {hedge.explanation}
                                      </p>
                                    </div>
                                    {/* Thin divider between hedges within same ticker */}
                                    {hi < hedges.length - 1 && (
                                      <div style={{ borderTop: "1px solid rgba(51,65,85,0.2)" }} />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Thicker divider between different tickers */}
                          {i < ticker_hedges.length - 1 && (
                            <div style={{ borderTop: "1px solid rgba(71,85,105,0.3)" }} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Section 2: Portfolio recommendations */}
              {portfolio_recommendations.length > 0 && (
                <div>
                  <h3
                    className="text-xs font-semibold uppercase tracking-wider mb-3"
                    style={{ color: "#F59E0B" }}
                  >
                    Portfolio-Level Recommendations
                  </h3>
                  <ul className="space-y-2">
                    {portfolio_recommendations.map((rec, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-sm text-slate-300/90">
                        <span
                          className="mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full"
                          style={{ background: "#F59E0B" }}
                          aria-hidden="true"
                        />
                        <span className="leading-relaxed">{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {/* ════════════════════════════════════════════════════════════════
              TAB: Options Protection
          ════════════════════════════════════════════════════════════════ */}
          {activeTab === "options" && (
            <div style={{ animation: "argus-fade-in 150ms ease-in-out" }}>
              {optionsEntries.length === 0 ? (
                <p className="text-sm text-slate-600 italic">
                  No options contracts found meeting liquidity and expiry criteria
                  for current portfolio positions.
                </p>
              ) : (
                <div className="space-y-4">
                  {optionsEntries.map(([ticker, oh], i) => {
                    const { color: convColor, label: convLabel } = convictionStyle(oh.conviction);
                    return (
                      <div key={ticker}>
                        {/* Ticker badge */}
                        <span className="mono text-xs text-slate-400/70 bg-slate-700/50 border border-slate-600/40 rounded-full px-2.5 py-0.5 inline-block mb-3">
                          {ticker}
                        </span>

                        {/* Options protection card */}
                        <div
                          className="rounded-lg px-4 py-3"
                          style={{
                            background: "rgba(2,8,20,0.5)",
                            border: "1px solid rgba(51,65,85,0.5)",
                          }}
                        >
                          {/* Card header: label + conviction */}
                          <div className="flex items-center gap-2 mb-3">
                            <span
                              className="text-xs font-semibold uppercase tracking-wider"
                              style={{ color: "#F59E0B" }}
                            >
                              Put Option
                            </span>
                            <span
                              className="text-xs font-semibold px-1.5 py-0.5 rounded"
                              style={{
                                color: convColor,
                                background: `${convColor}18`,
                                border: `1px solid ${convColor}40`,
                              }}
                            >
                              {convLabel}
                            </span>
                          </div>

                          {/* Contract details */}
                          <div className="flex flex-wrap gap-x-5 gap-y-1 mb-3">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-xs text-slate-500 uppercase tracking-wider">Strike</span>
                              <span className="text-sm font-semibold mono text-slate-200">
                                ${oh.recommended_strike?.toFixed(2) ?? "—"}
                              </span>
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-xs text-slate-500 uppercase tracking-wider">Expiry</span>
                              <span className="text-sm font-semibold mono text-slate-200">
                                {oh.recommended_expiry ?? "—"}
                              </span>
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-xs text-slate-500 uppercase tracking-wider">IV</span>
                              <span className="text-sm font-semibold mono text-slate-200">
                                {oh.implied_volatility != null ? `${oh.implied_volatility}%` : "—"}
                              </span>
                            </div>
                          </div>

                          {/* Rationale */}
                          <p
                            className="text-xs leading-relaxed mb-3"
                            style={{ color: "rgba(148,163,184,0.75)" }}
                          >
                            {oh.rationale}
                          </p>

                          {/* Disclaimer */}
                          <p className="text-xs italic" style={{ color: "#374151" }}>
                            Real contract data via yfinance/Yahoo Finance. Not financial advice.
                          </p>
                        </div>

                        {i < optionsEntries.length - 1 && (
                          <div className="mt-4" style={{ borderTop: "1px solid rgba(71,85,105,0.3)" }} />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Disclaimer ─────────────────────────────────────────────────── */}
      <p
        className="mt-5 text-slate-500/50 italic border-t border-slate-700/40 pt-4"
        style={{ fontSize: "0.75rem", lineHeight: "1.6" }}
      >
        Hedging suggestions are AI-generated for informational purposes only and do not
        constitute financial advice. Consult a qualified advisor before acting on any suggestion.
      </p>
    </section>
  );
}
