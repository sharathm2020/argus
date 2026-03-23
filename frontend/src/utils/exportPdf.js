/**
 * exportPdf.js
 *
 * Generates a structured PDF report from Argus analysis data using jsPDF's
 * text/drawing APIs (no screenshot). Each page has an amber header bar and
 * a footer with the portfolio name and page number.
 */

import { jsPDF } from "jspdf";

// ── Design tokens ────────────────────────────────────────────────────────────

const AMBER   = [217, 119,   6];  // #d97706
const WHITE   = [255, 255, 255];  // #ffffff  — primary text / values
const DARK    = [ 15,  23,  42];  // #0f172a  — page background
const SLATE_4 = [148, 163, 184];  // #94a3b8  — secondary / label text
const GREEN   = [ 34, 197,  94];  // #22c55e  — positive sentiment
const RED     = [239,  68,  68];  // #ef4444  — negative sentiment

const PAGE_W    = 210; // A4 mm
const PAGE_H    = 297;
const MARGIN    = 16;
const CONTENT_W = PAGE_W - MARGIN * 2;
const HEADER_H  = 14;
const FOOTER_H  = 11;

// ── Helpers ───────────────────────────────────────────────────────────────────

function setFill(doc, rgb)  { doc.setFillColor(...rgb); }
function setDraw(doc, rgb)  { doc.setDrawColor(...rgb); }
function setColor(doc, rgb) { doc.setTextColor(...rgb); }

/** Wrap text to max width and return an array of lines. */
function wrapText(doc, text, maxWidth) {
  return doc.splitTextToSize(String(text ?? ""), maxWidth);
}

/** Fill the entire page with the dark navy background. Must be called first on every page. */
function fillPageBackground(doc) {
  setFill(doc, DARK);
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");
}

/**
 * Draw the amber header bar + label text.
 * Draws dark background first, then the bar.
 * Returns the Y position to start content below the bar.
 */
function drawPageHeader(doc, title) {
  // 1. Dark page background
  fillPageBackground(doc);

  // 2. Amber header bar
  setFill(doc, AMBER);
  doc.rect(0, 0, PAGE_W, HEADER_H, "F");

  // 3. Text inside bar — dark so it's readable on amber
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  setColor(doc, DARK);
  doc.text("ARGUS  ·  Portfolio Risk Report", MARGIN, 9.5);

  const tw = doc.getTextWidth(title);
  doc.text(title, PAGE_W - MARGIN - tw, 9.5);

  return HEADER_H + 6; // first usable Y
}

/**
 * Draw the amber footer bar with portfolio name and page number.
 * Called during the footer-patching pass at the end.
 */
function drawFooter(doc, portfolioName, pageNum, totalPages) {
  // Amber footer bar
  setFill(doc, AMBER);
  doc.rect(0, PAGE_H - FOOTER_H, PAGE_W, FOOTER_H, "F");

  // Dark text inside footer bar
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  setColor(doc, DARK);
  doc.text(portfolioName, MARGIN, PAGE_H - 4.5);
  const pg = `${pageNum} / ${totalPages}`;
  const pw = doc.getTextWidth(pg);
  doc.text(pg, PAGE_W - MARGIN - pw, PAGE_H - 4.5);
}

/** Thin amber divider line between sections. */
function divider(doc, y) {
  setDraw(doc, AMBER);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  return y + 4;
}

/** Remaining page height before the footer zone. */
function remaining(y) {
  return PAGE_H - FOOTER_H - 4 - y;
}

/** Returns the sentiment color tuple for a given score. */
function sentimentColor(score) {
  if (score > 0.2)  return GREEN;
  if (score < -0.2) return RED;
  return AMBER;
}

// ── Main export function ──────────────────────────────────────────────────────

/**
 * exportAnalysisToPdf
 *
 * @param {object} analysisData  — PortfolioRiskResponse object from the API
 * @param {string} portfolioName — display name (defaults to "My Portfolio")
 */
