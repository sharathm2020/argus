import React, { useState, useEffect } from "react";
import PortfolioInput from "./components/PortfolioInput.jsx";
import TickerCard from "./components/TickerCard.jsx";
import RiskSummary from "./components/RiskSummary.jsx";

// Application state machine states
const STATE = {
  IDLE: "idle",
  LOADING: "loading",
  RESULTS: "results",
  ERROR: "error",
};

// Messages that cycle during the loading state
const LOADING_MESSAGES = [
  "Fetching latest news and headlines...",
  "Downloading SEC 10-K filings from EDGAR...",
  "Extracting Risk Factors from filings...",
  "Running AI risk analysis per position...",
  "Synthesizing portfolio-level summary...",
];

/**
 * Animated loading view with cycling status messages.
 * Each message is shown for ~8 seconds with a smooth fade transition.
 * This is purely a visual component — no application state is modified here.
 */
function LoadingView() {
  const [msgIndex, setMsgIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      // Fade out
      setVisible(false);
      // After fade completes, advance to next message and fade in
      setTimeout(() => {
        setMsgIndex((i) => (i + 1) % LOADING_MESSAGES.length);
        setVisible(true);
      }, 500);
    }, 8000);

    return () => clearInterval(interval);
  }, []);

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
        <div
          className="absolute inset-0 rounded-full spinner-ring"
        />
      </div>

      {/* Cycling status message */}
      <div
        className="text-center px-4"
        style={{
          opacity: visible ? 1 : 0,
          transition: "opacity 0.5s ease",
        }}
      >
        <p className="text-xl font-semibold text-slate-100 mb-2">
          {LOADING_MESSAGES[msgIndex]}
        </p>
      </div>

      {/* Static secondary note — always visible */}
      <p className="text-sm text-slate-500 text-center -mt-4">
        This may take 20–60 seconds for larger portfolios.
      </p>
    </div>
  );
}

export default function App() {
  const [appState, setAppState] = useState(STATE.IDLE);
  const [analysisData, setAnalysisData] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  /**
   * Called by PortfolioInput when the user submits a portfolio.
   * Sends the request to the backend and transitions through loading -> results/error.
   */
  async function handleAnalyze(portfolioPayload) {
    setAppState(STATE.LOADING);
    setErrorMessage("");
    setAnalysisData(null);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(portfolioPayload),
      });

      if (!response.ok) {
        let detail = `HTTP ${response.status}`;
        try {
          const errBody = await response.json();
          detail = errBody.detail || detail;
        } catch (_) { /* ignore parse error */ }
        throw new Error(detail);
      }

      const data = await response.json();
      setAnalysisData(data);
      setAppState(STATE.RESULTS);
    } catch (err) {
      setErrorMessage(err.message || "An unexpected error occurred.");
      setAppState(STATE.ERROR);
    }
  }

  function handleReset() {
    setAppState(STATE.IDLE);
    setAnalysisData(null);
    setErrorMessage("");
  }

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

          {appState === STATE.RESULTS && (
            <button onClick={handleReset} className="btn-outline-amber">
              New Analysis
            </button>
          )}
        </div>
      </header>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className="max-w-[1400px] mx-auto w-full px-8 py-12 flex-1">

        {/* Idle — show input form */}
        {appState === STATE.IDLE && (
          <div className="animate-fade-in-up max-w-[720px] mx-auto">
            <div className="mb-10">
              <h2
                className="font-bold text-slate-100 mb-3 leading-tight"
                style={{ fontSize: "2.5rem" }}
              >
                Analyze Your Portfolio
              </h2>
              <p
                className="text-slate-400 leading-loose"
                style={{ fontSize: "1rem" }}
              >
                Enter your ticker symbols and allocation weights. Argus will fetch live news,
                SEC 10-K filings, and generate an AI-powered risk assessment for each position.
              </p>
            </div>
            <PortfolioInput onAnalyze={handleAnalyze} />
          </div>
        )}

        {/* Loading state */}
        {appState === STATE.LOADING && <LoadingView />}

        {/* Error state */}
        {appState === STATE.ERROR && (
          <div className="animate-fade-in-up max-w-2xl mx-auto">
            <div className="card border-red-700/40 bg-red-950/20 mb-6">
              <div className="flex items-start gap-3">
                <span className="text-red-400 text-xl mt-0.5">✕</span>
                <div>
                  <h3 className="font-semibold text-red-300 mb-1">Analysis Failed</h3>
                  <p className="text-sm text-red-400/80">{errorMessage}</p>
                </div>
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
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-slate-100">Risk Analysis Results</h2>
              <span className="text-xs text-slate-500/70 mono">
                {analysisData.results.length} position{analysisData.results.length !== 1 ? "s" : ""}
              </span>
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
            />
          </div>
        )}
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-700/40 mt-8 py-7">
        <div className="max-w-[1400px] mx-auto px-8 flex items-center justify-between text-xs text-slate-500">
          <span className="mono">ARGUS v0.1.0</span>
          <span>For informational purposes only. Not financial advice.</span>
        </div>
      </footer>
    </div>
  );
}
