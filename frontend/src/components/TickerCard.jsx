import React, { useState } from "react";
import SentimentTrendModal from "./SentimentTrendModal";

/**
 * Sentiment badge component.
 * label="mixed"  → purple "Mixed"
 * score > 0.2    → green  "Positive"
 * score < -0.2   → red    "Negative"
 * otherwise      → amber  "Neutral"
 */
function SentimentBadge({ score, confidenceScore, label: sentimentLabel }) {
  const isMixed = sentimentLabel === "mixed";

  let className = "badge-neutral";
  let label = "Neutral";

  if (isMixed) {
    label = "Mixed";
  } else if (score > 0.2) {
    className = "badge-positive";
    label = "Positive";
  } else if (score < -0.2) {
    className = "badge-negative";
    label = "Negative";
  }

  const detail =
    confidenceScore != null
      ? `${(confidenceScore * 100).toFixed(1)}%`
      : `${score >= 0 ? "+" : ""}${score.toFixed(2)}`;

  return (
    <span className="relative group inline-block">
      <span
        className={className}
        style={isMixed ? { backgroundColor: "#7C3AED", color: "white" } : undefined}
      >
        {label} ({detail})
      </span>
      {/* Tooltip */}
      <span
        className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 rounded text-xs text-white leading-snug opacity-0 group-hover:opacity-100 transition-opacity duration-150 whitespace-normal z-10"
        style={{
          background: "#1e293b",
          boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          maxWidth: "220px",
          width: "max-content",
        }}
        role="tooltip"
      >
        Confidence score from Argus&apos;s custom-trained DistilBERT financial sentiment model
        {/* Downward arrow */}
        <span
          className="absolute left-1/2 -translate-x-1/2 top-full"
          style={{
            borderLeft: "5px solid transparent",
            borderRight: "5px solid transparent",
            borderTop: "5px solid #1e293b",
          }}
        />
      </span>
    </span>
  );
}

