"""
sentiment_analyzer.py — Lazy-loaded DistilBERT financial sentiment inference.

The model is loaded from models/sentiment/ on the first call to analyze_sentiment().
Subsequent calls reuse the loaded singleton — startup time is not affected.
"""

import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from huggingface_hub import hf_hub_download
import shutil

import torch
import torch.nn.functional as F

logger = logging.getLogger(__name__)

_MODEL_DIR = Path(__file__).parent / "models" / "sentiment"

# Singleton holders — populated on first inference call
_tokenizer = None
_model = None


def _ensure_model_downloaded() -> None:
    """Download model files individually from HuggingFace Hub if not already present."""
    model_file = _MODEL_DIR / "model.safetensors"
    if model_file.exists():
        return

    logger.info("Downloading sentiment model from HuggingFace...")

    token = os.environ.get("HF_TOKEN")
    repo_id = "sharathm20/argus-finbert"

    files_to_download = [
        "model.safetensors",
        "config.json",
        "tokenizer.json",
        "tokenizer_config.json",
        "training_args.bin",
    ]

    _MODEL_DIR.mkdir(parents=True, exist_ok=True)

    for filename in files_to_download:
        try:
            cached_path = hf_hub_download(
                repo_id=repo_id,
                filename=filename,
                token=token,
            )
            dest = _MODEL_DIR / filename
            shutil.copy2(cached_path, dest)
            logger.info("Downloaded %s to %s", filename, dest)
        except Exception as e:
            if filename == "model.safetensors":
                raise RuntimeError(
                    f"Failed to download required file {filename}: {e}"
                ) from e
            else:
                logger.warning("Could not download optional file %s: %s", filename, e)

    if not model_file.exists():
        raise RuntimeError(
            f"Model download appeared to succeed but model.safetensors "
            f"not found at {_MODEL_DIR}"
        )

    logger.info("Model download complete.")


def _load_model() -> None:
    """Load the tokenizer and model into module-level singletons (once)."""
    global _tokenizer, _model
    if _model is not None:
        return  # already loaded

    _ensure_model_downloaded()

    # Defer heavy imports so FastAPI startup is unaffected when model is absent
    from transformers import (  # noqa: PLC0415
        AutoTokenizer,
        DistilBertForSequenceClassification,
    )

    logger.info("Loading DistilBERT sentiment model from %s", _MODEL_DIR)
    _tokenizer = AutoTokenizer.from_pretrained(str(_MODEL_DIR))
    _model = DistilBertForSequenceClassification.from_pretrained(str(_MODEL_DIR))
    _model.eval()
    logger.info("Sentiment model loaded successfully.")


def preload_model() -> None:
    """Call at application startup to load model before requests arrive."""
    _load_model()


def analyze_sentiment(text: str) -> Dict:
    """
    Run financial sentiment inference on a single text string.

    Args:
        text: Raw text to classify (news headlines, filing excerpts, etc.)

    Returns:
        {
            "label":      "positive" | "negative" | "neutral" | "mixed",
            "score":      float,   # confidence of the predicted class (0–1)
            "all_scores": {
                "positive": float,
                "negative": float,
                "neutral":  float,
                "mixed":    float,
            }
        }

    Raises:
        RuntimeError: If the model directory is missing or empty.
    """
    _load_model()

    inputs = _tokenizer(
        text,
        return_tensors="pt",
        truncation=True,
        padding=True,
        max_length=128,
        return_token_type_ids=False,
    )

    with torch.no_grad():
        outputs = _model(**inputs)

    probs = F.softmax(outputs.logits, dim=-1).squeeze(0)  # shape: (num_labels,)

    # id2label from model config: {0: "negative", 1: "neutral", 2: "positive", 3: "mixed"}
    id2label = _model.config.id2label
    predicted_id = int(torch.argmax(probs).item())
    label = id2label[predicted_id]
    score = float(probs[predicted_id].item())

    all_scores = {id2label[i]: float(probs[i].item()) for i in range(len(probs))}

    return {"label": label, "score": score, "all_scores": all_scores}


# ── Recency-confidence weighted aggregation (ARG-55) ─────────────────────────

def _recency_weight(published_at: Optional[str]) -> float:
    """
    Map article age to a recency weight (0.1 – 1.0).

    Age brackets:
        0–6 h   → 1.0
        6–24 h  → 0.8
        1–3 d   → 0.5
        3–7 d   → 0.3
        7+ d    → 0.1
        unknown → 0.5  (moderate default)
    """
    if not published_at:
        return 0.5
    try:
        dt = datetime.fromisoformat(published_at)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        age_hours = (datetime.now(timezone.utc) - dt).total_seconds() / 3600
        if age_hours < 6:    return 1.0
        if age_hours < 24:   return 0.8
        if age_hours < 72:   return 0.5   # 1–3 days
        if age_hours < 168:  return 0.3   # 3–7 days
        return 0.1
    except Exception:
        return 0.5


def compute_weighted_sentiment(
    ticker: str,
    scored_headlines: List[Dict],
) -> Tuple[float, Optional[float], str]:
    """
    ARG-55: Compute a recency-confidence weighted sentiment score.

    Each item in *scored_headlines* must have:
        headline     (str)
        published_at (str | None)   ISO 8601 UTC timestamp
        score        (float)        signed score: +conf / -conf / 0
        confidence   (float)        raw DistilBERT confidence (0–1)
        label        (str)          "positive" | "negative" | "neutral" | "mixed"

    Weight formula:
        weight_i = recency_weight(published_at_i) * confidence_i

    Weighted score:
        sum(weight_i * score_i) / sum(weight_i)

    Fallback: if sum of weights is zero, returns a simple mean.

    Returns:
        (weighted_score, weighted_confidence, derived_label)
    """
    if not scored_headlines:
        return 0.0, None, "neutral"

    weights: List[float] = []
    for h in scored_headlines:
        recency = _recency_weight(h.get("published_at"))
        conf    = float(h.get("confidence", 0.5))
        weights.append(recency * conf)

    weight_sum = sum(weights)

    if weight_sum > 0:
        weighted_score = sum(
            w * float(h["score"]) for w, h in zip(weights, scored_headlines)
        ) / weight_sum
        weighted_conf  = sum(
            w * float(h["confidence"]) for w, h in zip(weights, scored_headlines)
        ) / weight_sum
    else:
        # Fallback: simple average
        scores = [float(h["score"]) for h in scored_headlines]
        confs  = [float(h.get("confidence", 0.5)) for h in scored_headlines]
        weighted_score = sum(scores) / len(scores)
        weighted_conf  = sum(confs)  / len(confs)

    weighted_score = max(-1.0, min(1.0, weighted_score))

    if weighted_score > 0.2:
        derived_label = "positive"
    elif weighted_score < -0.2:
        derived_label = "negative"
    else:
        derived_label = "neutral"

    logger.debug(
        "Weighted sentiment for %s: %d headlines, effective weight sum: %.2f, score: %.3f",
        ticker,
        len(scored_headlines),
        weight_sum,
        weighted_score,
    )

    return weighted_score, round(weighted_conf, 4), derived_label
