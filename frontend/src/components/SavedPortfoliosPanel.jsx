import React, { useState, useEffect, useCallback } from "react";

/**
 * SavedPortfoliosPanel
 *
 * Full-screen modal panel listing the user's saved portfolios.
 *
 * Props:
 *   isOpen           — boolean
 *   onClose          — () => void
 *   session          — Supabase session (for access_token)
 *   onLoadPortfolio  — (payload: {portfolio: [{ticker, weight}]}) => void
 */
export default function SavedPortfoliosPanel({ isOpen, onClose, session, onLoadPortfolio }) {
  const [portfolios, setPortfolios]     = useState([]);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null); // portfolio id pending confirm

  const authHeader = session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};

  const fetchPortfolios = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/portfolios", { headers: authHeader });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      setPortfolios(data.portfolios || []);
    } catch (err) {
      setError("Could not load portfolios. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (isOpen) fetchPortfolios();
  }, [isOpen, fetchPortfolios]);

  const handleKeyDown = useCallback(
    (e) => { if (e.key === "Escape") { setConfirmDelete(null); onClose(); } },
    [onClose]
  );
  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  async function handleDelete(id) {
    try {
      const res = await fetch(`/api/portfolios/${id}`, {
        method: "DELETE",
        headers: authHeader,
      });
      if (!res.ok && res.status !== 204) throw new Error(`Error ${res.status}`);
      setPortfolios((prev) => prev.filter((p) => p.id !== id));
    } catch {
      setError("Failed to delete portfolio.");
    } finally {
      setConfirmDelete(null);
    }
  }

  function handleLoad(portfolio) {
    const tickers = portfolio.tickers || [];
    const weights = portfolio.weights || {};
    const payload = {
      portfolio: tickers.map((ticker) => ({
        ticker,
        weight: weights[ticker] ?? 1 / tickers.length,
      })),
    };
    onLoadPortfolio(payload);
    onClose();
  }

  function formatDate(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16"
      style={{ background: "rgba(0,0,0,0.65)" }}
      onClick={onClose}
    >
      <div
        className="relative rounded-xl w-full max-w-lg mx-4 flex flex-col"
        style={{
          background: "#0f1929",
          border: "1px solid rgba(71,85,105,0.5)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
          maxHeight: "calc(100vh - 8rem)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/40 shrink-0">
          <h2 className="font-semibold text-slate-100 text-base">My Portfolios</h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 transition-colors text-lg leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-4">
          {loading && (
            <p className="text-sm text-slate-500 text-center py-8">Loading portfolios…</p>
          )}

          {!loading && error && (
            <div className="text-center py-8">
              <p className="text-sm text-red-400 mb-3">{error}</p>
              <button
                onClick={fetchPortfolios}
                className="text-xs font-medium px-3 py-1.5 rounded-lg"
                style={{ color: "#F59E0B", border: "1px solid rgba(245,158,11,0.3)", background: "rgba(245,158,11,0.08)" }}
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !error && portfolios.length === 0 && (
            <div className="text-center py-10">
              <p className="text-sm text-slate-400 mb-1">No saved portfolios yet.</p>
              <p className="text-xs text-slate-600">
                Run an analysis and click <span className="text-slate-500">Save Portfolio</span> to get started.
              </p>
            </div>
          )}

          {!loading && !error && portfolios.length > 0 && (
            <div className="space-y-0">
              {portfolios.map((p, i) => (
                <div key={p.id}>
                  <div className="py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-100 mb-1">{p.name}</p>
                        <div className="flex flex-wrap gap-1 mb-1.5">
                          {(p.tickers || []).slice(0, 8).map((t) => (
                            <span
                              key={t}
                              className="mono text-xs px-2 py-0.5 rounded-full"
                              style={{ background: "rgba(71,85,105,0.3)", color: "#94a3b8", border: "1px solid rgba(71,85,105,0.4)" }}
                            >
                              {t}
                            </span>
                          ))}
                          {(p.tickers || []).length > 8 && (
                            <span className="text-xs text-slate-600">+{p.tickers.length - 8} more</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-600">
                          {(p.tickers || []).length} position{p.tickers?.length !== 1 ? "s" : ""} · Saved {formatDate(p.created_at)}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {confirmDelete === p.id ? (
                          <>
                            <button
                              onClick={() => handleDelete(p.id)}
                              className="text-xs font-semibold px-2.5 py-1 rounded"
                              style={{ color: "#f87171", border: "1px solid rgba(248,113,113,0.35)", background: "rgba(248,113,113,0.1)" }}
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => handleLoad(p)}
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                              style={{ color: "#F59E0B", border: "1px solid rgba(245,158,11,0.3)", background: "rgba(245,158,11,0.1)" }}
                            >
                              Load
                            </button>
                            <button
                              onClick={() => setConfirmDelete(p.id)}
                              className="text-xs text-slate-600 hover:text-red-400 transition-colors px-1"
                              aria-label="Delete portfolio"
                            >
                              ✕
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  {i < portfolios.length - 1 && (
                    <div style={{ borderTop: "1px solid rgba(71,85,105,0.25)" }} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
