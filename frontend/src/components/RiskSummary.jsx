import React, { useState } from "react";
import CorrelationMatrix from "./CorrelationMatrix";

/**
 * Sentiment badge — same threshold logic as TickerCard, slightly larger for summary.
 */
function SentimentBadge({ score }) {
  let className = "badge-neutral";
  let label = "Neutral";

  if (score > 0.2) {
    className = "badge-positive";
    label = "Positive";
  } else if (score < -0.2) {
    className = "badge-negative";
    label = "Negative";
  }

  return (
    <span className={`${className} text-sm px-3 py-1`}>
      {label}&nbsp;
      <span className="opacity-80">
        ({score >= 0 ? "+" : ""}{score.toFixed(3)})
      </span>
    </span>
  );
}

/**
 * Horizontal -1 to +1 sentiment gauge.
 */
function SentimentGauge({ score }) {
  const pct = ((score + 1) / 2) * 100;

  return (
    <div>
      <div
        className="relative w-full rounded-full"
        style={{
          height: "12px",
          background: "linear-gradient(to right, #b91c1c, #F59E0B, #10b981)",
        }}
      >
        <div
          className="absolute top-1/2 -translate-y-1/2 rounded-full"
          style={{
            width: "20px",
            height: "20px",
            background: "#F59E0B",
            border: "2px solid white",
            boxShadow: "0 0 6px rgba(245,158,11,0.5)",
            left: `calc(${pct}% - 10px)`,
            transition: "left 0.7s ease",
          }}
        />
      </div>
      <div className="flex justify-between text-xs text-slate-500/70 mono mt-2">
        <span>Bearish −1.0</span>
        <span>Neutral 0.0</span>
        <span>Bullish +1.0</span>
      </div>
    </div>
  );
}

/** Single metric card used in the VaR row */
function MetricCard({ label, value, subtext, valueColor }) {
  return (
    <div
      className="rounded-lg p-3 flex flex-col gap-1"
      style={{ background: "rgba(2,8,20,0.5)", border: "1px solid rgba(51,65,85,0.4)" }}
    >
      <span className="text-xs text-slate-500 uppercase tracking-wider leading-none">
        {label}
      </span>
      <span
        className="text-sm font-semibold mono"
        style={{ color: valueColor ?? "#e2e8f0" }}
      >
        {value}
      </span>
      {subtext && (
        <span className="text-xs leading-snug" style={{ color: "#64748b" }}>
          {subtext}
        </span>
      )}
    </div>
  );
}

/**
 * VarTooltipIcon — amber "?" circle that shows an explanation tooltip on hover.
 */
