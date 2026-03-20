"""
portfolio_analysis.py — Portfolio-level aggregation utilities.

Contains pure-Python calculations that operate on the completed set of
per-ticker results. No API calls, no LLM calls.
"""

from typing import Any, Dict, List

from models.schemas import TickerRiskResult


def calculate_sector_concentration(results: List[TickerRiskResult]) -> Dict[str, Any]:
    """
    Group portfolio weights by sector and flag any sector >= 40%.

    Sector is read from result.dcf_data["sector"] when DCF data is available;
    tickers without DCF data (ETFs, crypto, etc.) contribute to "Unknown".

    Returns:
        {
            "breakdown": {"Technology": 60.0, ...},
            "flags": [{"sector": ..., "weight": ..., "message": ...}, ...],
            "has_flags": bool,
        }
    """
    sector_weights: Dict[str, float] = {}
    for r in results:
        sector = "Unknown"
        if r.dcf_data and r.dcf_data.get("available") and r.dcf_data.get("sector"):
            sector = r.dcf_data["sector"]
        elif r.asset_type == "crypto":
            sector = "Cryptocurrency"
        elif r.asset_type == "etf":
            sector = "ETF"
        elif r.asset_type == "equity":
            # DCF sector missing/unknown — fall back to FMP industry, then generic label
            industry = (r.industry or "").strip()
            sector = industry if industry else "Other/Unclassified"
        sector_weights[sector] = sector_weights.get(sector, 0.0) + r.weight

    breakdown = {s: round(w * 100, 1) for s, w in sector_weights.items()}

    flags = [
        {
            "sector": s,
            "weight": w,
            "message": f"{w}% of your portfolio is concentrated in {s}",
        }
        for s, w in breakdown.items()
        if w >= 40.0
    ]

    return {"breakdown": breakdown, "flags": flags, "has_flags": len(flags) > 0}
