import React, { useState, useCallback } from "react";

const EMPTY_ROW = () => ({ id: Date.now() + Math.random(), ticker: "", weight: "" });

// Feature tiles shown above the form
const FEATURE_PILLS = [
  { icon: "📄", label: "SEC 10-K Filings", description: "Risk factors pulled directly from EDGAR filings" },
  { icon: "📰", label: "Real-time News", description: "Live headlines from Alpaca's financial news feed" },
  { icon: "🤖", label: "GPT-4o Analysis", description: "AI synthesizes all signals into a weighted risk score" },
];

/**
 * PortfolioInput
 *
 * Renders a dynamic form for entering portfolio positions.
 * Weights are entered as decimals (e.g. 0.30 = 30%) and must sum to 1.0.
 * Validates weights in real time and calls onAnalyze(payload) on submit.
 *
 * Note: onAnalyze transitions App.jsx to LOADING state immediately,
 * unmounting this component, so we do not await it.
 */
export default function PortfolioInput({ onAnalyze }) {
  const [rows, setRows] = useState([EMPTY_ROW()]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Derived state ──────────────────────────────────────────────────────

  const totalWeight = rows.reduce((sum, r) => {
    const w = parseFloat(r.weight);
    return sum + (isNaN(w) ? 0 : w);
  }, 0);

  const isWeightOver  = totalWeight > 100.01;
  const isWeightReady = Math.abs(totalWeight - 100) < 0.1;

  const hasValidRows = rows.every(
    (r) => r.ticker.trim().length > 0 && r.weight !== "" && !isNaN(parseFloat(r.weight)) && parseFloat(r.weight) > 0
  );

  const canSubmit = hasValidRows && isWeightReady && !isSubmitting;

  // ── Handlers ───────────────────────────────────────────────────────────

  const updateRow = useCallback((id, field, value) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  }, []);

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, EMPTY_ROW()]);
  }, []);

  const removeRow = useCallback((id) => {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  }, []);

  const handleSubmit = useCallback(
    (e) => {
      e.preventDefault();
      if (!canSubmit) return;

      setIsSubmitting(true);
      const payload = {
        portfolio: rows.map((r) => ({
          ticker: r.ticker.trim().toUpperCase(),
          weight: parseFloat(r.weight) / 100,
        })),
      };

      // onAnalyze transitions App.jsx to LOADING state immediately,
      // unmounting this component, so we don't await it.
      onAnalyze(payload);
    },
    [rows, canSubmit, onAnalyze]
  );

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Subtitle + feature tiles ─────────────────────────────────────── */}
      <div>
        <p className="text-slate-400 text-base mt-2 mb-8">
          AI-powered risk intelligence for your portfolio.
        </p>

        <div className="grid grid-cols-3 gap-4 mb-8">
          {FEATURE_PILLS.map(({ icon, label, description }) => (
            <div
              key={label}
              className="rounded-lg p-4 text-center"
              style={{
                background: "rgba(13,21,40,0.6)",
                border: "1px solid rgba(245,158,11,0.2)",
                borderTop: "2px solid rgba(245,158,11,0.6)",
              }}
            >
              <div className="text-2xl mb-2" aria-hidden="true">{icon}</div>
              <div className="text-sm font-semibold text-white">{label}</div>
              <div className="text-xs text-slate-400 mt-1">{description}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Input form ──────────────────────────────────────────────────── */}
      <form
        onSubmit={handleSubmit}
        className="bg-navy-800 rounded-lg p-6 space-y-5"
        style={{
          border: "1px solid rgba(245,158,11,0.20)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
        }}
      >
        {/* Column headers */}
        <div className="grid grid-cols-[1fr_160px_28px] gap-3 items-center text-xs text-slate-500/70 mono uppercase tracking-wider px-1">
          <span>Ticker</span>
          <span>Weight</span>
          <span />
        </div>

        {/* Ticker rows */}
        <div className="space-y-3">
          {rows.map((row, idx) => {
            const weightNum = parseFloat(row.weight);
            const weightInvalid =
              row.weight !== "" && (isNaN(weightNum) || weightNum <= 0 || weightNum > 100);

            return (
              <div
                key={row.id}
                className="grid grid-cols-[1fr_160px_28px] gap-3 items-center animate-fade-in-up group"
              >
                {/* Ticker input */}
                <input
                  type="text"
                  className="input mono uppercase"
                  placeholder="e.g. AAPL"
                  value={row.ticker}
                  maxLength={5}
                  onChange={(e) => updateRow(row.id, "ticker", e.target.value)}
                  aria-label={`Ticker ${idx + 1}`}
                  required
                />

                {/* Weight input — percentage 1-100 range */}
                <input
                  type="number"
                  className={`input mono text-right w-full ${
                    weightInvalid
                      ? "border-red-500 focus:border-red-400 focus:ring-red-500/30"
                      : ""
                  }`}
                  placeholder="e.g. 30"
                  value={row.weight}
                  min="1"
                  max="100"
                  step="1"
                  onChange={(e) => updateRow(row.id, "weight", e.target.value)}
                  aria-label={`Weight for ticker ${idx + 1}`}
                  required
                />

                {/* Remove row button — subtle, only visible on row hover */}
                <button
                  type="button"
                  onClick={() => removeRow(row.id)}
                  disabled={rows.length === 1}
                  className="w-7 h-7 rounded-md text-slate-600 opacity-0 group-hover:opacity-100
                             hover:text-red-400 disabled:opacity-0 disabled:cursor-not-allowed
                             transition-all duration-150 flex items-center justify-center text-base leading-none"
                  aria-label="Remove row"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>

        {/* Weight format helper */}
        <p className="text-xs text-slate-500/70 mono px-1">
          Enter weights as whole numbers that sum to 100 — e.g. 30 = 30%
        </p>

        {/* Add ticker button */}
        <button
          type="button"
          onClick={addRow}
          className="btn-ghost w-full text-center"
        >
          + Add Ticker
        </button>

        {/* Weight summary bar */}
        <div className="bg-navy-700/60 border border-slate-700/40 rounded-lg p-4 flex items-center justify-between gap-4">
          <span className="text-xs text-slate-400/70">Total allocation</span>
          <div className="flex items-center gap-3 flex-1 justify-end">
            {/* Progress bar — 10px tall, amber→green gradient, red if over */}
            <div
              className="flex-1 max-w-[180px] rounded-full overflow-hidden bg-slate-700/80"
              style={{ height: "10px" }}
            >
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(totalWeight, 100)}%`,
                  background: isWeightOver
                    ? "#EF4444"
                    : "linear-gradient(to right, #F59E0B, #10B981)",
                }}
              />
            </div>
            <span
              className={`mono text-sm font-semibold tabular-nums w-16 text-right ${
                isWeightOver
                  ? "text-red-400"
                  : isWeightReady
                  ? "text-emerald-400"
                  : "text-slate-300"
              }`}
            >
              {totalWeight.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Validation messages */}
        {isWeightOver && (
          <p className="text-xs text-red-400 mono">
            Weights exceed 1.0. Please adjust allocations before submitting.
          </p>
        )}
        {!isWeightReady && !isWeightOver && totalWeight > 0 && (
          <p className="text-xs text-amber-400/80 mono">
            Weights must sum to 100% (currently {totalWeight.toFixed(1)}%).
          </p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={!canSubmit}
          className="btn-primary w-full py-3 text-base"
        >
          {isSubmitting ? "Submitting…" : "Analyze Portfolio"}
        </button>
      </form>
    </div>
  );
}
