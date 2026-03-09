import React, { useState, useCallback } from "react";

const EMPTY_ROW = () => ({ id: Date.now() + Math.random(), ticker: "", weight: "" });

/**
 * PortfolioInput
 *
 * Renders a dynamic form for entering portfolio positions.
 * Validates weights in real time and calls onAnalyze(payload) on submit.
 *
 * Note: onAnalyze now returns quickly (fires a POST and transitions to
 * loading state immediately). The component does not await the full
 * analysis — App.jsx owns the loading / polling lifecycle.
 */
export default function PortfolioInput({ onAnalyze }) {
  const [rows, setRows] = useState([EMPTY_ROW()]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Derived state ──────────────────────────────────────────────────────

  const totalWeight = rows.reduce((sum, r) => {
    const w = parseFloat(r.weight);
    return sum + (isNaN(w) ? 0 : w);
  }, 0);

  const isWeightOver = totalWeight > 100.01;
  const isWeightReady = Math.abs(totalWeight - 100) < 0.01;

  const hasValidRows = rows.every(
    (r) => r.ticker.trim().length > 0 && r.weight !== "" && !isNaN(parseFloat(r.weight))
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

              {/* Weight input with % suffix */}
              <div className="relative">
                <input
                  type="number"
                  className={`input mono text-right w-full pr-8 ${
                    weightInvalid
                      ? "border-red-500 focus:border-red-400 focus:ring-red-500/30"
                      : ""
                  }`}
                  placeholder="0.00"
                  value={row.weight}
                  min="0.01"
                  max="100"
                  step="0.01"
                  onChange={(e) => updateRow(row.id, "weight", e.target.value)}
                  aria-label={`Weight for ticker ${idx + 1}`}
                  required
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs mono pointer-events-none select-none">
                  %
                </span>
              </div>

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
            {totalWeight.toFixed(2)}%
          </span>
        </div>
      </div>

      {/* Validation messages */}
      {isWeightOver && (
        <p className="text-xs text-red-400 mono">
          Weights exceed 100%. Please adjust allocations before submitting.
        </p>
      )}
      {!isWeightReady && !isWeightOver && totalWeight > 0 && (
        <p className="text-xs text-amber-400/80 mono">
          Weights must sum to exactly 100% (currently {totalWeight.toFixed(2)}%).
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
  );
}
