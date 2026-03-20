# Argus — AI Portfolio Risk Copilot

> Analyze multi-asset portfolios with a custom DistilBERT sentiment model, real financial data, SEC filings, and GPT-4o narrative generation.

**Live app:** [https://argus-production-0f5b.up.railway.app/]  &nbsp;|&nbsp; **Version:** v0.4.0

![Python](https://img.shields.io/badge/Python-3.11-blue?logo=python&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![HuggingFace](https://img.shields.io/badge/HuggingFace-sharathm20%2Fargus--finbert-FFD21E?logo=huggingface&logoColor=black)

---

## What is Argus?

Argus is an AI-powered Portfolio Risk Copilot designed to give investors a comprehensive, data-driven view of risk across their entire portfolio in under a minute. You submit a list of tickers and weights; Argus fetches live market data, SEC filings, and financial news, then synthesizes everything into structured risk narratives, sentiment scores, and actionable hedging suggestions — one per position and one at the portfolio level.

At the core of Argus is a custom fine-tuned DistilBERT model trained on financial text (financial_phrasebank + FiQA datasets) that classifies sentiment into four classes: positive, negative, neutral, and mixed. This is combined with per-ticker CAPM discount rates using live 10-year Treasury yields, DCF intrinsic value estimates, comparable company analysis against FMP peer groups, and real put option contracts via yfinance for options-based hedging.

Argus supports three asset classes natively. Equities receive the full analysis suite: EDGAR 10-K extraction, DCF valuation, comps, and options hedging. ETFs are analyzed with sector concentration awareness, skipping DCF since it's not meaningful for fund structures. Crypto positions use CoinGecko market data and are framed around volatility and regulatory risk rather than earnings — because GPT-4o is instructed to reason about each asset type appropriately.

---

## Key Features

- **4-class DistilBERT sentiment model** — custom fine-tuned on financial_phrasebank + FiQA, hosted on HuggingFace Hub (`sharathm20/argus-finbert`). Classifies news and filing text as positive, negative, neutral, or mixed with confidence scores.
- **Per-ticker CAPM discount rates** — live 10-year Treasury yield from FMP + per-ticker beta, giving each equity a defensible, market-implied discount rate rather than a hardcoded WACC.
- **Comparable Company Analysis** — P/E, EV/EBITDA, P/S, and P/FCF vs. FMP peer group medians, with premium/discount percentages and an overall valuation signal.
- **Options-based hedging** — real put contract data via yfinance filtered to 21–60 day expiry, 80–100% moneyness, and open interest ≥ 100. GPT-4o recommends the most appropriate contract given sentiment and DCF signals.
- **Historical sentiment trend** — DistilBERT scores persisted to Supabase with a 15-minute write cooldown. Visualized as a Recharts time-series in the UI with 7d/30d/All range toggle.
- **Multi-asset support** — Equities via FMP, ETFs via FMP (DCF/comps skipped), Crypto via CoinGecko (volatility-framed analysis, options hedging still attempted).
- **SEC EDGAR 10-K extraction** — fetches Item 1A risk factors from the latest 10-K via EDGAR REST API; GPT-4o mini cleans preamble before analysis.
- **Ranked hedging suggestions** — 2–3 ranked position-level hedges per flagged ticker (inverse ETFs, safe havens, sector rotation, options concepts) with conviction levels and explanations, plus portfolio-level recommendations.

---

## Tech Stack

| Layer | Technologies |
|---|---|
| **Backend** | FastAPI, Python 3.11, LangChain, GPT-4o / GPT-4o mini |
| **Frontend** | React 18, Vite, Recharts, Tailwind CSS |
| **ML** | HuggingFace Transformers, DistilBERT, `sharathm20/argus-finbert` |
| **Training data** | `financial_phrasebank` (allagree split), FiQA sentiment, GPT-4o synthetic mixed-class samples |
| **Market data** | Financial Modeling Prep (FMP), Alpaca News API, CoinGecko, yfinance |
| **Filings** | SEC EDGAR REST API (no third-party downloader) |
| **Infrastructure** | Railway (backend + frontend), Docker, GitHub Actions CI |
| **Persistence** | Supabase (PostgreSQL) — sentiment history |

---

## Development Phases

### Phase 1 — Foundation
Core FastAPI backend with a LangChain + GPT-4o risk narrative pipeline. React frontend with live weight validation and a Bloomberg-style dark theme. FMP integration for price, sector, and market cap. Initial Alpaca news batch fetching. Deployed to Railway with a Docker-based build pipeline and a GitHub Actions CI workflow for build validation.

### Phase 2 — Intelligence Layer
Fine-tuned DistilBERT on `financial_phrasebank` (3-class: positive/negative/neutral), replacing the GPT-4o fallback sentiment score with a dedicated inference model. SEC EDGAR 10-K Item 1A extraction via the EDGAR REST API. DCF valuation module with 5-year projections, sector-based WACC, and margin-of-safety verdict. DistilBERT confidence scores surfaced in the UI with tooltips.

### Phase 3 — Scale & Reliability
Model rotation strategy: GPT-4o for portfolios ≤ 10 tickers, GPT-4o mini for 11–20, chunked parallel batches for > 20. 50-ticker portfolio cap. EDGAR preamble extraction rewritten using GPT-4o mini rather than brittle regex heuristics. Training data expanded with FiQA dataset. Alpaca news capped at the API's 50-article maximum. Ranked multi-hedge suggestions (2–3 per ticker) with hedge type and conviction level fields added to the hedging prompt.

### Phase 4 — Advanced Analytics *(v0.4.0, current)*
4-class DistilBERT upgrade (positive/negative/neutral/mixed) with synthetic GPT-4o training data for the mixed class. Multi-asset classification (equity/ETF/crypto) with asset-type-aware prompting, CoinGecko integration for crypto market data, and ETF/crypto sector labels in portfolio concentration. CAPM per-ticker discount rates using live Treasury yields and FMP beta. Dynamic terminal growth rates in the DCF model. Comparable company analysis (comps) tab with FMP peer ratios. Options-based hedging using real yfinance put contracts with GPT-4o recommendation. Historical sentiment trend via Supabase with a Recharts time-series modal. Industry-label fallback for equities missing a sector classification.

---

## Architecture Overview

```
User submits portfolio (tickers + weights)
        │
        ▼
FastAPI — validates input, creates async job
        │
        ├── EDGAR REST API ──────── 10-K Item 1A risk factors
        ├── FMP /stable/profile ─── sector, beta, market cap, industry
        ├── FMP /stable/ratios ──── valuation multiples (comps)
        ├── FMP /stable/options ─── (yfinance) put contracts
        ├── FMP /stable/treasury ── live risk-free rate (CAPM)
        ├── Alpaca News API ──────── recent headlines per ticker
        └── CoinGecko API ────────── crypto price + market cap
                │
                ▼
        DistilBERT inference (per ticker, from HuggingFace Hub)
                │
                ▼
        GPT-4o / GPT-4o mini
          ├── Risk narrative + key risks (per ticker)
          ├── Portfolio-level summary
          ├── EDGAR preamble cleaning (GPT-4o mini)
          ├── Hedging suggestions (portfolio-level)
          └── Options hedge recommendation (per ticker)
                │
                ▼
        Supabase — persist sentiment scores (15-min cooldown)
                │
                ▼
        React frontend renders:
          TickerCard (Risk / DCF / Comps tabs)
          HedgingSuggestions (Position Hedges / Options Protection tabs)
          SentimentTrendModal (Recharts time-series)
          RiskSummary (portfolio gauge + sector concentration)
```

---

## Local Development

### Prerequisites

- Python 3.11+
- Node.js 18+
- API keys (see environment variables below)

### Backend

```bash
# From project root
python -m venv .venv
source .venv/bin/activate       # macOS/Linux
# .venv\Scripts\activate        # Windows

pip install -r requirements.txt

cp .env.example .env
# Fill in your API keys in .env

cd backend
uvicorn main:app --reload --port 8000
```

API available at `http://localhost:8000` — interactive docs at `http://localhost:8000/docs`.

### Frontend

```bash
# In a separate terminal, from project root
cd frontend
npm install
npm run dev
```

App available at `http://localhost:5173`. Vite proxies API requests to port 8000.

### Required Environment Variables

| Variable | Source |
|---|---|
| `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com/api-keys) |
| `FMP_API_KEY` | [financialmodelingprep.com](https://financialmodelingprep.com/) |
| `ALPACA_API_KEY` + `ALPACA_SECRET_KEY` | [alpaca.markets](https://alpaca.markets/) |
| `COINGECKO_API_KEY` | [coingecko.com/api](https://www.coingecko.com/en/api) |
| `SUPABASE_URL` + `SUPABASE_KEY` | [supabase.com](https://supabase.com/) |
| `HF_TOKEN` | [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) |

---

## Disclaimer

This tool is for informational purposes only and does not constitute financial advice. All analysis is AI-generated and should not be relied upon for investment decisions. Consult a qualified financial advisor before acting on any output from Argus.

---

*Built in public by Sharath Mahadevan — [LinkedIn](https://linkedin.com/in/sharath-mahadevan-a55246209)*
