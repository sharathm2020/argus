import React, { useState, useCallback, useRef } from "react";

const EMPTY_ROW = () => ({ id: Date.now() + Math.random(), ticker: "", weight: "" });

// Feature tiles shown above the form
const FEATURE_PILLS = [
  { icon: "📄", label: "SEC 10-K Filings", description: "Risk factors pulled directly from EDGAR filings" },
  { icon: "📰", label: "Real-time News", description: "Live headlines from Alpaca's financial news feed" },
  { icon: "🤖", label: "GPT-4o Analysis", description: "AI synthesizes all signals into a weighted risk score" },
];

// ── Manual entry sub-component ────────────────────────────────────────────────

function ManualEntry({ onAnalyze }) {
  const [rows, setRows] = useState([EMPTY_ROW()]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const totalWeight = rows.reduce((sum, r) => {
    const w = parseFloat(r.weight);
    return sum + (isNaN(w) ? 0 : w);
  }, 0);

  const isWeightOver  = totalWeight > 100.01;
  const isWeightReady = Math.abs(totalWeight - 100) < 0.1;
  const hasValidRows  = rows.every(
    (r) => r.ticker.trim().length > 0 && r.weight !== "" && !isNaN(parseFloat(r.weight)) && parseFloat(r.weight) > 0
  );
  const canSubmit = hasValidRows && isWeightReady && !isSubmitting;

  const updateRow = useCallback((id, field, value) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }, []);
  const addRow    = useCallback(() => setRows((prev) => [...prev, EMPTY_ROW()]), []);
  const removeRow = useCallback(
    (id) => setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev)),
    []
  );

  const handleSubmit = useCallback(
    (e) => {
      e.preventDefault();
      if (!canSubmit) return;
      setIsSubmitting(true);
      onAnalyze({
        portfolio: rows.map((r) => ({
          ticker: r.ticker.trim().toUpperCase(),
          weight: parseFloat(r.weight) / 100,
        })),
      });
    },
    [rows, canSubmit, onAnalyze]
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-navy-800 rounded-lg p-6 space-y-5"
      style={{ border: "1px solid rgba(245,158,11,0.20)", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }}
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
            <div key={row.id} className="grid grid-cols-[1fr_160px_28px] gap-3 items-center animate-fade-in-up group">
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
              <input
                type="number"
                className={`input mono text-right w-full ${
                  weightInvalid ? "border-red-500 focus:border-red-400 focus:ring-red-500/30" : ""
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

      <p className="text-xs text-slate-500/70 mono px-1">
        Enter weights as whole numbers that sum to 100 — e.g. 30 = 30%
      </p>

      <button type="button" onClick={addRow} className="btn-ghost w-full text-center">
        + Add Ticker
      </button>

      {/* Weight summary bar */}
      <div className="bg-navy-700/60 border border-slate-700/40 rounded-lg p-4 flex items-center justify-between gap-4">
        <span className="text-xs text-slate-400/70">Total allocation</span>
        <div className="flex items-center gap-3 flex-1 justify-end">
          <div className="flex-1 max-w-[180px] rounded-full overflow-hidden bg-slate-700/80" style={{ height: "10px" }}>
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${Math.min(totalWeight, 100)}%`,
                background: isWeightOver ? "#EF4444" : "linear-gradient(to right, #F59E0B, #10B981)",
              }}
            />
          </div>
          <span
            className={`mono text-sm font-semibold tabular-nums w-16 text-right ${
              isWeightOver ? "text-red-400" : isWeightReady ? "text-emerald-400" : "text-slate-300"
            }`}
          >
            {totalWeight.toFixed(1)}%
          </span>
        </div>
      </div>

      {isWeightOver && (
        <p className="text-xs text-red-400 mono">Weights exceed 1.0. Please adjust allocations before submitting.</p>
      )}
      {!isWeightReady && !isWeightOver && totalWeight > 0 && (
        <p className="text-xs text-amber-400/80 mono">
          Weights must sum to 100% (currently {totalWeight.toFixed(1)}%).
        </p>
      )}

      <button type="submit" disabled={!canSubmit} className="btn-primary w-full py-3 text-base">
        {isSubmitting ? "Submitting…" : "Analyze Portfolio"}
      </button>
    </form>
  );
}

