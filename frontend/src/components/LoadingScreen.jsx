import React from "react";

/**
 * LoadingScreen
 *
 * Full-page loading state with amber progress bar and step label.
 *
 * Props:
 *   progress     — integer 0–100
 *   statusMessage — current step string from the backend
 */
export default function LoadingScreen({ progress = 0, statusMessage }) {
  const pct = Math.max(0, Math.min(100, progress));

  return (
    <div
      className="flex flex-col items-center justify-center gap-6 animate-fade-in-up"
      style={{ minHeight: "calc(100vh - 72px)" }}
    >
      {/* Large amber percentage number */}
      <div
        className="mono font-bold tabular-nums"
        style={{ fontSize: "5rem", lineHeight: 1, color: "#F59E0B" }}
        aria-live="polite"
        aria-atomic="true"
      >
        {pct}%
      </div>

      {/* Progress bar */}
      <div
        className="w-full rounded-full overflow-hidden"
        style={{
          maxWidth: "480px",
          height: "6px",
          background: "rgba(71,85,105,0.35)",
        }}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: "linear-gradient(to right, #F59E0B, #FCD34D)",
            borderRadius: "9999px",
            transition: "width 600ms ease-out",
          }}
        />
      </div>

      {/* Step label */}
      <p
        className="text-base font-medium text-slate-300 text-center px-4"
        style={{ maxWidth: "480px" }}
      >
        {statusMessage || "Starting analysis..."}
      </p>

      {/* Secondary note */}
      <p className="text-sm text-slate-500 text-center">
        This may take 20–60 seconds for larger portfolios.
      </p>
    </div>
  );
}
