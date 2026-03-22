import React, { useState, useEffect, useCallback } from "react";

/** Sentiment badge color + label from score. */
function SentimentBadge({ label, score }) {
  const display = label
    ? label.charAt(0).toUpperCase() + label.slice(1)
    : score > 0.2 ? "Positive" : score < -0.2 ? "Negative" : "Neutral";

  const color =
    display === "Positive" ? "#10B981"
    : display === "Negative" ? "#f87171"
    : "#94a3b8";

  return (
    <span
      className="text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{ color, background: `${color}18`, border: `1px solid ${color}40` }}
    >
      {display}
    </span>
  );
}

/**
 * AnalysisHistoryPanel
 *
 * Full-screen modal panel listing the user's past analyses.
 *
 * Props:
 *   isOpen         — boolean
 *   onClose        — () => void
 *   session        — Supabase session
 *   onViewAnalysis — (resultSnapshot: object) => void
 */
export default function AnalysisHistoryPanel({ isOpen, onClose, session, onViewAnalysis }) {
  const [history, setHistory]     = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [loadingId, setLoadingId] = useState(null);

  const authHeader = session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/history", { headers: authHeader });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      setHistory(data.history || []);
    } catch {
      setError("Could not load history. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (isOpen) fetchHistory();
  }, [isOpen, fetchHistory]);

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

  async function handleView(analysisId) {
    setLoadingId(analysisId);
    try {
      const res = await fetch(`/api/history/${analysisId}`, { headers: authHeader });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const detail = await res.json();
      onViewAnalysis(detail.result_snapshot);
      onClose();
    } catch {
      setError("Failed to load analysis. Please try again.");
    } finally {
      setLoadingId(null);
    }
  }

  function formatDate(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit",
    });
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
          <h2 className="font-semibold text-slate-100 text-base">Analysis History</h2>
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
            <p className="text-sm text-slate-500 text-center py-8">Loading history…</p>
          )}

          {!loading && error && (
            <div className="text-center py-8">
              <p className="text-sm text-red-400 mb-3">{error}</p>
              <button
                onClick={fetchHistory}
                className="text-xs font-medium px-3 py-1.5 rounded-lg"
                style={{ color: "#F59E0B", border: "1px solid rgba(245,158,11,0.3)", background: "rgba(245,158,11,0.08)" }}
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !error && history.length === 0 && (
            <div className="text-center py-10">
              <p className="text-sm text-slate-400 mb-1">No analysis history yet.</p>
              <p className="text-xs text-slate-600">
                Run your first analysis to start tracking.
              </p>
            </div>
          )}

          {!loading && !error && history.length > 0 && (
            <div className="space-y-0">
              {history.map((item, i) => (
                <div key={item.id}>
                  <div className="py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        {/* Ticker pills */}
                        <div className="flex flex-wrap gap-1 mb-2">
                          {(item.tickers || []).slice(0, 6).map((t) => (
                            <span
                              key={t}
                              className="mono text-xs px-2 py-0.5 rounded-full"
                              style={{ background: "rgba(71,85,105,0.3)", color: "#94a3b8", border: "1px solid rgba(71,85,105,0.4)" }}
                            >
                              {t}
                            </span>
                          ))}
                          {(item.tickers || []).length > 6 && (
                            <span className="text-xs text-slate-600">+{item.tickers.length - 6} more</span>
                          )}
                        </div>

                        {/* Sentiment + date */}
                        <div className="flex items-center gap-2">
                          <SentimentBadge
                            label={item.overall_sentiment_label}
                            score={item.overall_sentiment_score}
                          />
                          <span
                            className="mono text-xs"
                            style={{ color: item.overall_sentiment_score > 0 ? "#10B981" : item.overall_sentiment_score < 0 ? "#f87171" : "#94a3b8" }}
                          >
                            {item.overall_sentiment_score > 0 ? "+" : ""}
                            {(item.overall_sentiment_score ?? 0).toFixed(3)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1">{formatDate(item.created_at)}</p>
                      </div>

                      <button
                        onClick={() => handleView(item.id)}
                        disabled={loadingId === item.id}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors shrink-0"
                        style={{
                          color: loadingId === item.id ? "rgba(245,158,11,0.4)" : "#F59E0B",
                          border: "1px solid rgba(245,158,11,0.3)",
                          background: "rgba(245,158,11,0.1)",
                          cursor: loadingId === item.id ? "not-allowed" : "pointer",
                        }}
                      >
                        {loadingId === item.id ? "Loading…" : "View"}
                      </button>
                    </div>
                  </div>
                  {i < history.length - 1 && (
                    <div style={{ borderTop: "1px solid rgba(71,85,105,0.25)" }} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer note */}
        {!loading && history.length > 0 && (
          <div className="px-6 py-3 border-t border-slate-700/30 shrink-0">
            <p className="text-xs text-slate-600 text-center">
              Showing {history.length} most recent {history.length === 1 ? "analysis" : "analyses"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
