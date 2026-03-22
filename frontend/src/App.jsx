import React, { useState, useEffect, useRef } from "react";
import PortfolioInput from "./components/PortfolioInput.jsx";
import TickerCard from "./components/TickerCard.jsx";
import RiskSummary from "./components/RiskSummary.jsx";
import HedgingSuggestions from "./components/HedgingSuggestions.jsx";
import AuthModal from "./components/AuthModal.jsx";
import { useAuth } from "./context/AuthContext.jsx";
import { isAuthEnabled } from "./lib/supabaseClient.js";

// Application state machine states
const STATE = {
  IDLE: "idle",
  LOADING: "loading",
  RESULTS: "results",
  ERROR: "error",
};

// How often to poll the job status endpoint (ms)
const POLL_INTERVAL_MS = 3000;

// Stop polling and show error after this many consecutive network failures
const MAX_NETWORK_FAILURES = 5;

/**
 * Animated loading view.
 * Displays the real-time status_message coming from the backend poll response.
 */
function LoadingView({ statusMessage }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-8 animate-fade-in-up"
      style={{ minHeight: "calc(100vh - 72px)" }}
    >
      {/* Amber spinner — 80px diameter, 3px stroke */}
      <div className="relative" style={{ width: 80, height: 80 }}>
        <div
          className="absolute inset-0 rounded-full"
          style={{ border: "3px solid rgba(71,85,105,0.4)" }}
        />
        <div className="absolute inset-0 rounded-full spinner-ring" />
      </div>

      {/* Real-time status message from backend */}
      <div className="text-center px-4">
        <p className="text-xl font-semibold text-slate-100 mb-2">
          {statusMessage || "Starting analysis..."}
        </p>
      </div>

      {/* Static secondary note */}
      <p className="text-sm text-slate-500 text-center -mt-4">
        This may take 20–60 seconds for larger portfolios.
      </p>
    </div>
  );
}

