import React from "react";

/**
 * CorrelationMatrix
 *
 * Renders an N×N heatmap of 90-day pairwise return correlations.
 *
 * Props:
 *   data — correlation_matrix dict from the API: { tickers, matrix }
 */
export default function CorrelationMatrix({ data }) {
  if (!data || !data.tickers?.length || !data.matrix?.length) return null;
  if (data.tickers.length < 2) return null;

  const { tickers, matrix } = data;
  const n = tickers.length;

  // Scale cell size based on number of tickers
  const cellPx = n <= 5 ? 52 : n <= 8 ? 40 : 32;
  const fontPx = n <= 5 ? "0.72rem" : n <= 8 ? "0.65rem" : "0.58rem";

  function cellBg(val, isDiag) {
    if (isDiag) return "#0d1528";
    if (val >= 0.8)  return "#7f1d1d";  // deep red — highly correlated
    if (val >= 0.6)  return "#991b1b";  // medium red
    if (val >= 0.4)  return "#92400e";  // amber
    if (val >= 0.2)  return "#1e293b";  // slate — weak
    return "#14532d";                   // green — low / negative
  }

  return (
    <div style={{ marginTop: "1.5rem" }}>
      {/* Title */}
      <div className="mb-3">
        <h4 className="text-xs font-semibold text-slate-300 mb-0.5">
          Position Correlations
        </h4>
        <p className="text-xs text-slate-500">
          90-day return correlations between holdings
        </p>
      </div>

      {/* Scrollable grid */}
      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            borderCollapse: "separate",
            borderSpacing: "2px",
          }}
        >
          <thead>
            <tr>
              {/* Corner */}
              <th style={{ minWidth: cellPx, padding: "2px 4px" }} />
              {tickers.map((t) => (
                <th
                  key={t}
                  style={{
                    minWidth: cellPx,
                    padding: "2px 4px",
                    textAlign: "center",
                    fontSize: fontPx,
                    fontFamily: "monospace",
                    fontWeight: 600,
                    color: "#94a3b8",
                    whiteSpace: "nowrap",
                  }}
                >
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tickers.map((rowTicker, ri) => (
              <tr key={rowTicker}>
                {/* Row header */}
                <td
                  style={{
                    padding: "2px 6px 2px 2px",
                    fontSize: fontPx,
                    fontFamily: "monospace",
                    fontWeight: 600,
                    color: "#94a3b8",
                    whiteSpace: "nowrap",
                    textAlign: "right",
                  }}
                >
                  {rowTicker}
                </td>

                {tickers.map((colTicker, ci) => {
                  const val = matrix[ri]?.[ci];
                  const isDiag = ri === ci;
                  return (
                    <td
                      key={colTicker}
                      style={{
                        minWidth: cellPx,
                        height: cellPx,
                        textAlign: "center",
                        fontFamily: "monospace",
                        fontSize: fontPx,
                        fontWeight: isDiag ? 400 : 500,
                        color: "#ffffff",
                        background: cellBg(val, isDiag),
                        borderRadius: "3px",
                        padding: "2px 3px",
                      }}
                    >
                      {isDiag ? "—" : val != null ? val.toFixed(2) : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-3 flex-wrap">
        {[
          { color: "#14532d", label: "Low / negative" },
          { color: "#1e293b", label: "Weak (0.2–0.4)" },
          { color: "#92400e", label: "Moderate (0.4–0.6)" },
          { color: "#991b1b", label: "High (0.6–0.8)" },
          { color: "#7f1d1d", label: "Very high (0.8+)" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                borderRadius: 2,
                background: color,
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: "0.65rem", color: "#64748b" }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Interpretation note */}
      <p
        className="mt-2 italic"
        style={{ fontSize: "0.7rem", color: "#475569", lineHeight: 1.5 }}
      >
        High correlation (red) means positions tend to move together —
        reducing diversification benefit.
      </p>
    </div>
  );
}
