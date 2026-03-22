import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { isAuthEnabled } from "../lib/supabaseClient";

/**
 * AuthModal — dark-themed sign-in / sign-up dialog.
 *
 * Props:
 *   isOpen   — boolean
 *   onClose  — () => void
 */
export default function AuthModal({ isOpen, onClose }) {
  const { signIn, signUp } = useAuth();

  const [mode, setMode]           = useState("sign_in"); // "sign_in" | "sign_up"
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [error, setError]         = useState("");
  const [success, setSuccess]     = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Reset form state when modal opens
  useEffect(() => {
    if (isOpen) {
      setMode("sign_in");
      setEmail("");
      setPassword("");
      setError("");
      setSuccess(false);
      setSubmitting(false);
    }
  }, [isOpen]);

  // Close on Escape
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

  async function handleSubmit() {
    setError("");
    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setSubmitting(true);
    try {
      if (mode === "sign_in") {
        await signIn(email.trim(), password);
        onClose();
      } else {
        await signUp(email.trim(), password);
        setSuccess(true);
      }
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.65)" }}
      onClick={onClose}
    >
      {/* Dialog */}
      <div
        className="relative rounded-xl p-8 w-full max-w-sm mx-4"
        style={{
          background: "#0f1929",
          border: "1px solid rgba(71,85,105,0.5)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 transition-colors text-lg leading-none"
          aria-label="Close"
        >
          ✕
        </button>

        {/* Logo mark */}
        <div className="flex items-center gap-2 mb-6">
          <div
            className="w-7 h-7 rounded-md flex items-center justify-center"
            style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.35)" }}
          >
            <span className="mono font-bold text-xs" style={{ color: "#F59E0B" }}>A</span>
          </div>
          <span className="font-semibold text-slate-100 text-sm tracking-tight">Argus</span>
        </div>

        {success ? (
          /* ── Success state (sign-up confirmation) ── */
          <div>
            <h2 className="font-semibold text-slate-100 text-lg mb-2">Check your email</h2>
            <p className="text-sm text-slate-400 leading-relaxed mb-6">
              We sent a confirmation link to <span className="text-slate-200">{email}</span>.
              Click it to activate your account.
            </p>
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-lg text-sm font-semibold transition-colors"
              style={{ background: "rgba(245,158,11,0.15)", color: "#F59E0B", border: "1px solid rgba(245,158,11,0.3)" }}
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {/* ── Mode toggle ── */}
            <div
              className="flex mb-6"
              style={{ borderBottom: "1px solid rgba(71,85,105,0.4)" }}
            >
              {[
                { id: "sign_in", label: "Sign In" },
                { id: "sign_up", label: "Create Account" },
              ].map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => { setMode(id); setError(""); }}
                  className="text-sm font-semibold px-4 py-2 transition-colors"
                  style={
                    mode === id
                      ? { color: "#F59E0B", borderBottom: "2px solid #F59E0B", marginBottom: "-1px", background: "transparent" }
                      : { color: "rgba(148,163,184,0.5)", borderBottom: "2px solid transparent", marginBottom: "-1px", background: "transparent" }
                  }
                >
                  {label}
                </button>
              ))}
            </div>

            {/* ── Fields ── */}
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5 font-medium">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="w-full rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none transition-colors"
                  style={{
                    background: "rgba(2,8,20,0.6)",
                    border: "1px solid rgba(71,85,105,0.5)",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "rgba(245,158,11,0.5)")}
                  onBlur={(e) => (e.target.style.borderColor = "rgba(71,85,105,0.5)")}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5 font-medium">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "sign_up" ? "Min. 6 characters" : "••••••••"}
                  autoComplete={mode === "sign_in" ? "current-password" : "new-password"}
                  className="w-full rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none transition-colors"
                  style={{
                    background: "rgba(2,8,20,0.6)",
                    border: "1px solid rgba(71,85,105,0.5)",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "rgba(245,158,11,0.5)")}
                  onBlur={(e) => (e.target.style.borderColor = "rgba(71,85,105,0.5)")}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                />
              </div>
            </div>

            {/* ── Inline error ── */}
            {error && (
              <p className="text-xs text-red-400 mb-4 leading-relaxed">{error}</p>
            )}

            {/* ── Submit ── */}
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all"
              style={{
                background: submitting ? "rgba(245,158,11,0.1)" : "rgba(245,158,11,0.2)",
                color: submitting ? "rgba(245,158,11,0.4)" : "#F59E0B",
                border: "1px solid rgba(245,158,11,0.3)",
                cursor: submitting ? "not-allowed" : "pointer",
              }}
            >
              {submitting
                ? "Please wait…"
                : mode === "sign_in"
                ? "Sign In"
                : "Create Account"}
            </button>

            {!isAuthEnabled && (
              <p className="text-xs text-slate-600 italic mt-4 text-center">
                Auth is not configured in this environment.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
