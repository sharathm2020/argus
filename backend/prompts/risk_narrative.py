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
Asset Type:   {asset_type_label}
Portfolio Weight: {weight_pct}% of total portfolio
Sector:       {sector}
Market Cap:   {market_cap}

Recent News Headlines:
{news_section}

{filing_section}

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
- {asset_type_guidance}
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

# ── Hedging prompt ────────────────────────────────────────────────────────────

HEDGING_SYSTEM_PROMPT = """\
You are a portfolio risk advisor specializing in hedging strategies. \
Your job is to review a portfolio's risk signals and suggest targeted, ranked hedges. \
You always respond with valid JSON only — no markdown fences, no commentary outside the JSON object.\
"""

HEDGING_USER_TEMPLATE = """\
Review the following portfolio risk data and generate hedging suggestions.

Portfolio Overview:
{portfolio_context}

Instructions:
- For Section 1 (ticker_hedges): include tickers that meet ANY of these criteria: \
(a) sentiment is "negative", (b) DCF verdict is "Overvalued", or \
(c) asset_type is "crypto" (regardless of sentiment, due to inherent volatility risk). \
Skip neutral/positive non-crypto tickers with no DCF concern. \
For each included ticker, generate 2-3 ranked hedge suggestions using different hedge types for diversity. \
For crypto tickers with neutral or positive sentiment, frame hedges around volatility risk \
(prefer safe_haven instruments like GLD, VXX, VIXY) rather than directional bearish bets; \
set conviction to "medium" or "low" accordingly.

Available hedge types and instruments:
  * inverse_etf: SQQQ, PSQ, SH, DOG, RWM (short Russell 2000)
  * safe_haven: GLD, TLT, VXX, VIXY
  * sector_rotation: XLP, XLU, XLV, XLF (rotate to defensive sectors)
  * options_concept: describe a protective put or collar conceptually — \
e.g. "consider put protection on X" — no specific strikes or expiry

Ranking rules:
  - Rank 1 is highest conviction based on strength of negative signals
  - Use different hedge_type values across the 2-3 hedges for each ticker
  - conviction must be "high", "medium", or "low"
  - Only use options_concept as rank 3, and only when the signal is very strong \
or other hedge types have been exhausted
  - Keep explanations concise — one sentence each

- For Section 2 (portfolio_recommendations): write 2-3 bullet points addressing the \
overall picture. Address sector concentration if flagged. Address overall sentiment direction. \
Suggest a cash allocation percentage only if overall sentiment is strongly negative (below -0.4). \
Keep each bullet to one concise sentence.

Respond ONLY in this exact JSON format with no markdown fences and no text outside the JSON:
{{
  "ticker_hedges": [
    {{
      "ticker": "TICKER",
      "hedges": [
        {{
          "rank": 1,
          "hedge_instrument": "Instrument name",
          "hedge_type": "inverse_etf",
          "conviction": "high",
          "explanation": "One sentence explaining why this hedge fits this position"
        }},
        {{
          "rank": 2,
          "hedge_instrument": "Instrument name",
          "hedge_type": "safe_haven",
          "conviction": "medium",
          "explanation": "One sentence explaining why this hedge fits this position"
        }}
      ]
    }}
  ],
  "portfolio_recommendations": [
    "Bullet point one",
    "Bullet point two"
  ]
}}\
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
    asset_type: str = "equity",
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

    # Asset type label shown in prompt header
    if asset_type == "crypto":
        asset_type_label = "Cryptocurrency"
    elif asset_type == "etf":
        asset_type_label = "ETF (Exchange-Traded Fund)"
    else:
        asset_type_label = "Equity (Common Stock)"

    # Filing section — 10-K for equities, descriptive fallback otherwise
    if asset_type == "crypto":
        filing_section = (
            "On-Chain / Market Context:\n"
            "  (Cryptocurrency — no SEC filing. Focus on protocol fundamentals, "
            "market sentiment, and regulatory environment.)"
        )
    elif asset_type == "etf":
        filing_section = (
            "ETF Holdings Context:\n"
            "  (ETF — no individual 10-K filing. Focus on underlying index or "
            "sector composition and fund-level risks.)"
        )
    else:
        filing_section = (
            f"SEC 10-K Risk Factors (excerpt):\n{risk_factors}"
            if risk_factors
            else "SEC 10-K Risk Factors:\n  (No 10-K risk factors available)"
        )

    # Asset-type-specific guidance injected into the prompt rules
    if asset_type == "crypto":
        asset_type_guidance = (
            "For cryptocurrency: focus on protocol volatility, regulatory risk, "
            "market sentiment, and correlation with broader crypto markets. "
            "Do NOT reference earnings, revenue, or SEC filings."
        )
    elif asset_type == "etf":
        asset_type_guidance = (
            "For ETF positions: focus on sector/factor concentration risk, "
            "underlying index exposure, and liquidity. "
            "Do NOT reference individual company earnings or revenue."
        )
    else:
        asset_type_guidance = (
            "For equity positions: analyze earnings quality, revenue growth "
            "trajectory, and competitive moat as part of the risk profile."
        )

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
        filing_section=filing_section,
        asset_type_label=asset_type_label,
        asset_type_guidance=asset_type_guidance,
    )


def build_portfolio_summary_prompt() -> ChatPromptTemplate:
    """Construct the ChatPromptTemplate for the portfolio-level summary."""
    return ChatPromptTemplate.from_messages([
        ("system", PORTFOLIO_SYSTEM_PROMPT),
        ("human", PORTFOLIO_SUMMARY_TEMPLATE),
    ])