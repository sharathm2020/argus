import React from "react";

/**
 * SensitivityTable
 *
 * Renders a 5×5 DCF sensitivity heatmap inside the DCF Valuation tab.
 * Rows  = terminal growth rate
 * Cols  = discount rate
 * Color = how far intrinsic value is from the current market price.
 *
 * Props:
 *   data — sensitivity_table dict from the API (may be null/undefined)
 */
export default function SensitivityTable({ data }) {
  if (!data) return null;

  const {
    discount_rates,
    terminal_growth_rates,
    intrinsic_values,
    current_price,
    base_discount_rate,
    base_terminal_growth,
  } = data;

  if (
    !discount_rates?.length ||
    !terminal_growth_rates?.length ||
    !intrinsic_values?.length
  ) {
    return null;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function fmtPct(v) {
    return `${(v * 100).toFixed(1)}%`;
  }

  function fmtVal(v) {
    if (v == null) return "N/A";
    return `$${Math.round(v)}`;
  }

  function cellStyle(val) {
    if (val == null) {
      return { background: "#1e293b", color: "#475569" };
    }
    const ratio = val / current_price;
    if (ratio > 1.2)  return { background: "#14532d", color: "#ffffff" }; // >+20% undervalued
    if (ratio > 1.0)  return { background: "#166534", color: "#ffffff" }; // 0–20% undervalued
    if (ratio >= 0.95) return { background: "#92400e", color: "#ffffff" }; // ≈ fair value ±5%
    if (ratio >= 0.8)  return { background: "#7f1d1d", color: "#ffffff" }; // 0–20% overvalued
    return              { background: "#450a0a", color: "#ffffff" };        // >−20% overvalued
  }

  function isBaseCell(rowIdx, colIdx) {
    const drIdx  = discount_rates.findIndex((dr)  => Math.abs(dr  - base_discount_rate)   < 0.00015);
    const tgrIdx = terminal_growth_rates.findIndex((tgr) => Math.abs(tgr - base_terminal_growth) < 0.00015);
    return rowIdx === tgrIdx && colIdx === drIdx;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const cellBase = {
    padding: "5px 4px",
    textAlign: "center",
    fontFamily: "monospace",
    fontSize: "0.68rem",
    borderRadius: "3px",
    minWidth: "48px",
  };

  return (
    <div style={{ marginTop: "1.25rem" }}>
      {/* Title */}
      <div className="mb-2">
        <h4 className="text-xs font-semibold text-slate-300 mb-0.5">
          Intrinsic Value Sensitivity
        </h4>
        <p className="text-xs text-slate-500">
          Rows = terminal growth rate · Columns = discount rate
        </p>
      </div>

      {/* Grid — horizontally scrollable on small cards */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "separate", borderSpacing: "2px", width: "100%" }}>
          <thead>
            <tr>
              {/* Corner label */}
              <th
                style={{
                  padding: "4px 8px",
                  color: "#475569",
                  fontWeight: 500,
                  fontSize: "0.65rem",
                  textAlign: "left",
                  whiteSpace: "nowrap",
                }}
              >
                TGR ╲ DR
              </th>
              {discount_rates.map((dr) => (
                <th
                  key={dr}
                  style={{
                    padding: "4px 6px",
                    color: "#94a3b8",
                    fontWeight: 600,
                    fontSize: "0.68rem",
                    textAlign: "center",
                    whiteSpace: "nowrap",
                  }}
                >
                  {fmtPct(dr)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {terminal_growth_rates.map((tgr, rowIdx) => (
              <tr key={tgr}>
                {/* Row header */}
                <td
                  style={{
                    padding: "4px 8px",
                    color: "#94a3b8",
                    fontWeight: 600,
                    fontSize: "0.68rem",
                    whiteSpace: "nowrap",
                  }}
                >
                  {fmtPct(tgr)}
                </td>

                {discount_rates.map((dr, colIdx) => {
                  const val    = intrinsic_values[rowIdx]?.[colIdx];
                  const style  = cellStyle(val);
                  const isBase = isBaseCell(rowIdx, colIdx);
                  return (
                    <td
                      key={dr}
                      style={{
                        ...cellBase,
                        ...style,
                        fontWeight: isBase ? 700 : 400,
                        outline: isBase ? "2px solid #F59E0B" : "none",
                        outlineOffset: "-1px",
                      }}
                    >
                      {fmtVal(val)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <p
        className="text-xs italic mt-2"
        style={{ color: "#475569", lineHeight: 1.5 }}
      >
        Green = undervalued vs current price · Red = overvalued ·{" "}
        <span style={{ color: "#F59E0B" }}>■</span> = base case assumptions
      </p>
    </div>
  );
}