/** Format a large dollar amount as $X.XXB / $X.XXM / $X,XXX */
function formatCashflow(value) {
  if (value == null) return "N/A";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(2)}T`;
  if (abs >= 1_000_000_000)     return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000)         return `$${(value / 1_000_000).toFixed(2)}M`;
  return `$${value.toLocaleString()}`;
}

/** Verdict badge: green / red / amber */
function VerdictBadge({ verdict }) {
  const styles = {
    Undervalued:  { color: "#4ade80", border: "1px solid rgba(74,222,128,0.4)",  background: "rgba(74,222,128,0.1)"  },
    Overvalued:   { color: "#f87171", border: "1px solid rgba(248,113,113,0.4)", background: "rgba(248,113,113,0.1)" },
    "Fairly Valued": { color: "#F59E0B", border: "1px solid rgba(245,158,11,0.4)",  background: "rgba(245,158,11,0.1)"  },
  };
  const s = styles[verdict] ?? styles["Fairly Valued"];
  return (
    <span
      className="text-xs font-semibold px-2.5 py-1 rounded-full"
      style={s}
    >
      {verdict}
    </span>
  );
}

/** Single stat cell used in the DCF overview grid */
function StatCell({ label, value, valueStyle }) {
  return (
    <div
      className="rounded-lg p-3 flex flex-col gap-1"
      style={{ background: "rgba(2,8,20,0.5)", border: "1px solid rgba(51,65,85,0.4)" }}
    >
      <span className="text-xs text-slate-500 uppercase tracking-wider">{label}</span>
      <span className="text-sm font-semibold mono" style={valueStyle ?? { color: "#e2e8f0" }}>
        {value}
      </span>
    </div>
  );
}

/**
 * TickerCard
 *
 * Displays the full risk analysis for a single portfolio position.
 * Card has a 4px left amber border accent and equal-height stretch in the grid.
 *
 * Props:
 *   result — TickerRiskResult object from the API response
 */
export default function TickerCard({ result }) {
  const [activeTab, setActiveTab] = useState("risk");
  const [newsExpanded, setNewsExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [edgarExpanded, setEdgarExpanded] = useState(false);
  const [dcfInputsExpanded, setDcfInputsExpanded] = useState(false);
  const [showTrendModal, setShowTrendModal] = useState(false);

  const {
    ticker,
    weight,
    risk_summary,
    key_risks,
    sentiment_score,
    confidence_score,
    news_headlines,
    edgar_excerpt,
    dcf_data,
  } = result;

  const displayedHeadlines = newsExpanded ? news_headlines : news_headlines.slice(0, 2);

  const hasValidEdgarData = edgar_excerpt &&
    !edgar_excerpt.toLowerCase().includes('unavailable') &&
    !edgar_excerpt.toLowerCase().includes('error') &&
    !edgar_excerpt.toLowerCase().includes('could not');

  const dcfAvailable = dcf_data && dcf_data.available;

  return (
    <>
    <article
      className="rounded-lg p-6 animate-fade-in-up flex flex-col transition-all duration-200 ease-in-out"
      style={{
        background: isHovered ? "rgba(40,60,100,0.95)" : "rgba(13,21,40,1)",
        border: isHovered
          ? "1px solid rgba(255,255,255,0.25)"
          : "1px solid rgba(71,85,105,0.6)",
        boxShadow: isHovered
          ? "inset 4px 0 0 0 #F59E0B, 0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.15)"
          : "inset 4px 0 0 0 #F59E0B, 0 1px 3px rgba(0,0,0,0.3)",
        transform: isHovered ? "translateY(-2px)" : "translateY(0)",
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* ── Card header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3 min-w-0">
          {/* Ticker symbol */}
          <h3
            className="mono font-bold text-slate-100 tracking-tight shrink-0"
            style={{ fontSize: "1.5rem" }}
          >
            {ticker}
          </h3>
          {/* Weight pill */}
          <span className="mono text-xs text-slate-400/70 bg-slate-700/50 border border-slate-600/40 rounded-full px-2.5 py-0.5 shrink-0">
            {(weight * 100).toFixed(1)}%
          </span>
        </div>

        {/* Sentiment badge + trend link — pushed to the right */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          <SentimentBadge score={sentiment_score} confidenceScore={confidence_score} label={result.sentiment_label} />
          <button
            onClick={() => setShowTrendModal(true)}
            className="text-xs font-medium transition-colors"
            style={{ color: "#F59E0B" }}
            onMouseEnter={(e) => (e.target.style.color = "#FCD34D")}
            onMouseLeave={(e) => (e.target.style.color = "#F59E0B")}
          >
            View Trend →
          </button>
        </div>
      </div>

      {/* ── Tab bar ──────────────────────────────────────────────────────── */}
      <div
        className="flex gap-0 mb-5"
        style={{ borderBottom: "1px solid rgba(71,85,105,0.4)" }}
      >
        {[
          { id: "risk", label: "Risk Analysis" },
          { id: "dcf",  label: "DCF Valuation" },
        ].map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className="text-xs font-semibold px-4 py-2 transition-colors"
            style={
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
                  }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab content — key-based remount triggers CSS fade-in ─────────── */}
      {/* ── Risk Analysis tab ─────────────────────────────────────────────── */}
      {activeTab === "risk" && (
        <div
          key="risk"
          style={{ animation: "argus-fade-in 150ms ease-in-out" }}
        >
          {/* Risk summary */}
          <p className="text-sm text-slate-300/90 leading-relaxed mb-5">
            {risk_summary}
          </p>

          {/* Key risks — clean bullet list, no inset box */}
          <div className="mb-5">
            <h4 className="text-xs font-semibold text-slate-400/70 uppercase tracking-wider mb-3">
              Key Risks
            </h4>
            <ul className="space-y-2">
              {key_risks.map((risk, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-slate-300/90">
                  {/* Amber bullet marker */}
                  <span
                    className="mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full"
                    style={{ background: "#F59E0B" }}
                    aria-hidden="true"
                  />
                  <span className="leading-relaxed">{risk}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* News headlines */}
          <div className="mt-auto">
            {news_headlines.length > 0 ? (
              <div>
                <h4 className="text-xs font-semibold text-slate-400/70 uppercase tracking-wider mb-2">
                  Recent News
                </h4>
                <ul className="space-y-2">
                  {displayedHeadlines.map((headline, i) => (
                    <li
                      key={i}
                      className="text-xs text-slate-400/80 flex items-start gap-2"
                      style={{ lineHeight: "1.6" }}
                    >
                      <span className="text-slate-600 shrink-0 mt-0.5 mono">–</span>
                      <span>{headline}</span>
                    </li>
                  ))}
                </ul>

                {/* Expand / collapse toggle — amber text */}
                {news_headlines.length > 2 && (
                  <button
                    onClick={() => setNewsExpanded((v) => !v)}
                    className="mt-2 text-xs font-medium transition-colors"
                    style={{ color: "#F59E0B" }}
                    onMouseEnter={(e) => (e.target.style.color = "#FCD34D")}
                    onMouseLeave={(e) => (e.target.style.color = "#F59E0B")}
                  >
                    {newsExpanded
                      ? "Show less"
                      : `+${news_headlines.length - 2} more headline${
                          news_headlines.length - 2 !== 1 ? "s" : ""
                        }`}
                  </button>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-600 italic">No recent news available for this ticker.</p>
            )}
          </div>

          {/* Sources */}
          <div className="mt-5 pt-4" style={{ borderTop: "1px solid rgba(71,85,105,0.35)" }}>
            {/* Source badge row */}
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <span className="text-xs text-slate-500 px-2 py-0.5 rounded-full border border-slate-700/50 bg-slate-800/50">
                📰 News
              </span>
              <span
                className="text-xs px-2 py-0.5 rounded-full border"
                style={
                  hasValidEdgarData
                    ? {
                        color: "rgba(148,163,184,0.8)",
                        borderColor: "rgba(71,85,105,0.5)",
                        background: "rgba(30,41,59,0.5)",
                      }
                    : {
                        color: "rgba(100,116,139,0.5)",
                        borderColor: "rgba(71,85,105,0.25)",
                        background: "transparent",
                        textDecoration: "line-through",
                      }
                }
              >
                📄 SEC 10-K
              </span>
              <span className="text-xs text-slate-500 px-2 py-0.5 rounded-full border border-slate-700/50 bg-slate-800/50">
                📊 Fundamentals
              </span>
            </div>

            {/* No 10-K notice */}
            {!hasValidEdgarData && (
              <p className="text-xs text-slate-600 italic mb-2">
                No 10-K filing found for this ticker.
              </p>
            )}

            {/* Collapsible 10-K excerpt */}
            {hasValidEdgarData && (
              <div>
                <button
                  onClick={() => setEdgarExpanded((v) => !v)}
                  className="flex items-center gap-1.5 text-xs text-slate-400/70 hover:text-slate-300/90 transition-colors"
                >
                  <span className="mono text-slate-500" style={{ fontSize: "0.6rem" }}>
                    {edgarExpanded ? "▼" : "▶"}
                  </span>
                  10-K Risk Factors
                </button>

                {edgarExpanded && (
                  <div
                    className="mt-2 p-3 rounded text-xs leading-relaxed"
                    style={{
                      background: "rgba(2,8,20,0.7)",
                      border: "1px solid rgba(51,65,85,0.5)",
                      color: "rgba(148,163,184,0.75)",
                      fontFamily: "monospace",
                    }}
                  >
                    {edgar_excerpt}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── DCF Valuation tab ────────────────────────────────────────────── */}
      {activeTab === "dcf" && (
        <div
          key="dcf"
          className="flex flex-col gap-4"
          style={{ animation: "argus-fade-in 150ms ease-in-out" }}
        >
          {!dcfAvailable ? (
            /* Unavailable state */
            <div
              className="rounded-lg p-4 text-sm"
              style={{
                background: "rgba(2,8,20,0.5)",
                border: "1px solid rgba(51,65,85,0.4)",
              }}
            >
              <p className="text-slate-400 mb-1">DCF analysis not available for this asset.</p>
              {dcf_data?.reason && (
                <p className="text-xs text-slate-600 italic">{dcf_data.reason}</p>
              )}
            </div>
          ) : (
            <>
              {/* Verdict + overview */}
              <div className="flex items-center gap-3 flex-wrap">
                <VerdictBadge verdict={dcf_data.verdict} />
                <span className="text-xs text-slate-500">based on 5-year DCF model</span>
              </div>

              {/* Key numbers grid */}
              <div className="grid grid-cols-2 gap-3">
                <StatCell
                  label="Current Price"
                  value={`$${dcf_data.current_price.toFixed(2)}`}
                />
                <StatCell
                  label="Intrinsic Value"
                  value={`$${dcf_data.intrinsic_value.toFixed(2)}`}
                />
                <StatCell
                  label="Margin of Safety"
                  value={`${dcf_data.margin_of_safety >= 0 ? "+" : ""}${dcf_data.margin_of_safety.toFixed(1)}%`}
                  valueStyle={{
                    color: dcf_data.margin_of_safety >= 0 ? "#4ade80" : "#f87171",
                  }}
                />
              </div>

              {/* Collapsible inputs */}
              <div className="mt-1">
                <button
                  onClick={() => setDcfInputsExpanded((v) => !v)}
                  className="flex items-center gap-1.5 text-xs text-slate-400/70 hover:text-slate-300/90 transition-colors"
                >
                  <span className="mono text-slate-500" style={{ fontSize: "0.6rem" }}>
                    {dcfInputsExpanded ? "▼" : "▶"}
                  </span>
                  How we calculated this
                </button>

                {dcfInputsExpanded && (
                  <div
                    className="mt-3 rounded-lg p-4 space-y-2"
                    style={{
                      background: "rgba(2,8,20,0.7)",
                      border: "1px solid rgba(51,65,85,0.5)",
                    }}
                  >
                    {[
                      ["Free Cash Flow",         formatCashflow(dcf_data.inputs.free_cash_flow)],
                      ["Revenue Growth Rate",    `${(dcf_data.inputs.growth_rate * 100).toFixed(1)}%`],
                      ["Discount Rate (WACC)",   `${(dcf_data.inputs.discount_rate * 100).toFixed(1)}%`],
                      ["Terminal Growth Rate",   `${(dcf_data.inputs.terminal_growth_rate * 100).toFixed(1)}%`],
                      ["Projection Years",       String(dcf_data.inputs.projection_years)],
                    ].map(([label, value]) => (
                      <div key={label} className="flex justify-between items-center text-xs">
                        <span className="text-slate-500">{label}</span>
                        <span className="mono text-slate-300">{value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </article>

    {/* Sentiment trend modal — rendered outside the article so it isn't clipped */}
    {showTrendModal && (
      <SentimentTrendModal
        ticker={ticker}
        onClose={() => setShowTrendModal(false)}
      />
    )}
  </>
  );
}
