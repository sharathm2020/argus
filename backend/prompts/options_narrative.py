"""
options_narrative.py — GPT-4o prompt for options-based hedge recommendations.

Given a small set of real put contracts and the position's risk signals,
GPT-4o selects the most appropriate contract and explains its rationale.
"""

from typing import List, Dict, Any, Optional

OPTIONS_SYSTEM_PROMPT = """\
You are a derivatives strategist at a top-tier asset management firm. \
You review real put option contracts and recommend the most appropriate \
protective hedge for a given portfolio position. \
You always respond with valid JSON only — no markdown fences, no commentary outside the JSON.\
"""

_USER_TEMPLATE = """\
Review the following real put option contracts for {ticker} and recommend \
the best protective hedge given the position's current risk signals.

Position Risk Signals:
  Ticker:              {ticker}
  Asset Type:          {asset_type}
  Sentiment:           {sentiment_label} (DistilBERT confidence: {confidence_pct}%)
  DCF Margin of Safety:{dcf_mos}

Available Put Contracts (sorted by implied volatility, highest first):
{contracts_block}

Instructions:
- Select the single most appropriate contract from the list above.
- Weight your recommendation toward contracts where the risk signals \
(negative sentiment, overvalued DCF, high volatility) justify the hedge cost.
- For crypto assets, acknowledge the higher baseline volatility in your rationale.
- If the signals are too mild to justify protective puts at these premiums, \
return the skip response instead.

Return exactly one of these two JSON formats — no other text:

If recommending a contract:
{{
  "recommended_strike": <float>,
  "recommended_expiry": "<YYYY-MM-DD>",
  "implied_volatility": <float as percentage, e.g. 34.2>,
  "rationale": "<2-3 sentence explanation>",
  "conviction": "high" | "medium" | "low"
}}

If no contract is appropriate given current signals:
{{
  "skip": true,
  "reason": "<one sentence>"
}}\
"""


def build_options_prompt(
    ticker: str,
    asset_type: str,
    sentiment_label: Optional[str],
    confidence: Optional[float],
    dcf_margin_of_safety: Optional[float],
    put_candidates: List[Dict[str, Any]],
) -> str:
    """
    Render the user-facing prompt string for the options hedge LLM call.

    Returns the formatted prompt text (not a ChatPromptTemplate — the
    caller constructs messages directly for a one-shot LLM call).
    """
    confidence_pct = (
        f"{confidence * 100:.1f}" if confidence is not None else "N/A"
    )

    if dcf_margin_of_safety is not None:
        dcf_mos = f"{dcf_margin_of_safety:+.1f}% ({'undervalued' if dcf_margin_of_safety > 0 else 'overvalued'})"
    else:
        dcf_mos = "N/A (DCF not available for this asset type)"

    lines = []
    for i, c in enumerate(put_candidates, 1):
        iv_str = f"{c['impliedVolatility']}%" if c.get("impliedVolatility") is not None else "N/A"
        bid_ask = (
            f"${c['bid']:.2f} / ${c['ask']:.2f}"
            if c.get("bid") is not None and c.get("ask") is not None
            else "N/A"
        )
        lines.append(
            f"  {i}. Strike ${c['strike']:.2f} | Expiry {c['expiration']} | "
            f"IV {iv_str} | Bid/Ask {bid_ask} | OI {c.get('openInterest', 'N/A')}"
        )
    contracts_block = "\n".join(lines)

    return _USER_TEMPLATE.format(
        ticker=ticker,
        asset_type=asset_type,
        sentiment_label=sentiment_label or "unknown",
        confidence_pct=confidence_pct,
        dcf_mos=dcf_mos,
        contracts_block=contracts_block,
    )
