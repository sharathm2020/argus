"""
LLM prompt templates for Argus risk narrative generation.

Uses LangChain's JsonOutputParser to enforce structured JSON output.
"""

from langchain_core.output_parsers import JsonOutputParser
from langchain_core.prompts import ChatPromptTemplate

# ── System prompt ────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """\
You are a senior financial risk analyst at a top-tier asset management firm. \
Your job is to produce clear, concise, data-driven risk assessments for portfolio positions. \
You synthesize SEC filings, news sentiment, and market fundamentals into actionable insights. \
You always respond with valid JSON — no markdown fences, no commentary outside the JSON object.\
"""

# ── User prompt template ─────────────────────────────────────────────────────

USER_PROMPT_TEMPLATE = """\
Analyze the risk profile for the following portfolio position:

Ticker:       {ticker}
Portfolio Weight: {weight_pct}% of total portfolio
Sector:       {sector}
Market Cap:   {market_cap}

Recent News Headlines:
{news_section}

SEC 10-K Risk Factors (Item 1A excerpt):
{risk_factors}

Based on the above, return a JSON object with exactly these fields:

{{
  "risk_summary": "<2-3 sentence narrative summarizing the key risk for this position>",
  "key_risks": [
    "<short risk bullet 1>",
    "<short risk bullet 2>",
    "<short risk bullet 3>"
  ],
  "sentiment_score": <float between -1.0 and 1.0, where -1 is extremely negative and 1 is extremely positive>
}}

Rules:
- risk_summary must be 2-3 complete sentences.
- key_risks must contain 3 to 5 items; each item is a short phrase (< 15 words).
- sentiment_score must reflect the overall news and filing sentiment for this position.
- Return only valid JSON. Do not include any text outside the JSON object.\
"""

# ── Portfolio summary prompt ──────────────────────────────────────────────────

PORTFOLIO_SUMMARY_TEMPLATE = """\
You are a senior portfolio risk manager. Below are the individual risk assessments \
for each position in a client's portfolio. Synthesize these into a concise, \
portfolio-level risk narrative that highlights the most important cross-portfolio risks, \
concentrations, or themes. Weight your analysis by position size.

Portfolio Positions and Risk Summaries:
{position_summaries}

Return a single paragraph (3-5 sentences) as a plain string — not JSON — \
that captures the overall portfolio risk posture. Focus on systemic risks, \
sector concentrations, and the most impactful individual risks.\
"""

# --- Porfolio System Prompt ---

PORTFOLIO_SYSTEM_PROMPT = """\
You are a senior portfolio risk manager at a top-tier asset management firm. \
Your job is to synthesize individual position risk assessments into a clear, \
concise portfolio-level narrative. Respond with plain prose only — no JSON, \
no markdown, no bullet points.\
"""

# ── Output parser ─────────────────────────────────────────────────────────────

# LangChain JSON parser — strips markdown fences and validates JSON structure
json_output_parser = JsonOutputParser()


# ── Prompt builders ───────────────────────────────────────────────────────────

def build_ticker_prompt(
    ticker: str,
    weight: float,
    sector: str,
    market_cap: int | None,
    news_headlines: list[str],
    risk_factors: str,
) -> ChatPromptTemplate:
    """
    Construct the ChatPromptTemplate for a single ticker risk analysis.

    This returns a runnable that, when invoked, calls the LLM and returns
    a parsed dict with keys: risk_summary, key_risks, sentiment_score.
    """
    # Format market cap as readable string
    if market_cap is None:
        market_cap_str = "N/A"
    elif market_cap >= 1_000_000_000_000:
        market_cap_str = f"${market_cap / 1_000_000_000_000:.2f}T"
    elif market_cap >= 1_000_000_000:
        market_cap_str = f"${market_cap / 1_000_000_000:.2f}B"
    elif market_cap >= 1_000_000:
        market_cap_str = f"${market_cap / 1_000_000:.2f}M"
    else:
        market_cap_str = f"${market_cap:,}"

    # Format news headlines
    if news_headlines:
        news_section = "\n".join(f"  - {h}" for h in news_headlines)
    else:
        news_section = "  (No recent news available)"

    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        ("human", USER_PROMPT_TEMPLATE),
    ])

    # Pre-fill the static variables; caller invokes with no additional vars
    return prompt.partial(
        ticker=ticker,
        weight_pct=f"{weight * 100:.1f}",
        sector=sector,
        market_cap=market_cap_str,
        news_section=news_section,
        risk_factors=risk_factors or "(No 10-K risk factors available)",
    )


def build_portfolio_summary_prompt() -> ChatPromptTemplate:
    """Construct the ChatPromptTemplate for the portfolio-level summary."""
    return ChatPromptTemplate.from_messages([
        ("system", PORTFOLIO_SYSTEM_PROMPT),
        ("human", PORTFOLIO_SUMMARY_TEMPLATE),
    ])