# Argus — Portfolio Risk Copilot

Argus is an AI-powered portfolio risk analysis tool that combines live financial news, SEC 10-K filings, and GPT-4o to generate a comprehensive risk assessment for every position in your portfolio. Enter your tickers and weights, and Argus returns structured risk narratives, key risk factors, and sentiment scores — all in under a minute.

---

## Features

- **Per-ticker risk analysis** — AI-generated risk narrative, 3–5 key risks, and a sentiment score (−1.0 to +1.0) for each position
- **Batch news ingestion** — fetches recent headlines for all tickers in a single Alpaca Markets API call
- **SEC 10-K risk factors** — downloads the most recent 10-K via the EDGAR REST API and extracts Item 1A automatically
- **Stock fundamentals** — pulls current price, sector, and market cap via Financial Modeling Prep
- **Portfolio-level summary** — cross-portfolio risk synthesis weighted by position size
- **Responsive dark UI** — Bloomberg-style React frontend with real-time weight validation

---

## Tech Stack

### Backend
- **FastAPI** — REST API framework
- **LangChain + GPT-4o** — risk narrative generation and portfolio summary
- **EDGAR REST API** — SEC 10-K filing retrieval (no third-party downloader)
- **Alpaca Markets API** — financial news headlines
- **Financial Modeling Prep API** — stock fundamentals (price, sector, market cap)
- **Pydantic v2** — request/response validation
- **python-dotenv** — environment variable management

### Frontend
- **React 18 + Vite** — component framework and dev server
- **Tailwind CSS** — utility-first styling with custom dark navy theme
- **JetBrains Mono** — monospace font for tickers and numbers

---

## Getting Started

### Prerequisites

- Python 3.10 or higher
- Node.js 18 or higher
- API keys for:
  - [OpenAI](https://platform.openai.com/api-keys) — GPT-4o access required
  - [Alpaca Markets](https://alpaca.markets/) — free tier sufficient
  - [Financial Modeling Prep](https://financialmodelingprep.com/) — free tier sufficient

### Backend Setup

```bash
# 1. Navigate to the project root
cd argus

# 2. Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate        # macOS / Linux
# .venv\Scripts\activate         # Windows

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure environment variables
cp .env.example .env
# Open .env and fill in your OPENAI_API_KEY, ALPACA_API_KEY,
# ALPACA_SECRET_KEY, and FMP_API_KEY

# 5. Start the backend server
cd backend
uvicorn main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`.
Interactive docs: `http://localhost:8000/docs`

### Frontend Setup

```bash
# In a separate terminal, from the project root
cd frontend

# Install dependencies
npm install

# Start the Vite dev server
npm run dev
```

The app will be available at `http://localhost:5173`.
API requests are automatically proxied to the backend at port 8000.

---

## Architecture

Architecture diagram coming in Phase 4.

---

## Roadmap

- **Phase 1** ✅ — Core pipeline: portfolio input, EDGAR + news fetching, GPT-4o risk analysis, results UI
- **Phase 2** ✅ — Historical analysis, portfolio comparison, exportable PDF reports
- **Phase 3** 🔜 — User accounts, saved portfolios, alerting on risk threshold changes
- **Phase 4** 🔜 — Real-time data feeds, WebSocket streaming, multi-model support

---

## Disclaimer

This tool is for informational purposes only and does not constitute financial advice.
