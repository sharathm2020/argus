import React, { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import CompsView from "./CompsView";
import SensitivityTable from "./SensitivityTable";

// ── Sentiment trend helpers ────────────────────────────────────────────────────

const RANGE_OPTIONS = [
  { label: "7d",  days: 7  },
  { label: "30d", days: 30 },
  { label: "All", days: null },
];

function filterByDays(history, days) {
  if (!days) return history;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return history.filter((row) => new Date(row.analyzed_at) >= cutoff);
}

function formatDate(isoString) {
  const d = new Date(isoString);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date} ${time}`;
}

function scoreColor(score) {
  if (score > 0.2)  return "#4ade80";
  if (score < -0.2) return "#f87171";
  return "#F59E0B";
}

function TrendTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs"
      style={{
        background: "#0d1528",
        border: "1px solid rgba(71,85,105,0.6)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
        minWidth: "140px",
      }}
    >
      <p className="text-slate-400 mb-1.5">{row.date}</p>
      <p style={{ color: scoreColor(row.sentiment_score) }}>
        Score: {row.sentiment_score >= 0 ? "+" : ""}
        {row.sentiment_score.toFixed(2)}
      </p>
      {row.confidence != null && (
        <p className="text-slate-400">
          Confidence: {(row.confidence * 100).toFixed(1)}%
        </p>
      )}
      {row.sentiment_label && (
        <p className="text-slate-500 capitalize mt-1">{row.sentiment_label}</p>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

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
export default function TickerCard({ result, isAdvanced = false }) {
  const [activeTab, setActiveTab] = useState("risk");

  // If advanced mode is turned off while DCF tab is active, fall back to risk
  React.useEffect(() => {
    if (!isAdvanced && activeTab === "dcf") {
      setActiveTab("risk");
    }
  }, [isAdvanced, activeTab]);
  const [newsExpanded, setNewsExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [edgarExpanded, setEdgarExpanded] = useState(false);
  const [dcfInputsExpanded, setDcfInputsExpanded] = useState(false);

  // Sentiment trend tab state
  const [trendHistory, setTrendHistory] = useState([]);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendError, setTrendError] = useState(null);
  const [trendRange, setTrendRange] = useState("All");
  const [trendFetched, setTrendFetched] = useState(false);

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
    asset_type,
    comps_data,
  } = result;

  const showCompsTab = asset_type === "equity" && comps_data?.available === true;

  // Fetch sentiment history when the trend tab is first activated
  useEffect(() => {
    if (activeTab !== "trend" || trendFetched) return;
    let cancelled = false;
    setTrendLoading(true);
    setTrendError(null);

    fetch(`/api/sentiment-history/${ticker}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        const sorted = [...(data.history ?? [])].sort(
          (a, b) => new Date(a.analyzed_at) - new Date(b.analyzed_at)
        );
        setTrendHistory(sorted);
        setTrendFetched(true);
      })
      .catch((err) => {
        if (!cancelled) setTrendError(err.message);
      })
      .finally(() => {
        if (!cancelled) setTrendLoading(false);
      });

    return () => { cancelled = true; };
  }, [activeTab, ticker, trendFetched]);

  // Derived chart data
  const selectedDays = RANGE_OPTIONS.find((o) => o.label === trendRange)?.days ?? null;
  const chartData = filterByDays(trendHistory, selectedDays).map((row) => ({
    ...row,
    date: formatDate(row.analyzed_at),
  }));
  const scores = chartData.map((r) => r.sentiment_score);
  const yMin = scores.length ? Math.min(-0.2, Math.min(...scores) - 0.05) : -1;
  const yMax = scores.length ? Math.max(0.2,  Math.max(...scores) + 0.05) : 1;

  const assetTypeBadge = asset_type === "crypto"
    ? { label: "Crypto",  style: { color: "#F59E0B", borderColor: "rgba(245,158,11,0.4)",  background: "rgba(245,158,11,0.08)"  } }
    : asset_type === "etf"
    ? { label: "ETF",     style: { color: "#60A5FA", borderColor: "rgba(96,165,250,0.4)",  background: "rgba(96,165,250,0.08)"  } }
    : { label: "Equity",  style: { color: "#94A3B8", borderColor: "rgba(148,163,184,0.3)", background: "rgba(148,163,184,0.06)" } };

  const displayedHeadlines = newsExpanded ? news_headlines : news_headlines.slice(0, 2);

  const hasValidEdgarData = edgar_excerpt &&
    !edgar_excerpt.toLowerCase().includes('unavailable') &&
    !edgar_excerpt.toLowerCase().includes('error') &&
    !edgar_excerpt.toLowerCase().includes('could not');

  const dcfAvailable = dcf_data && dcf_data.available;

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
          {/* Asset type badge */}
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full border shrink-0"
            style={assetTypeBadge.style}
          >
            {assetTypeBadge.label}
          </span>
        </div>

        {/* Sentiment badge — pushed to the right */}
        <div className="shrink-0">
          <SentimentBadge score={sentiment_score} confidenceScore={confidence_score} label={result.sentiment_label} />
        </div>
      </div>

      {/* ── Tab bar ──────────────────────────────────────────────────────── */}
      <div
        className="flex gap-0 mb-5"
        style={{ borderBottom: "1px solid rgba(71,85,105,0.4)" }}
      >
        {[
          { id: "risk",  label: "Risk Analysis" },
          ...(isAdvanced ? [{ id: "dcf", label: "DCF Valuation" }] : []),
          ...(showCompsTab ? [{ id: "comps", label: "Comps" }] : []),
          { id: "trend", label: "Sentiment Trend" },
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
              {dcf_data?.insufficient_data ? (
                <>
                  <p className="text-slate-400 mb-1">
                    DCF valuation unavailable — insufficient financial data for {ticker}.
                  </p>
                  <p className="text-xs text-slate-600 italic">
                    This is common for recently listed companies, SPACs, or non-standard reporting entities.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-slate-400 mb-1">DCF analysis not available for this asset.</p>
                  {dcf_data?.reason && (
                    <p className="text-xs text-slate-600 italic">{dcf_data.reason}</p>
                  )}
                </>
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

              {/* Sensitivity table */}
              <SensitivityTable data={dcf_data?.sensitivity_table} />

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
                      ["Free Cash Flow",          formatCashflow(dcf_data.inputs.free_cash_flow)],
                      ["Revenue Growth Rate",     `${(dcf_data.inputs.growth_rate * 100).toFixed(1)}%`],
                      ["Discount Rate (CAPM)",    `${(dcf_data.inputs.discount_rate * 100).toFixed(1)}%`],
                      ...(dcf_data.inputs.beta != null ? [["Beta", dcf_data.inputs.beta.toFixed(2)]] : []),
                      ["Terminal Growth Rate",    `${(dcf_data.inputs.terminal_growth_rate * 100).toFixed(1)}%`],
                      ["Projection Years",        String(dcf_data.inputs.projection_years)],
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

      {/* ── Comps tab ────────────────────────────────────────────────────── */}
      {activeTab === "comps" && showCompsTab && (
        <div
          key="comps"
          style={{ animation: "argus-fade-in 150ms ease-in-out" }}
        >
          <CompsView compsData={comps_data} ticker={ticker} />
        </div>
      )}

      {/* ── Sentiment Trend tab ──────────────────────────────────────────── */}
      {activeTab === "trend" && (
        <div
          key="trend"
          style={{ animation: "argus-fade-in 150ms ease-in-out" }}
        >
          {/* Time range toggle */}
          <div className="flex gap-1 mb-4">
            {RANGE_OPTIONS.map(({ label }) => (
              <button
                key={label}
                onClick={() => setTrendRange(label)}
                className="text-xs font-semibold px-3 py-1 rounded transition-colors"
                style={
                  trendRange === label
                    ? { background: "rgba(245,158,11,0.15)", color: "#F59E0B", border: "1px solid rgba(245,158,11,0.35)" }
                    : { background: "rgba(30,41,59,0.5)",    color: "#64748b", border: "1px solid rgba(51,65,85,0.4)"   }
                }
              >
                {label}
              </button>
            ))}
          </div>

          {/* Chart area */}
          <div style={{ minHeight: "220px" }}>
            {trendLoading ? (
              <div className="flex items-center justify-center" style={{ height: "220px" }}>
                <p className="text-sm text-slate-500 animate-pulse">Loading history…</p>
              </div>
            ) : trendError ? (
              <div className="flex items-center justify-center" style={{ height: "220px" }}>
                <p className="text-sm text-slate-600 italic">Could not load sentiment history.</p>
              </div>
            ) : chartData.length === 0 ? (
              <div className="flex items-center justify-center text-center px-4" style={{ height: "220px" }}>
                <div>
                  <p className="text-sm text-slate-400 mb-2">
                    No sentiment history yet for{" "}
                    <span className="mono font-semibold" style={{ color: "#F59E0B" }}>{ticker}</span>.
                  </p>
                  <p className="text-xs text-slate-600 italic">Analyze this ticker to start building history.</p>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: -8 }}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(51,65,85,0.4)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#64748b", fontSize: 11 }}
                    axisLine={{ stroke: "rgba(51,65,85,0.5)" }}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    domain={[yMin, yMax]}
                    tickCount={5}
                    tick={{ fill: "#64748b", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => v.toFixed(1)}
                  />
                  <ReferenceLine y={0}    stroke="rgba(100,116,139,0.35)" strokeDasharray="4 4" />
                  <ReferenceLine y={0.2}  stroke="rgba(74,222,128,0.2)"   strokeDasharray="3 5" />
                  <ReferenceLine y={-0.2} stroke="rgba(248,113,113,0.2)"  strokeDasharray="3 5" />
                  <Tooltip content={<TrendTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="sentiment_score"
                    stroke="#F59E0B"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#F59E0B", strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: "#F59E0B", stroke: "white", strokeWidth: 1.5 }}
                    isAnimationActive={true}
                    animationDuration={500}
                  />
                  <Line
                    type="monotone"
                    dataKey="confidence"
                    stroke="#94A3B8"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                    activeDot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Legend */}
          {!trendLoading && !trendError && chartData.length > 0 && (
            <div className="flex items-center gap-5 mt-3 pt-3" style={{ borderTop: "1px solid rgba(51,65,85,0.35)" }}>
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-6 h-0.5" style={{ background: "#F59E0B" }} />
                <span className="text-xs text-slate-500">Sentiment score</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block w-6 h-0.5"
                  style={{ background: "rgba(148,163,184,0.4)", borderTop: "1px dashed rgba(148,163,184,0.4)" }}
                />
                <span className="text-xs text-slate-500">Confidence</span>
              </div>
              <span className="text-xs text-slate-600 ml-auto">
                {chartData.length} data point{chartData.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}

          {/* Disclaimer */}
          <p
            className="mt-3 text-slate-600 italic"
            style={{ fontSize: "0.7rem", lineHeight: "1.5" }}
          >
            Scores generated by Argus's custom DistilBERT model. For informational purposes only.
          </p>
        </div>
      )}
    </article>
  );
}
