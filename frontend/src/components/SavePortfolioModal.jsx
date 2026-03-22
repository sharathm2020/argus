import React, { useState, useEffect, useCallback } from "react";

/**
 * SavePortfolioModal
 *
 * Allows the user to name and save the current portfolio to Supabase.
 *
 * Props:
 *   isOpen    — boolean
 *   onClose   — () => void
 *   tickers   — string[]   ticker symbols from the current analysis
 *   weights   — {[ticker]: number}  fractional weights (0–1) keyed by ticker
 *   session   — Supabase session object (for access_token)
 *   onSaved   — (msg: string) => void  called with success message on save
 */
export default function SavePortfolioModal({ isOpen, onClose, tickers = [], weights = {}, session, onSaved }) {
  const [name, setName]           = useState("");
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState("");

  useEffect(() => {
    if (isOpen) {
      setName("");
      setError("");
      setSaving(false);
    }
  }, [isOpen]);

  const handleKeyDown = useCallback(
    (e) => { if (e.key === "Escape") onClose(); },
    [onClose]
  );
  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  async function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Please enter a portfolio name.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/portfolios", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ name: trimmedName, tickers, weights }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Error ${res.status}`);
      }
      onSaved?.("Portfolio saved!");
      onClose();
    } catch (err) {
      setError(err.message || "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.65)" }}
      onClick={onClose}
    >
      <div
        className="relative rounded-xl p-7 w-full max-w-sm mx-4"
        style={{
          background: "#0f1929",
          border: "1px solid rgba(71,85,105,0.5)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 transition-colors text-lg leading-none"
          aria-label="Close"
        >
          ✕
        </button>

        <h2 className="font-semibold text-slate-100 text-base mb-5">Save Portfolio</h2>

        {/* Name input */}
        <div className="mb-4">
          <label className="block text-xs text-slate-400 mb-1.5 font-medium">Portfolio Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. My Tech Portfolio"
            autoFocus
            className="w-full rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none transition-colors"
            style={{ background: "rgba(2,8,20,0.6)", border: "1px solid rgba(71,85,105,0.5)" }}
            onFocus={(e) => (e.target.style.borderColor = "rgba(245,158,11,0.5)")}
            onBlur={(e)  => (e.target.style.borderColor = "rgba(71,85,105,0.5)")}
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
          />
        </div>

        {/* Ticker pills (read-only) */}
        <div className="mb-5">
          <p className="text-xs text-slate-500 mb-2">Tickers</p>
          <div className="flex flex-wrap gap-1.5">
            {tickers.map((t) => (
              <span
                key={t}
                className="mono text-xs px-2.5 py-1 rounded-full"
                style={{ background: "rgba(71,85,105,0.3)", color: "#94a3b8", border: "1px solid rgba(71,85,105,0.4)" }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        {error && <p className="text-xs text-red-400 mb-4">{error}</p>}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors"
            style={{ color: "rgba(148,163,184,0.7)", border: "1px solid rgba(71,85,105,0.4)", background: "transparent" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all"
            style={{
              background: saving ? "rgba(245,158,11,0.1)" : "rgba(245,158,11,0.2)",
              color: saving ? "rgba(245,158,11,0.4)" : "#F59E0B",
              border: "1px solid rgba(245,158,11,0.3)",
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
