import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { isAuthEnabled } from "../lib/supabaseClient.js";
import AuthModal from "../components/AuthModal.jsx";

// ── Feature grid data ──────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: "📡",
    title: "Real-Time Sentiment",
    desc: "Custom-trained DistilBERT model scores each ticker using live news headlines.",
  },
  {
    icon: "📄",
    title: "SEC 10-K Analysis",
    desc: "EDGAR risk factors extracted and summarized by GPT-4o for every equity position.",
  },
  {
    icon: "💹",
    title: "DCF Valuation",
    desc: "CAPM-derived discount rates, intrinsic value, and margin of safety per ticker.",
  },
  {
    icon: "🔁",
    title: "Comps & Peer Valuation",
    desc: "Relative valuation across P/E, EV/EBITDA, P/S, and P/FCF vs. sector peers.",
  },
  {
    icon: "🛡️",
    title: "Hedging Suggestions",
    desc: "Options-based hedge recommendations with real put contracts, strikes, and IV.",
  },
  {
    icon: "📊",
    title: "Portfolio Intelligence",
    desc: "Sector concentration, weighted sentiment, and portfolio-level risk summary.",
  },
];

const STEPS = [
  {
    number: "01",
    title: "Enter your portfolio",
    desc: "Paste tickers and weights, or upload a Robinhood screenshot. Supports equities, ETFs, and crypto.",
  },
  {
    number: "02",
    title: "Argus runs the analysis",
    desc: "News, SEC filings, fundamentals, and DistilBERT sentiment — all fetched and scored in under a minute.",
  },
  {
    number: "03",
    title: "Review and act",
    desc: "Explore per-ticker risk narratives, DCF valuations, and tailored hedging options with live put data.",
  },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-navy-900 text-slate-100 flex flex-col">

      {/* ── Navbar ──────────────────────────────────────────────────────── */}
      <header className="border-b border-slate-700/50 bg-navy-800/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-[1100px] mx-auto px-6 py-4 flex items-center justify-between">

          {/* Logo */}
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-md flex items-center justify-center"
              style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.35)" }}
            >
              <span className="mono font-bold text-sm" style={{ color: "#F59E0B" }}>A</span>
            </div>
            <div>
              <span className="font-bold text-slate-100 leading-none tracking-tight">Argus</span>
              <p className="text-xs text-slate-400/70 leading-none mt-0.5">Portfolio Risk Copilot</p>
            </div>
          </div>

          {/* Nav links */}
          <div className="flex items-center gap-4">
            <Link
              to="/changelog"
              className="text-xs transition-colors hidden sm:block"
              style={{ color: "rgba(100,116,139,0.7)" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(148,163,184,0.9)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(100,116,139,0.7)")}
            >
              Changelog
            </Link>

            {isAuthEnabled && (
              user ? (
                <div className="relative">
                  <button
                    onClick={() => setUserMenuOpen((v) => !v)}
                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors px-2 py-1.5 rounded-lg"
                    style={{ border: "1px solid rgba(71,85,105,0.35)" }}
                  >
                    <span className="hidden sm:block" style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {user.email}
                    </span>
                    <span className="text-slate-600" style={{ fontSize: "0.6rem" }}>▾</span>
                  </button>
                  {userMenuOpen && (
                    <div
                      className="absolute right-0 top-full mt-1 rounded-lg overflow-hidden z-20"
                      style={{ background: "#0f1929", border: "1px solid rgba(71,85,105,0.5)", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", minWidth: 150 }}
                    >
                      <button
                        onClick={() => { setUserMenuOpen(false); signOut(); }}
                        className="w-full text-left px-4 py-2.5 text-xs transition-colors"
                        style={{ color: "rgba(148,163,184,0.6)" }}
                      >
                        Sign Out
                      </button>
                    </div>
                  )}
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

            {/* Primary CTA */}
            <button
              onClick={() => navigate("/app")}
              className="text-xs font-bold px-4 py-2 rounded-lg transition-all"
              style={{ background: "#F59E0B", color: "#0d1528" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#FCD34D")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#F59E0B")}
            >
              Analyze Portfolio
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="max-w-[1100px] mx-auto px-6 pt-24 pb-20 text-center">
        {/* Eyebrow */}
        <span
          className="mono text-xs font-semibold px-3 py-1 rounded-full inline-block mb-6"
          style={{ color: "#F59E0B", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)" }}
        >
          AI-Powered Portfolio Risk Analysis
        </span>

        {/* Headline */}
        <h1
          className="font-bold text-slate-100 leading-tight mb-6 mx-auto"
          style={{ fontSize: "clamp(2.2rem, 5vw, 3.5rem)", maxWidth: "820px" }}
        >
          Know every risk in your portfolio{" "}
          <span style={{ color: "#F59E0B" }}>before the market does.</span>
        </h1>

        {/* Sub-headline */}
        <p
          className="text-slate-400 leading-relaxed mb-10 mx-auto"
          style={{ fontSize: "1.1rem", maxWidth: "620px" }}
        >
          Argus combines GPT-4o, a custom DistilBERT sentiment model, and SEC EDGAR data to deliver
          institutional-grade risk analysis for individual investors — in under a minute.
        </p>

        {/* CTA buttons */}
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <button
            onClick={() => navigate("/app")}
            className="font-bold px-8 py-3.5 rounded-lg transition-all text-sm"
            style={{ background: "#F59E0B", color: "#0d1528" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#FCD34D")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#F59E0B")}
          >
            Analyze My Portfolio
          </button>
          <Link
            to="/changelog"
            className="font-semibold px-8 py-3.5 rounded-lg text-sm transition-colors"
            style={{ color: "rgba(148,163,184,0.8)", border: "1px solid rgba(71,85,105,0.4)", background: "transparent" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#e2e8f0")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(148,163,184,0.8)")}
          >
            View Changelog
          </Link>
        </div>

        {/* Trust note */}
        <p className="text-xs text-slate-600 mt-8">
          For informational purposes only. Not financial advice.
        </p>
      </section>

      {/* ── How It Works ────────────────────────────────────────────────── */}
      <section
        className="py-20"
        style={{ borderTop: "1px solid rgba(71,85,105,0.3)", borderBottom: "1px solid rgba(71,85,105,0.3)", background: "rgba(13,21,40,0.6)" }}
      >
        <div className="max-w-[1100px] mx-auto px-6">
          <h2 className="text-center font-bold text-slate-100 mb-3" style={{ fontSize: "1.75rem" }}>
            How It Works
          </h2>
          <p className="text-center text-slate-400 text-sm mb-14">
            From portfolio input to actionable insights in three steps.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {STEPS.map((step) => (
              <div key={step.number} className="text-center">
                <div
                  className="mono font-bold mb-4 inline-block"
                  style={{ fontSize: "2.5rem", color: "rgba(245,158,11,0.25)" }}
                >
                  {step.number}
                </div>
                <h3 className="font-semibold text-slate-100 mb-2 text-base">{step.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Feature Grid ────────────────────────────────────────────────── */}
      <section className="max-w-[1100px] mx-auto px-6 py-20">
        <h2 className="text-center font-bold text-slate-100 mb-3" style={{ fontSize: "1.75rem" }}>
          Everything in one place
        </h2>
        <p className="text-center text-slate-400 text-sm mb-14">
          No Bloomberg terminal required.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-xl p-6"
              style={{
                background: "#0d1528",
                border: "1px solid rgba(71,85,105,0.4)",
                borderTop: "3px solid rgba(245,158,11,0.4)",
              }}
            >
              <div className="text-2xl mb-3">{f.icon}</div>
              <h3 className="font-semibold text-slate-100 mb-2 text-sm">{f.title}</h3>
              <p className="text-xs text-slate-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA Banner ──────────────────────────────────────────────────── */}
      <section
        className="py-20"
        style={{ borderTop: "1px solid rgba(71,85,105,0.3)", background: "rgba(13,21,40,0.6)" }}
      >
        <div className="max-w-[680px] mx-auto px-6 text-center">
          <h2 className="font-bold text-slate-100 mb-4" style={{ fontSize: "1.75rem" }}>
            Ready to stress-test your portfolio?
          </h2>
          <p className="text-slate-400 text-sm leading-relaxed mb-8">
            Paste your tickers and get a full risk report — sentiment trends, DCF valuations,
            SEC filing analysis, and hedging suggestions — in under a minute.
          </p>
          <button
            onClick={() => navigate("/app")}
            className="font-bold px-10 py-4 rounded-lg text-sm transition-all"
            style={{ background: "#F59E0B", color: "#0d1528" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#FCD34D")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#F59E0B")}
          >
            Analyze My Portfolio — It's Free
          </button>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-700/40 py-7 mt-auto">
        <div className="max-w-[1100px] mx-auto px-6 flex items-center justify-between text-xs text-slate-500 flex-wrap gap-3">
          <span className="mono">ARGUS v0.4.0</span>
          <span>
            Built by Sharath Mahadevan ·{" "}
            <a
              href="https://github.com/sharathm2020"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-300 transition-colors"
              style={{ color: "rgba(148,163,184,0.6)" }}
            >
              github.com/sharathm2020
            </a>
          </span>
          <span>For informational purposes only. Not financial advice.</span>
        </div>
      </footer>

      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />
    </div>
  );
}