export async function exportAnalysisToPdf(analysisData, portfolioName = "My Portfolio") {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

  // Track which pages have footers (cover page is excluded)
  const pageFooters = [];

  function newPage(title) {
    doc.addPage();
    pageFooters.push({ title });
    return drawPageHeader(doc, title);
  }

  // ── Page 1: Cover ──────────────────────────────────────────────────────────

  // Dark background
  fillPageBackground(doc);

  // Amber header bar
  setFill(doc, AMBER);
  doc.rect(0, 0, PAGE_W, HEADER_H, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  setColor(doc, DARK);
  doc.text("ARGUS  ·  Portfolio Risk Report", MARGIN, 9.5);

  // Amber footer bar on cover
  setFill(doc, AMBER);
  doc.rect(0, PAGE_H - FOOTER_H, PAGE_W, FOOTER_H, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  setColor(doc, DARK);
  doc.text("For informational purposes only. Not financial advice.", MARGIN, PAGE_H - 4.5);

  // Center content
  const centerX = PAGE_W / 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(32);
  setColor(doc, WHITE);
  doc.text("ARGUS", centerX, 92, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  setColor(doc, AMBER);
  doc.text("Portfolio Risk Report", centerX, 104, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  setColor(doc, WHITE);
  doc.text(portfolioName, centerX, 122, { align: "center" });

  const results  = analysisData.results ?? [];
  const overall  = analysisData.overall_sentiment ?? 0;
  const sentLabel = overall > 0.2 ? "Positive" : overall < -0.2 ? "Negative" : "Neutral";

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  setColor(doc, SLATE_4);
  doc.text(`${results.length} position${results.length !== 1 ? "s" : ""}`, centerX, 140, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  setColor(doc, sentimentColor(overall));
  doc.text(
    `Overall Sentiment: ${sentLabel} (${overall >= 0 ? "+" : ""}${overall.toFixed(2)})`,
    centerX, 152, { align: "center" },
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  setColor(doc, SLATE_4);
  const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  doc.text(`Generated ${dateStr}`, centerX, 164, { align: "center" });

  pageFooters.push({ title: "Cover", isCover: true });

  // ── Pages 2+: Per-ticker cards ─────────────────────────────────────────────

  for (const result of results) {
    let y = newPage(result.ticker);

    const {
      ticker, weight, risk_summary, key_risks,
      sentiment_score, confidence_score, sentiment_label,
      dcf_data, asset_type,
    } = result;

    // Ticker heading — amber, large
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    setColor(doc, AMBER);
    doc.text(ticker, MARGIN, y);

    // Weight + asset type — secondary
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    setColor(doc, SLATE_4);
    doc.text(
      `${(weight * 100).toFixed(1)}% weight  ·  ${String(asset_type ?? "equity").toUpperCase()}`,
      MARGIN, y + 6,
    );

    // Sentiment badge — right-aligned
    const sentPct = confidence_score != null
      ? `${(confidence_score * 100).toFixed(1)}% confidence`
      : `score ${sentiment_score >= 0 ? "+" : ""}${sentiment_score.toFixed(2)}`;
    const sentLbl = sentiment_label
      ? `${sentiment_label.charAt(0).toUpperCase()}${sentiment_label.slice(1)}`
      : "";
    setColor(doc, sentimentColor(sentiment_score));
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(`${sentLbl}  (${sentPct})`, PAGE_W - MARGIN, y, { align: "right" });

    y += 12;
    y = divider(doc, y);

    // ── Risk Summary ──────────────────────────────────────────────────────────
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    setColor(doc, AMBER);
    doc.text("Risk Summary", MARGIN, y);
    y += 5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    setColor(doc, SLATE_4);
    const summaryLines = wrapText(doc, risk_summary, CONTENT_W);
    doc.text(summaryLines, MARGIN, y);
    y += summaryLines.length * 4.5 + 5;

    // ── Key Risks ─────────────────────────────────────────────────────────────
    if (key_risks?.length) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      setColor(doc, AMBER);
      doc.text("Key Risks", MARGIN, y);
      y += 5;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      setColor(doc, SLATE_4);
      for (const risk of key_risks) {
        const lines = wrapText(doc, `• ${risk}`, CONTENT_W);
        if (remaining(y) < lines.length * 4.5 + 8) y = newPage(ticker);
        doc.text(lines, MARGIN, y);
        y += lines.length * 4.5 + 1.5;
      }
      y += 3;
    }

    // ── DCF Valuation ─────────────────────────────────────────────────────────
    if (dcf_data?.available) {
      if (remaining(y) < 30) y = newPage(ticker);

      y = divider(doc, y);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      setColor(doc, AMBER);
      doc.text("DCF Valuation", MARGIN, y);
      y += 5;

      const verdictColor = dcf_data.verdict === "Undervalued"
        ? GREEN
        : dcf_data.verdict === "Overvalued"
        ? RED
        : AMBER;

      setColor(doc, verdictColor);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(dcf_data.verdict, MARGIN, y);
      y += 5;

      const dcfRows = [
        ["Current Price",    `$${dcf_data.current_price.toFixed(2)}`],
        ["Intrinsic Value",  `$${dcf_data.intrinsic_value.toFixed(2)}`],
        ["Margin of Safety", `${dcf_data.margin_of_safety >= 0 ? "+" : ""}${dcf_data.margin_of_safety.toFixed(1)}%`],
        ["Discount Rate",    `${(dcf_data.inputs.discount_rate * 100).toFixed(1)}%`],
        ["Revenue Growth",   `${(dcf_data.inputs.growth_rate * 100).toFixed(1)}%`],
      ];

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      for (const [label, value] of dcfRows) {
        setColor(doc, SLATE_4);
        doc.text(label, MARGIN, y);
        setColor(doc, WHITE);
        doc.text(value, PAGE_W - MARGIN, y, { align: "right" });
        y += 4.5;
      }
      y += 3;
    }
  }

  // ── Portfolio Summary page ─────────────────────────────────────────────────

  let y = newPage("Portfolio Summary");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  setColor(doc, WHITE);
  doc.text("Portfolio Summary", MARGIN, y);
  y += 8;
  y = divider(doc, y);

  // Overall sentiment
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  setColor(doc, AMBER);
  doc.text("Overall Sentiment", MARGIN, y);
  y += 5;
  setColor(doc, sentimentColor(overall));
  doc.setFontSize(10);
  doc.text(`${sentLabel}  (${overall >= 0 ? "+" : ""}${overall.toFixed(2)})`, MARGIN, y);
  y += 8;

  // Portfolio narrative
  if (analysisData.portfolio_summary) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    setColor(doc, AMBER);
    doc.text("Risk Narrative", MARGIN, y);
    y += 5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    setColor(doc, SLATE_4);
    const narrativeLines = wrapText(doc, analysisData.portfolio_summary, CONTENT_W);
    for (const line of narrativeLines) {
      if (remaining(y) < 8) y = newPage("Portfolio Summary");
      doc.text(line, MARGIN, y);
      y += 4.5;
    }
    y += 5;
  }

  // Sector concentration
  if (analysisData.sector_concentration) {
    const sectors = Object.entries(analysisData.sector_concentration)
      .sort(([, a], [, b]) => b - a);

    if (sectors.length) {
      if (remaining(y) < 20) y = newPage("Portfolio Summary");

      y = divider(doc, y);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      setColor(doc, AMBER);
      doc.text("Sector Concentration", MARGIN, y);
      y += 5;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      for (const [sector, pct] of sectors) {
        if (remaining(y) < 6) y = newPage("Portfolio Summary");
        setColor(doc, SLATE_4);
        doc.text(sector, MARGIN, y);
        setColor(doc, WHITE);
        doc.text(`${(pct * 100).toFixed(1)}%`, PAGE_W - MARGIN, y, { align: "right" });
        y += 4.5;
      }
      y += 5;
    }
  }

  // Hedging suggestions
  if (analysisData.hedging_suggestions?.length) {
    if (remaining(y) < 20) y = newPage("Portfolio Summary");

    y = divider(doc, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    setColor(doc, AMBER);
    doc.text("Hedging Suggestions", MARGIN, y);
    y += 5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    for (const suggestion of analysisData.hedging_suggestions) {
      const lines = wrapText(doc, `• ${suggestion}`, CONTENT_W);
      if (remaining(y) < lines.length * 4.5 + 6) y = newPage("Portfolio Summary");
      setColor(doc, SLATE_4);
      doc.text(lines, MARGIN, y);
      y += lines.length * 4.5 + 2;
    }
  }

  // ── Patch all page footers ─────────────────────────────────────────────────

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const { isCover } = pageFooters[i - 1] ?? {};
    if (!isCover) {
      drawFooter(doc, portfolioName, i, totalPages);
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  const safeName = portfolioName.replace(/[^a-z0-9]/gi, "_").toLowerCase();
  doc.save(`argus_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
