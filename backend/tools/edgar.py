"""
SEC EDGAR 10-K Risk Factors fetcher.

Uses the EDGAR REST API directly — no third-party downloader dependency.
Flow per ticker:
  1. Resolve ticker -> CIK via EDGAR company search
  2. Pull submission history to find most recent 10-K accession number
  3. Fetch filing index to locate primary document
  4. Download document and extract Item 1A (Risk Factors)
"""

import logging
import re
import time
from typing import Dict

import httpx

logger = logging.getLogger(__name__)

# EDGAR requires a descriptive User-Agent or requests get throttled/blocked
EDGAR_HEADERS = {
    "User-Agent": "ArgusRiskCopilot argus@example.com",
    "Accept-Encoding": "gzip, deflate",
    "Host": "data.sec.gov",
}

EDGAR_SEARCH_HEADERS = {
    "User-Agent": "ArgusRiskCopilot argus@example.com",
    "Accept-Encoding": "gzip, deflate",
    "Host": "efts.sec.gov",
}

FILING_HEADERS = {
    "User-Agent": "ArgusRiskCopilot argus@example.com",
    "Accept-Encoding": "gzip, deflate",
    "Host": "www.sec.gov",
}

MAX_RISK_CHARS = 8000

_ITEM_1A_START = re.compile(
    r"item\s+1a[\s.:\-–—]*(?:risk\s+factors)?",
    re.IGNORECASE | re.MULTILINE,
)
_ITEM_1B_START = re.compile(
    r"item\s+1b[\s.:\-–—]*(?:unresolved\s+staff\s+comments)?",
    re.IGNORECASE | re.MULTILINE,
)


def _strip_html(text: str) -> str:
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&#\d+;", " ", text)      # numeric entities like &#160;
    text = re.sub(r"&[a-zA-Z]+;", " ", text) # named entities like &amp;
    return text


def _normalize_whitespace(text: str) -> str:
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _extract_risk_factors(raw_text: str) -> str:
    # Strip HTML and numeric entities first
    cleaned_text = _strip_html(raw_text)
    cleaned_text = re.sub(r"&#\d+;", " ", cleaned_text)
    cleaned_text = re.sub(r"&[a-zA-Z]+;", " ", cleaned_text)

    matches = list(_ITEM_1A_START.finditer(cleaned_text))
    if not matches:
        return ""

    # Cross-references start with these phrases — skip them
    cross_ref_patterns = re.compile(
        r"^\s*(of\s+this|in\s+this|under\s+the|see\s+also|as\s+discussed|part\s+i)",
        re.IGNORECASE
    )

    for match in matches:
        section_text = cleaned_text[match.end():]
        normalized_start = _normalize_whitespace(section_text[:100])

        # Skip cross-references
        if cross_ref_patterns.match(normalized_start):
            continue

        # Find Item 1B boundary
        end_match = _ITEM_1B_START.search(section_text)
        if end_match:
            candidate = section_text[:end_match.start()]
        else:
            candidate = section_text

        normalized = _normalize_whitespace(candidate)

        # Must be substantial content
        if len(normalized) >= 500:
            return normalized[:MAX_RISK_CHARS]

    return ""

def _get_cik(ticker: str, client: httpx.Client) -> str:
    """Resolve ticker symbol to zero-padded CIK using EDGAR company search."""
    url = f"https://efts.sec.gov/LATEST/search-index?q=%22{ticker}%22&dateRange=custom&startdt=2020-01-01&forms=10-K"
    # Simpler and more reliable: use the company tickers JSON EDGAR publishes
    tickers_url = "https://www.sec.gov/files/company_tickers.json"
    resp = client.get(tickers_url, headers=FILING_HEADERS)
    resp.raise_for_status()
    data = resp.json()

    ticker_upper = ticker.upper()
    for entry in data.values():
        if entry.get("ticker", "").upper() == ticker_upper:
            cik = str(entry["cik_str"]).zfill(10)
            logger.info("Resolved %s -> CIK %s", ticker, cik)
            return cik

    raise ValueError(f"Could not resolve CIK for ticker: {ticker}")