export default function App() {
  const { user, session, signOut } = useAuth();

  const [appState, setAppState]       = useState(STATE.IDLE);
  const [analysisData, setAnalysisData] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  // Auth modal
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // Nudge banner: shown once per session after first analysis completes (logged-out only)
  const [nudgeDismissed, setNudgeDismissed] = useState(
    () => sessionStorage.getItem("argus_nudge_dismissed") === "1"
  );

  // Ephemeral toast for feature stubs
  const [toastMessage, setToastMessage] = useState("");
  const toastTimerRef = useRef(null);
  function showFeatureToast(msg) {
    setToastMessage(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMessage(""), 3000);
  }

  // Refs so interval callbacks always see fresh values without re-creating the interval
  const pollIntervalRef    = useRef(null);
  const networkFailuresRef = useRef(0);

  // Clear the polling interval whenever we leave the loading state
  function _clearPoll() {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }

  /**
   * Called by PortfolioInput on form submit.
   * 1. POST /api/analyze  → get job_id (returns in <100ms)
   * 2. Enter LOADING state immediately
   * 3. Start polling GET /api/jobs/{job_id} every 3 seconds
   */
  async function handleAnalyze(portfolioPayload) {
    _clearPoll();
    networkFailuresRef.current = 0;
    setAppState(STATE.LOADING);
    setErrorMessage("");
    setAnalysisData(null);
    setStatusMessage("");

    // ── Step 1: submit job ────────────────────────────────────────────────
    let jobId;
    try {
      // Attach Bearer token when user is signed in
      const headers = { "Content-Type": "application/json" };
      if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers,
        body: JSON.stringify(portfolioPayload),
      });

      if (!response.ok) {
        let detail = `HTTP ${response.status}`;
        try {
          const errBody = await response.json();
          detail = errBody.detail || detail;
        } catch (_) { /* ignore */ }
        throw new Error(detail);
      }

      const data = await response.json();
      jobId = data.job_id;
    } catch (err) {
      setErrorMessage(err.message || "Failed to start analysis. Please try again.");
      setAppState(STATE.ERROR);
      return;
    }

    // ── Step 2: poll for results ──────────────────────────────────────────
    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);

        if (!res.ok) {
          networkFailuresRef.current += 1;
          if (networkFailuresRef.current >= MAX_NETWORK_FAILURES) {
            _clearPoll();
            setErrorMessage("Lost connection to server. Please try again.");
            setAppState(STATE.ERROR);
          }
          return;
        }

        // Successful response — reset failure counter
        networkFailuresRef.current = 0;
        const job = await res.json();

        // Update the displayed status message
        if (job.status_message) {
          setStatusMessage(job.status_message);
        }

        if (job.status === "complete") {
          _clearPoll();
          setAnalysisData(job.results);
          setAppState(STATE.RESULTS);
        } else if (job.status === "failed") {
          _clearPoll();
          setErrorMessage(job.error || "Analysis failed. Please try again.");
          setAppState(STATE.ERROR);
        }
        // PENDING / PROCESSING → keep polling
      } catch (_networkErr) {
        networkFailuresRef.current += 1;
        if (networkFailuresRef.current >= MAX_NETWORK_FAILURES) {
          _clearPoll();
          setErrorMessage("Lost connection to server. Please try again.");
          setAppState(STATE.ERROR);
        }
      }
    }, POLL_INTERVAL_MS);
  }

  function handleReset() {
    _clearPoll();
    setAppState(STATE.IDLE);
    setAnalysisData(null);
    setErrorMessage("");
    setStatusMessage("");
  }

  // Clean up the interval if the component ever unmounts
  useEffect(() => () => _clearPoll(), []);

  return (
    <div className="min-h-screen bg-navy-900 text-slate-100 flex flex-col">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="border-b border-slate-700/50 bg-navy-800/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-[1400px] mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Logo mark — amber accent */}
            <div
              className="w-8 h-8 rounded-md flex items-center justify-center"
              style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.35)" }}
            >
              <span className="mono font-bold text-sm" style={{ color: "#F59E0B" }}>A</span>
            </div>
            <div>
              <h1 className="font-bold text-slate-100 leading-none tracking-tight">Argus</h1>
              <p className="text-xs text-slate-400/70 leading-none mt-0.5">Portfolio Risk Copilot</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {appState === STATE.RESULTS && (
              <button onClick={handleReset} className="btn-outline-amber">
                New Analysis
              </button>
            )}
            {isAuthEnabled && (
              user ? (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 hidden sm:block" style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {user.email}
                  </span>
                  <button
                    onClick={signOut}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                    style={{ color: "rgba(148,163,184,0.7)", border: "1px solid rgba(71,85,105,0.4)", background: "transparent" }}
                  >
                    Sign Out
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setAuthModalOpen(true)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                  style={{ color: "#F59E0B", border: "1px solid rgba(245,158,11,0.3)", background: "rgba(245,158,11,0.08)" }}
                >
                  Sign In
                </button>
              )
            )}
          </div>
        </div>
      </header>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className="max-w-[1400px] mx-auto w-full px-8 py-12 flex-1">

        {/* Idle — show input form */}
        {appState === STATE.IDLE && (
          <div className="animate-fade-in-up max-w-[720px] mx-auto">
            <h2
              className="font-bold text-slate-100 leading-tight"
              style={{ fontSize: "2.5rem" }}
            >
              Analyze Your Portfolio
            </h2>
            <PortfolioInput onAnalyze={handleAnalyze} />
          </div>
        )}

        {/* Loading state — real-time status from backend */}
        {appState === STATE.LOADING && <LoadingView statusMessage={statusMessage} />}

        {/* Error state */}
        {appState === STATE.ERROR && (
          <div className="animate-fade-in-up max-w-[720px] mx-auto">
            <div
              className="rounded-lg p-5 mb-6 flex items-start gap-4"
              style={{
                background: "rgba(120,35,15,0.15)",
                border: "1px solid rgba(245,158,11,0.25)",
                boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
              }}
            >
              {/* Amber warning icon */}
              <span
                className="text-2xl shrink-0 mt-0.5"
                style={{ color: "#F59E0B" }}
                aria-hidden="true"
              >
                ⚠
              </span>
              <div>
                <h3 className="font-semibold text-slate-100 mb-1">Analysis Failed</h3>
                <p className="text-sm text-slate-400">{errorMessage}</p>
              </div>
            </div>
            <button onClick={handleReset} className="btn-primary">
              Try Again
            </button>
          </div>
        )}

        {/* Results */}
        {appState === STATE.RESULTS && analysisData && (
          <div className="animate-fade-in-up">
            {/* ── Sign-in nudge banner (logged-out users, once per session) ── */}
            {isAuthEnabled && !user && !nudgeDismissed && (
              <div
                className="flex items-start gap-4 rounded-lg px-5 py-4 mb-6 animate-fade-in-up"
                style={{
                  background: "rgba(245,158,11,0.06)",
                  borderLeft: "4px solid #F59E0B",
                  border: "1px solid rgba(245,158,11,0.2)",
                  borderLeftWidth: "4px",
                }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-100 mb-0.5">Save your analysis history</p>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Sign in to track sentiment changes over time and save portfolios for quick re-analysis.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 mt-0.5">
                  <button
                    onClick={() => setAuthModalOpen(true)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                    style={{ color: "#F59E0B", border: "1px solid rgba(245,158,11,0.35)", background: "rgba(245,158,11,0.12)" }}
                  >
                    Sign In
                  </button>
                  <button
                    onClick={() => {
                      setNudgeDismissed(true);
                      sessionStorage.setItem("argus_nudge_dismissed", "1");
                    }}
                    className="text-xs text-slate-500 hover:text-slate-300 transition-colors px-1"
                    aria-label="Dismiss"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-slate-100">Risk Analysis Results</h2>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500/70 mono">
                  {analysisData.results.length} position{analysisData.results.length !== 1 ? "s" : ""}
                </span>
                {/* Feature gate stubs */}
                {isAuthEnabled && (
                  <>
                    <button
                      onClick={() => {
                        if (!user) { setAuthModalOpen(true); return; }
                        // coming soon
                        showFeatureToast("Portfolio saving coming soon.");
                      }}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                      style={{ color: "rgba(148,163,184,0.6)", border: "1px solid rgba(71,85,105,0.35)", background: "transparent" }}
                    >
                      Save Portfolio
                    </button>
                    <button
                      onClick={() => {
                        if (!user) { setAuthModalOpen(true); return; }
                        showFeatureToast("Portfolio history coming soon.");
                      }}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                      style={{ color: "rgba(148,163,184,0.6)", border: "1px solid rgba(71,85,105,0.35)", background: "transparent" }}
                    >
                      History
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Per-ticker cards — responsive 2-column grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch mb-6">
              {analysisData.results.map((result) => (
                <TickerCard key={result.ticker} result={result} />
              ))}
            </div>

            {/* Portfolio summary — full width below grid */}
            <RiskSummary
              summary={analysisData.portfolio_summary}
              overallSentiment={analysisData.overall_sentiment}
              sectorConcentration={analysisData.sector_concentration}
            />
            <HedgingSuggestions hedgingSuggestions={analysisData.hedging_suggestions} results={analysisData.results} />
          </div>
        )}
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-700/40 mt-8 py-7">
        <div className="max-w-[1400px] mx-auto px-8 flex items-center justify-between text-xs text-slate-500">
          <span className="mono">ARGUS v0.4.0</span>
          <span>For informational purposes only. Not financial advice.</span>
        </div>
      </footer>

      {/* ── Auth modal ──────────────────────────────────────────────────── */}
      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />

      {/* ── Feature-stub toast ──────────────────────────────────────────── */}
      {toastMessage && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-lg text-sm font-medium text-slate-100 animate-fade-in-up"
          style={{
            background: "#1e293b",
            border: "1px solid rgba(71,85,105,0.5)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
          }}
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}
