import React, { useState } from "react";

/**
 * Sentiment badge component.
 * score > 0.2  → green  "Positive"
 * score < -0.2 → red    "Negative"
 * otherwise    → amber  "Neutral"
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
    <span className={className}>
      {label} ({score >= 0 ? "+" : ""}{score.toFixed(2)})
    </span>
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
  const [newsExpanded, setNewsExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [edgarExpanded, setEdgarExpanded] = useState(false);

  const {
    ticker,
    weight,
    risk_summary,
    key_risks,
    sentiment_score,
    news_headlines,
    edgar_excerpt,
  } = result;

  const displayedHeadlines = newsExpanded ? news_headlines : news_headlines.slice(0, 2);

  const hasValidEdgarData = edgar_excerpt &&
    !edgar_excerpt.toLowerCase().includes('unavailable') &&
    !edgar_excerpt.toLowerCase().includes('error') &&
    !edgar_excerpt.toLowerCase().includes('could not');

  return (
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

        {/* Sentiment badge — pushed to the right */}
        <SentimentBadge score={sentiment_score} />
      </div>

      {/* ── Risk summary ─────────────────────────────────────────────────── */}
      <p className="text-sm text-slate-300/90 leading-relaxed mb-5">
        {risk_summary}
      </p>

      {/* ── Key risks — clean bullet list, no inset box ───────────────────── */}
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

      {/* ── News headlines ───────────────────────────────────────────────── */}
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

      {/* ── Sources ──────────────────────────────────────────────────────── */}
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
    </article>
  );
}