// ── Screenshot upload sub-component ──────────────────────────────────────────

function UploadScreenshot({ onAnalyze }) {
  const [dragOver,    setDragOver]    = useState(false);
  // imageFiles: array of {file, url} objects
  const [imageFiles,  setImageFiles]  = useState([]);
  const [parsing,     setParsing]     = useState(false);
  const [parseError,  setParseError]  = useState(null);
  // confirmed holdings: [{id, ticker, weight}]
  const [holdings,    setHoldings]    = useState(null);

  const fileInputRef = useRef(null);

  // Derived total for the confirmation table
  const confirmedTotal = holdings
    ? holdings.reduce((s, h) => s + (parseFloat(h.weight) || 0), 0)
    : 0;
  const totalReady = Math.abs(confirmedTotal - 100) < 0.1;

  // ── File selection helpers ────────────────────────────────────────────

  const acceptFiles = useCallback((fileList) => {
    const valid = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    if (valid.length === 0) return;
    setImageFiles(valid.map((f) => ({ file: f, url: URL.createObjectURL(f) })));
    setParseError(null);
    setHoldings(null);
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragOver(false);
      acceptFiles(e.dataTransfer.files);
    },
    [acceptFiles]
  );

  const handleFileInput = useCallback(
    (e) => acceptFiles(e.target.files),
    [acceptFiles]
  );

  const handleReupload = useCallback(() => {
    setImageFiles([]);
    setHoldings(null);
    setParseError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  // ── Parse via backend ─────────────────────────────────────────────────

  const handleParse = useCallback(async () => {
    if (!imageFiles.length) return;
    setParsing(true);
    setParseError(null);

    try {
      const formData = new FormData();
      imageFiles.forEach(({ file }) => formData.append("files", file));

      const res = await fetch("/api/parse-portfolio-image", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Could not parse image.");
      }

      setHoldings(
        data.holdings.map((h, i) => ({
          id: i,
          ticker: h.ticker,
          weight: String(h.weight),
        }))
      );
    } catch (err) {
      setParseError(err.message || "An unexpected error occurred.");
    } finally {
      setParsing(false);
    }
  }, [imageFiles]);

  // ── Confirmation table helpers ────────────────────────────────────────

  const updateHolding = useCallback((id, field, value) => {
    setHoldings((prev) => prev.map((h) => (h.id === id ? { ...h, [field]: value } : h)));
  }, []);

  const handleRunAnalysis = useCallback(() => {
    if (!holdings || !totalReady) return;
    onAnalyze({
      portfolio: holdings.map((h) => ({
        ticker: h.ticker.trim().toUpperCase(),
        weight: parseFloat(h.weight) / 100,
      })),
    });
  }, [holdings, totalReady, onAnalyze]);

  // ── Render ────────────────────────────────────────────────────────────

  // Confirmation table
  if (holdings) {
    return (
      <div
        className="rounded-lg p-6 space-y-5"
        style={{ border: "1px solid rgba(245,158,11,0.20)", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }}
      >
        <p className="text-sm text-slate-300">
          Review the extracted holdings below. You can edit any ticker or weight before running analysis.
        </p>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500/70 mono uppercase tracking-wider border-b border-slate-700/40">
                <th className="text-left py-2 pr-4">Ticker</th>
                <th className="text-right py-2 pr-4">Weight (%)</th>
                <th className="py-2 w-6" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {holdings.map((h) => (
                <tr key={h.id}>
                  <td className="py-2 pr-4">
                    <input
                      type="text"
                      className="input mono uppercase w-full"
                      value={h.ticker}
                      maxLength={5}
                      onChange={(e) => updateHolding(h.id, "ticker", e.target.value)}
                      aria-label="Ticker"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      type="number"
                      className="input mono text-right w-full"
                      value={h.weight}
                      min="0.01"
                      max="100"
                      step="0.01"
                      onChange={(e) => updateHolding(h.id, "weight", e.target.value)}
                      aria-label="Weight"
                    />
                  </td>
                  <td className="py-2 text-center">
                    <button
                      type="button"
                      onClick={() => setHoldings((prev) => prev.filter((x) => x.id !== h.id))}
                      className="text-slate-600 hover:text-red-400 transition-colors text-base leading-none"
                      aria-label="Remove row"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Live total */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400/70 mono">Total</span>
          <span
            className={`mono text-sm font-semibold tabular-nums ${
              totalReady ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {confirmedTotal.toFixed(2)}%
          </span>
        </div>
        {!totalReady && (
          <p className="text-xs text-red-400 mono">
            Weights must sum to 100% (currently {confirmedTotal.toFixed(2)}%).
          </p>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleReupload}
            className="btn-ghost flex-1"
          >
            Re-upload
          </button>
          <button
            type="button"
            disabled={!totalReady}
            onClick={handleRunAnalysis}
            className="btn-primary flex-1 py-3"
          >
            Run Analysis
          </button>
        </div>
      </div>
    );
  }

  // Upload zone
  return (
    <div
      className="rounded-lg p-6 space-y-5"
      style={{ border: "1px solid rgba(245,158,11,0.20)", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }}
    >
      {/* Drop zone */}
      <div
        className="rounded-lg p-8 text-center cursor-pointer transition-colors"
        style={{
          border: dragOver
            ? "2px dashed #F59E0B"
            : "2px dashed rgba(245,158,11,0.35)",
          background: dragOver ? "rgba(245,158,11,0.06)" : "rgba(13,21,40,0.6)",
        }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        aria-label="Upload portfolio screenshot"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileInput}
        />
        {imageFiles.length > 0 ? (
          <>
            <div className="flex flex-wrap gap-2 justify-center mb-3">
              {imageFiles.map(({ url }, i) => (
                <img
                  key={i}
                  src={url}
                  alt={`Screenshot ${i + 1}`}
                  className="rounded-md object-cover"
                  style={{ width: 64, height: 64 }}
                />
              ))}
            </div>
            <p className="text-xs text-slate-400 font-medium">
              {imageFiles.length} image{imageFiles.length !== 1 ? "s" : ""} selected
            </p>
          </>
        ) : (
          <>
            <div className="text-4xl mb-3" aria-hidden="true">📷</div>
            <p className="text-sm text-slate-300 font-medium">
              Drop your portfolio screenshots here, or click to browse
            </p>
          </>
        )}
        <p className="text-xs text-slate-500 mt-1">
          Upload one or more screenshots — Robinhood, Coinbase, and most brokerage apps supported
        </p>
      </div>

      {/* Error message */}
      {parseError && (
        <p className="text-xs text-red-400 mono">{parseError}</p>
      )}

      {/* Parse button */}
      {imageFiles.length > 0 && !parsing && (
        <button
          type="button"
          onClick={handleParse}
          className="btn-primary w-full py-3 text-base"
        >
          Parse Portfolio
        </button>
      )}

      {/* Inline spinner */}
      {parsing && (
        <div className="flex items-center justify-center gap-3 py-3">
          <svg
            className="animate-spin h-4 w-4 text-amber-400"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <span className="text-sm text-slate-400">Reading your portfolio...</span>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * PortfolioInput
 *
 * Two-tab interface: Manual Entry and Upload Screenshot.
 * Calls onAnalyze(payload) with a {portfolio: [...]} object when ready.
 */
export default function PortfolioInput({ onAnalyze }) {
  const [activeTab, setActiveTab] = useState("manual"); // "manual" | "upload"

  return (
    <div className="space-y-6">
      {/* ── Subtitle + feature tiles ────────────────────────────────────── */}
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

      {/* ── Tab switcher ────────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-slate-700/50">
        {[
          { key: "manual", label: "✏️ Manual Entry" },
          { key: "upload", label: "📷 Upload Screenshot" },
        ].map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className="px-4 py-2.5 text-sm font-medium transition-colors relative"
            style={{
              color: activeTab === key ? "#F59E0B" : "rgba(148,163,184,0.7)",
            }}
          >
            {label}
            {activeTab === key && (
              <span
                className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t"
                style={{ background: "#F59E0B" }}
              />
            )}
          </button>
        ))}
      </div>

      {/* ── Active tab content ───────────────────────────────────────────── */}
      {activeTab === "manual" ? (
        <ManualEntry onAnalyze={onAnalyze} />
      ) : (
        <UploadScreenshot onAnalyze={onAnalyze} />
      )}
    </div>
  );
}