def _get_latest_10k_accession(cik: str, client: httpx.Client) -> str:
    """Get the accession number of the most recent 10-K filing."""
    url = f"https://data.sec.gov/submissions/CIK{cik}.json"
    resp = client.get(url, headers=EDGAR_HEADERS)
    resp.raise_for_status()
    data = resp.json()

    filings = data.get("filings", {}).get("recent", {})
    forms = filings.get("form", [])
    accessions = filings.get("accessionNumber", [])

    for form, accession in zip(forms, accessions):
        if form == "10-K":
            logger.info("Found 10-K accession %s for CIK %s", accession, cik)
            return accession

    raise ValueError(f"No 10-K found in recent filings for CIK {cik}")


def _get_primary_document_url(cik: str, accession: str, client: httpx.Client) -> str:
    """Get the URL of the primary 10-K document from the filing index."""
    accession_clean = accession.replace("-", "")
    cik_int = int(cik)

    # Correct EDGAR filing index URL format
    index_url = (
        f"https://www.sec.gov/cgi-bin/browse-edgar"
        f"?action=getcompany&CIK={cik_int}&type=10-K&dateb=&owner=include&count=1&search_text="
    )

    # Use the submissions data we already have — fetch the filing index directly
    index_url = (
        f"https://www.sec.gov/Archives/edgar/data/{cik_int}/"
        f"{accession_clean}/"
    )

    resp = client.get(
        f"https://data.sec.gov/submissions/CIK{cik}.json",
        headers=EDGAR_HEADERS
    )
    resp.raise_for_status()
    data = resp.json()

    # Get filing details from submissions
    filings = data.get("filings", {}).get("recent", {})
    forms = filings.get("form", [])
    accessions = filings.get("accessionNumber", [])
    primary_docs = filings.get("primaryDocument", [])

    for form, acc, doc in zip(forms, accessions, primary_docs):
        if form == "10-K" and acc == accession:
            url = (
                f"https://www.sec.gov/Archives/edgar/data/{cik_int}/"
                f"{accession_clean}/{doc}"
            )
            logger.info("Primary 10-K document: %s", url)
            return url

    raise ValueError(f"Could not find primary document for accession {accession}")

def _fetch_single_ticker(ticker: str, client: httpx.Client) -> str:
    """Full pipeline for a single ticker. Returns risk factors text or empty string."""
    cik = _get_cik(ticker, client)
    time.sleep(0.15)  # be polite to EDGAR — they will throttle aggressive requests

    accession = _get_latest_10k_accession(cik, client)
    time.sleep(0.15)

    doc_url = _get_primary_document_url(cik, accession, client)
    time.sleep(0.15)

    resp = client.get(doc_url, headers=FILING_HEADERS, timeout=30.0)
    resp.raise_for_status()
    raw_text = resp.text

    return _extract_risk_factors(raw_text)


def fetch_risk_factors_batch(tickers: list[str]) -> Dict[str, str]:
    """
    Fetch Item 1A Risk Factors for a list of tickers via EDGAR REST API.

    Returns:
        Dict mapping ticker -> risk factors text.
        Empty or unavailable filings return a descriptive placeholder string.
    """
    result: Dict[str, str] = {}

    with httpx.Client(timeout=30.0) as client:
        for ticker in tickers:
            try:
                risk_text = _fetch_single_ticker(ticker, client)
                if not risk_text:
                    raise ValueError("Item 1A section not found in filing")
                result[ticker] = risk_text
                logger.info("Extracted %d chars for %s", len(risk_text), ticker)
            except Exception as exc:
                logger.warning("10-K fetch failed for %s: %s", ticker, exc)
                result[ticker] = (
                    f"Risk factors for {ticker} are currently unavailable "
                    f"(EDGAR API error: {exc})."
                )

    return result