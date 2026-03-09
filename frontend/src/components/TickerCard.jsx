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

  const {
    ticker,
    weight,
    risk_summary,
    key_risks,
    sentiment_score,
    news_headlines,
  } = result;

  const displayedHeadlines = newsExpanded ? news_headlines : news_headlines.slice(0, 2);

  return (
    <article
      className="bg-navy-800 rounded-lg p-6 animate-fade-in-up flex flex-col"
      style={{
        border: "1px solid rgba(71,85,105,0.6)",
        /* inset box-shadow creates a reliable 4px left accent regardless of border-radius corner blending */
        boxShadow: "inset 4px 0 0 0 #F59E0B, 0 1px 3px rgba(0,0,0,0.3)",
      }}
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
    </article>
  );
}
