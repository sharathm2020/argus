import React from "react";
import { useNavigate } from "react-router-dom";
import { changelog } from "../data/changelog";

export default function ChangelogPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-navy-900 text-slate-100 flex flex-col">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="border-b border-slate-700/50 bg-navy-800/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-[860px] mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
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

          <button
            onClick={() => navigate("/")}
            className="text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1.5"
          >
            <span>←</span>
            <span>Back to Argus</span>
          </button>
        </div>
      </header>

      {/* ── Page content ────────────────────────────────────────────────── */}
      <main className="max-w-[860px] mx-auto w-full px-8 py-12 flex-1">
        {/* Page title */}
        <div className="mb-12">
          <h2
            className="font-bold text-slate-100 leading-tight mb-3"
            style={{ fontSize: "2.25rem" }}
          >
            Changelog
          </h2>
          <p className="text-slate-400 text-base">
            Building in public — a full-stack AI portfolio risk copilot.
          </p>
        </div>

        {/* ── Release cards ─────────────────────────────────────────────── */}
        <div className="space-y-8">
          {changelog.map((entry) => (
            <article
              key={entry.version}
              className="rounded-xl p-7"
              style={{
                background: "#131e38",
                border: "1px solid rgba(71,85,105,0.4)",
                borderTop: "3px solid #F59E0B",
              }}
            >
              {/* Card header */}
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Version badge */}
                  <span
                    className="mono text-sm font-bold px-3 py-1 rounded-full"
                    style={{
                      background: "rgba(245,158,11,0.15)",
                      color: "#F59E0B",
                      border: "1px solid rgba(245,158,11,0.35)",
                    }}
                  >
                    {entry.version}
                  </span>
                  {/* Phase label */}
                  <span
                    className="text-xs font-semibold px-2.5 py-1 rounded-full"
                    style={{
                      background: "rgba(71,85,105,0.3)",
                      color: "#94a3b8",
                      border: "1px solid rgba(71,85,105,0.4)",
                    }}
                  >
                    {entry.phase}
                  </span>
                </div>
                {/* Date */}
                <span className="text-xs text-slate-500 mono shrink-0 mt-1">{entry.date}</span>
              </div>

              {/* Release title */}
              <h3 className="text-xl font-semibold text-slate-100 mb-4">{entry.title}</h3>

              {/* Amber divider */}
              <div
                className="mb-5"
                style={{ height: "1px", background: "linear-gradient(to right, rgba(245,158,11,0.5), transparent)" }}
              />

              {/* Highlights */}
              <ul className="space-y-2.5">
                {entry.highlights.map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span
                      className="mt-2 shrink-0 rounded-full"
                      style={{ width: 5, height: 5, background: "#F59E0B", opacity: 0.7 }}
                      aria-hidden="true"
                    />
                    <span className="text-sm text-slate-300/90 leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-700/40 mt-8 py-7">
        <div className="max-w-[860px] mx-auto px-8 flex items-center justify-between text-xs text-slate-500">
          <span className="mono">ARGUS {changelog[0]?.version ?? ""}</span>
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
        </div>
      </footer>
    </div>
  );
}
