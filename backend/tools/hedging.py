"""
hedging.py — GPT-4o-powered hedging suggestion generator.

DistilBERT sentiment signals (label + confidence) drive which tickers are
flagged for per-position hedging. GPT-4o generates the actual suggestion text.
"""

import json
import logging
import re
from typing import Any, Dict, List, Optional

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage

from prompts.risk_narrative import HEDGING_SYSTEM_PROMPT, HEDGING_USER_TEMPLATE

logger = logging.getLogger(__name__)

_FALLBACK = {
    "ticker_hedges": [],
    "portfolio_recommendations": ["Unable to generate hedging suggestions at this time."],
    "error": True,
}


def _build_portfolio_context(
    ticker_results: List[Any],
    sector_concentration: Optional[Dict[str, Any]],
    overall_sentiment: float,
) -> str:
    """Serialize portfolio risk signals into a compact context string for the prompt."""
    lines: List[str] = []

    for r in ticker_results:
        # Sentiment label derived from score (mirrors DistilBERT label mapping in agent.py)
        if r.sentiment_score > 0.2:
            sentiment_label = "positive"
        elif r.sentiment_score < -0.2:
            sentiment_label = "negative"
        else:
            sentiment_label = "neutral"

        confidence = (
            f"{r.confidence_score:.2f}" if r.confidence_score is not None else "N/A"
        )
        dcf_verdict = "N/A"
        if r.dcf_data and r.dcf_data.get("available"):
            dcf_verdict = r.dcf_data.get("verdict", "N/A")

        lines.append(
            f"  {r.ticker}: weight={r.weight * 100:.1f}%, "
            f"sentiment={sentiment_label} (confidence={confidence}), "
            f"DCF={dcf_verdict}"
        )

    context = "Positions:\n" + "\n".join(lines)
    context += f"\n\nOverall portfolio sentiment score: {overall_sentiment:+.3f}"

    if sector_concentration and sector_concentration.get("has_flags"):
        flags = sector_concentration.get("flags", [])
        flag_strs = [f["message"] for f in flags]
        context += "\n\nSector concentration flags:\n" + "\n".join(
            f"  ⚠️ {msg}" for msg in flag_strs
        )

    return context


def _strip_fences(text: str) -> str:
    """Strip markdown code fences defensively in case GPT-4o wraps the JSON."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()


async def generate_hedging_suggestions(
    ticker_results: List[Any],
    sector_concentration: Optional[Dict[str, Any]],
    overall_sentiment: float,
) -> Dict[str, Any]:
    """
    Generate hedging suggestions using GPT-4o.

    DistilBERT sentiment labels and confidence scores from ticker_results
    are the input signal. GPT-4o produces the human-readable suggestions.

    Returns:
        {
            "ticker_hedges": [
                {"ticker": "X", "hedges": [{"rank", "hedge_instrument", "hedge_type",
                                            "conviction", "explanation"}, ...]},
                ...
            ],
            "portfolio_recommendations": ["...", ...],
        }
        On failure: {"ticker_hedges": [], "portfolio_recommendations": [...], "error": True}
    """
    try:
        portfolio_context = _build_portfolio_context(
            ticker_results, sector_concentration, overall_sentiment
        )

        llm = ChatOpenAI(model="gpt-4o", temperature=0.3, max_tokens=900)

        prompt_text = HEDGING_USER_TEMPLATE.format(
            portfolio_context=portfolio_context
        )

        response = await llm.ainvoke([
            SystemMessage(content=HEDGING_SYSTEM_PROMPT),
            HumanMessage(content=prompt_text),
        ])

        raw = _strip_fences(response.content)
        parsed = json.loads(raw)

        # Validate expected keys are present
        if "ticker_hedges" not in parsed or "portfolio_recommendations" not in parsed:
            raise ValueError("Response missing required keys")

        return parsed

    except Exception as exc:
        logger.warning("Hedging suggestion generation failed: %s", exc)
        return _FALLBACK
