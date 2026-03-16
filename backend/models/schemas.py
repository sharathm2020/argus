"""
Pydantic models for Argus Portfolio Risk Copilot.
Defines request and response schemas with validation.
"""

from typing import List, Optional
from pydantic import BaseModel, field_validator, model_validator


class TickerInput(BaseModel):
    """A single portfolio position: ticker symbol and its portfolio weight."""
    ticker: str
    weight: float  # Must be between 0 and 1

    @field_validator("ticker")
    @classmethod
    def ticker_must_be_valid(cls, v: str) -> str:
        v = v.strip().upper()
        if not v.isalpha() or len(v) > 5:
            raise ValueError(f"Invalid ticker symbol: '{v}'. Must be 1-5 alpha characters.")
        return v

    @field_validator("weight")
    @classmethod
    def weight_must_be_valid(cls, v: float) -> float:
        if not (0.0 < v <= 1.0):
            raise ValueError(f"Weight must be between 0 (exclusive) and 1 (inclusive), got {v}.")
        return v


class PortfolioRequest(BaseModel):
    """Incoming portfolio analysis request."""
    portfolio: List[TickerInput]

    @model_validator(mode="after")
    def weights_must_sum_to_one(self) -> "PortfolioRequest":
        total = sum(item.weight for item in self.portfolio)
        if abs(total - 1.0) > 0.01:
            raise ValueError(
                f"Portfolio weights must sum to 1.0 (±0.01), but they sum to {total:.4f}."
            )
        if len(self.portfolio) == 0:
            raise ValueError("Portfolio must contain at least one ticker.")
        return self


class TickerRiskResult(BaseModel):
    """Risk analysis result for a single ticker."""
    ticker: str
    weight: float
    risk_summary: str                # 2-3 sentence narrative
    key_risks: List[str]             # 3-5 short bullet-point strings
    sentiment_score: float           # -1.0 (most negative) to 1.0 (most positive)
    news_headlines: List[str]        # Raw headlines used in analysis
    edgar_excerpt: Optional[str] = None   # Short excerpt from SEC 10-K risk factors
    confidence_score: Optional[float] = None  # DistilBERT confidence (0–1)


class PortfolioRiskResponse(BaseModel):
    """Complete portfolio risk analysis response."""
    results: List[TickerRiskResult]
    portfolio_summary: str           # Synthesized cross-portfolio narrative
    overall_sentiment: float         # Weighted average of individual sentiment scores