function VarTooltipIcon() {
  return (
    <span className="relative group inline-flex items-center" style={{ cursor: "default" }}>
      {/* Icon */}
      <span
        className="inline-flex items-center justify-center rounded-full text-xs font-bold"
        style={{
          width: 16,
          height: 16,
          background: "rgba(245,158,11,0.15)",
          border: "1px solid rgba(245,158,11,0.4)",
          color: "#F59E0B",
          fontSize: "0.6rem",
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        ?
      </span>

      {/* Tooltip — appears on group hover */}
      <span
        className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20
                   opacity-0 group-hover:opacity-100 transition-opacity duration-150"
        style={{
          background: "#0f1929",
          border: "1px solid rgba(71,85,105,0.5)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          borderRadius: 8,
          padding: "10px 12px",
          maxWidth: 280,
          width: "max-content",
          color: "#e2e8f0",
          fontSize: "0.72rem",
          lineHeight: 1.55,
          whiteSpace: "normal",
        }}
      >
        Value at Risk (VaR) estimates the maximum expected daily loss at a
        given confidence level, based on 90 days of historical returns. 95%
        VaR means: on 19 out of 20 trading days, losses should not exceed this
        amount. These are statistical estimates assuming normal return
        distributions.
        {/* Downward arrow */}
        <span
          className="absolute left-1/2 -translate-x-1/2 top-full"
          style={{
            borderLeft: "5px solid transparent",
            borderRight: "5px solid transparent",
            borderTop: "5px solid #0f1929",
          }}
        />
      </span>
    </span>
  );
}

/**
 * RiskSummary
 *
 * Portfolio-level summary card — full width, distinct amber top border.
 *
 * Props:
 *   summary              — portfolio_summary string from the API
 *   overallSentiment     — overall_sentiment float from the API
 *   sectorConcentration  — sector_concentration dict from the API
 *   portfolioBeta        — portfolio_beta float (ARG-53)
 *   correlationMatrix    — correlation_matrix dict (ARG-54)
 *   var95                — var_95 float (ARG-59)
 *   var99                — var_99 float (ARG-59)
 *   annualizedVolatility — annualized_volatility float (ARG-59)
 *   isAdvanced           — boolean; hides beta/corr/VaR in Basic mode
 */
export default function RiskSummary({
  summary,
  overallSentiment,
  sectorConcentration,
  portfolioBeta,
  correlationMatrix,
  var95,
  var99,
  annualizedVolatility,
  isAdvanced = false,
}) {
  const [isHovered, setIsHovered] = useState(false);

  // ARG-53: beta color and description
  function betaColor(b) {
    if (b < 0.8)  return "#4ade80";
    if (b <= 1.2) return "#F59E0B";
    return "#f87171";
  }
  function betaDescription(b) {
    if (b < 0.8)  return "Your portfolio moves less than the broader market.";
    if (b <= 1.2) return "Your portfolio closely tracks the broader market.";
    return "Your portfolio amplifies market moves — higher upside and downside.";
  }

  // ARG-59: VaR / volatility color helpers
  function varColor(v) {
    if (v == null) return "#94a3b8";
    if (v > 0.03)  return "#f87171";
    if (v >= 0.01) return "#F59E0B";
    return "#4ade80";
  }
  function volColor(v) {
    if (v == null) return "#94a3b8";
    if (v > 0.30)  return "#f87171";
    if (v >= 0.15) return "#F59E0B";
    return "#4ade80";
  }

  const showVaR = isAdvanced && var95 != null;

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
      aria-label="Portfolio risk summary"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-semibold text-slate-100 text-lg tracking-tight">
          Portfolio Summary
        </h2>
        <SentimentBadge score={overallSentiment} />
      </div>

      {/* ── Sentiment gauge ─────────────────────────────────────────────── */}
      <div className="mb-7">
        <SentimentGauge score={overallSentiment} />
      </div>

      {/* ── Sector concentration ────────────────────────────────────────── */}
      {sectorConcentration?.has_flags && (
        <div className="mb-7">
          <div className="flex flex-wrap gap-2 mb-3">
            {Object.entries(sectorConcentration.breakdown).map(([sector, weight]) => {
              const flagged = weight >= 40;
              return (
                <span
                  key={sector}
                  className="text-xs font-medium px-2.5 py-1 rounded-full"
                  style={
                    flagged
                      ? { background: "#F59E0B", color: "#0f172a" }
                      : {
                          background: "rgba(30,41,59,0.7)",
                          color: "rgba(148,163,184,0.6)",
                          border: "1px solid rgba(71,85,105,0.4)",
                        }
                  }
                >
                  {sector} {weight.toFixed(1)}%
                </span>
              );
            })}
          </div>
          <div className="space-y-1">
            {sectorConcentration.flags.map((flag) => (
              <p key={flag.sector} className="text-xs" style={{ color: "#F59E0B" }}>
                ⚠️ {flag.message}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* ── ARG-53: Portfolio Beta (advanced only) ───────────────────────── */}
      {isAdvanced && portfolioBeta != null && (
        <div
          className="mb-7 rounded-lg p-4"
          style={{
            background: "rgba(2,8,20,0.5)",
            border: "1px solid rgba(51,65,85,0.4)",
          }}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Portfolio Beta
            </span>
            <span
              className="text-lg font-bold mono"
              style={{ color: betaColor(portfolioBeta) }}
            >
              {portfolioBeta.toFixed(2)}x
            </span>
          </div>
          <p className="text-xs" style={{ color: "#64748b" }}>
            {betaDescription(portfolioBeta)}
          </p>
        </div>
      )}

      {/* ── ARG-54: Correlation Matrix (advanced only) ───────────────────── */}
      {isAdvanced && <CorrelationMatrix data={correlationMatrix} />}

      {/* ── ARG-59: VaR / Volatility metrics (advanced only) ────────────── */}
      {showVaR && (
        <div style={{ marginTop: "1.5rem" }}>
          <div className="mb-3 flex items-center gap-2">
            <h4 className="text-xs font-semibold text-slate-300">
              Portfolio Risk Metrics
            </h4>
            <VarTooltipIcon />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <MetricCard
              label="1-Day VaR (95%)"
              value={`−${(var95 * 100).toFixed(2)}%`}
              subtext="Estimated max daily loss, 19 out of 20 days"
              valueColor={varColor(var95)}
            />
            <MetricCard
              label="1-Day VaR (99%)"
              value={`−${(var99 * 100).toFixed(2)}%`}
              subtext="Estimated max daily loss, 99 out of 100 days"
              valueColor={varColor(var99)}
            />
            <MetricCard
              label="Annualized Volatility"
              value={`${(annualizedVolatility * 100).toFixed(1)}%`}
              subtext="Portfolio return standard deviation (annualized)"
              valueColor={volColor(annualizedVolatility)}
            />
          </div>

          <p
            className="mt-3 italic"
            style={{ fontSize: "0.7rem", color: "#475569", lineHeight: 1.5 }}
          >
            VaR estimates are based on 90-day historical returns and assume
            normal distribution. Actual losses may exceed these estimates.
          </p>
        </div>
      )}

      {/* ── Prose summary ───────────────────────────────────────────────── */}
      <p
        className="text-slate-300/90 mt-7"
        style={{ fontSize: "1rem", lineHeight: "1.7" }}
      >
        {summary}
      </p>

      {/* ── Disclaimer ──────────────────────────────────────────────────── */}
      <p
        className="mt-5 text-slate-500/50 italic border-t border-slate-700/40 pt-4"
        style={{ fontSize: "0.75rem", lineHeight: "1.6" }}
      >
        This analysis is generated by AI and is for informational purposes only.
        It does not constitute financial advice. Always consult a qualified financial advisor
        before making investment decisions.
      </p>
    </section>
  );
}
