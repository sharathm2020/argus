import React, { useEffect, useState, useCallback } from "react";
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

// ── Constants ─────────────────────────────────────────────────────────────────

const RANGE_OPTIONS = [
  { label: "7d",  days: 7  },
  { label: "30d", days: 30 },
  { label: "All", days: null },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  if (score > 0.2)  return "#4ade80";   // green
  if (score < -0.2) return "#f87171";   // red
  return "#F59E0B";                      // amber / neutral
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }) {
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

// ── Modal ─────────────────────────────────────────────────────────────────────

/**
 * SentimentTrendModal
 *
 * Props:
 *   ticker  — ticker symbol string
 *   onClose — called when the user dismisses the modal
 */
export default function SentimentTrendModal({ ticker, onClose }) {
  const [history, setHistory]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [range, setRange]       = useState("All");

  // Close on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Fetch on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/sentiment-history/${ticker}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        // Sort ascending so the chart reads left → right chronologically
        const sorted = [...(data.history ?? [])].sort(
          (a, b) => new Date(a.analyzed_at) - new Date(b.analyzed_at)
        );
        setHistory(sorted);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [ticker]);

  // Derive filtered data for the selected range
  const selectedDays = RANGE_OPTIONS.find((o) => o.label === range)?.days ?? null;
  const chartData = filterByDays(history, selectedDays).map((row) => ({
    ...row,
    date: formatDate(row.analyzed_at),
  }));

  // Dynamic Y-domain with a small pad so the line never kisses the edges
  const scores = chartData.map((r) => r.sentiment_score);
  const yMin = scores.length ? Math.min(-0.2, Math.min(...scores) - 0.05) : -1;
  const yMax = scores.length ? Math.max(0.2,  Math.max(...scores) + 0.05) : 1;

  return (
    /* Overlay */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(2px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Panel */}
      <div
        className="relative w-full rounded-xl p-6 flex flex-col"
        style={{
          maxWidth: "680px",
          maxHeight: "90vh",
          background: "#0d1528",
          border: "1px solid rgba(71,85,105,0.55)",
          borderTop: "4px solid #F59E0B",
          boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
          margin: "0 1rem",
        }}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="font-semibold text-slate-100 text-lg tracking-tight">
              Sentiment Trend
              <span
                className="mono font-bold ml-2"
                style={{ color: "#F59E0B" }}
              >
                {ticker}
              </span>
            </h2>
            <p className="text-xs text-slate-500 italic mt-0.5">
              Historical DistilBERT sentiment scores over time
            </p>
          </div>
          {/* Close button */}
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-200 transition-colors ml-4 shrink-0"
            style={{ fontSize: "1.25rem", lineHeight: 1 }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* ── Time range toggle ────────────────────────────────────────────── */}
        <div className="flex gap-1 mb-5">
          {RANGE_OPTIONS.map(({ label }) => (
            <button
              key={label}
              onClick={() => setRange(label)}
              className="text-xs font-semibold px-3 py-1 rounded transition-colors"
              style={
                range === label
                  ? { background: "rgba(245,158,11,0.15)", color: "#F59E0B", border: "1px solid rgba(245,158,11,0.35)" }
                  : { background: "rgba(30,41,59,0.5)",    color: "#64748b", border: "1px solid rgba(51,65,85,0.4)"   }
              }
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Chart area ──────────────────────────────────────────────────── */}
        <div className="flex-1" style={{ minHeight: "260px" }}>
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-slate-500 animate-pulse">Loading history…</p>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-slate-600 italic">
                Could not load sentiment history.
              </p>
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex items-center justify-center h-full text-center px-8">
              <div>
                <p className="text-sm text-slate-400 mb-2">
                  No sentiment history yet for{" "}
                  <span className="mono font-semibold" style={{ color: "#F59E0B" }}>
                    {ticker}
                  </span>
                  .
                </p>
                <p className="text-xs text-slate-600 italic">
                  Analyze this ticker to start building history.
                </p>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
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
                {/* Zero line */}
                <ReferenceLine y={0} stroke="rgba(100,116,139,0.35)" strokeDasharray="4 4" />
                {/* +0.2 / -0.2 sentiment threshold bands */}
                <ReferenceLine y={0.2}  stroke="rgba(74,222,128,0.2)"  strokeDasharray="3 5" />
                <ReferenceLine y={-0.2} stroke="rgba(248,113,113,0.2)" strokeDasharray="3 5" />

                <Tooltip content={<CustomTooltip />} />

                {/* Sentiment score line */}
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
                {/* Confidence as a dashed secondary line */}
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

        {/* ── Legend ──────────────────────────────────────────────────────── */}
        {!loading && !error && chartData.length > 0 && (
          <div className="flex items-center gap-5 mt-4 pt-4" style={{ borderTop: "1px solid rgba(51,65,85,0.35)" }}>
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

        {/* ── Disclaimer ──────────────────────────────────────────────────── */}
        <p
          className="mt-4 text-slate-600 italic"
          style={{ fontSize: "0.7rem", lineHeight: "1.5" }}
        >
          Scores generated by Argus's custom DistilBERT model. For informational purposes only.
        </p>
      </div>
    </div>
  );
}
