"""
sentiment_analyzer.py — Lazy-loaded DistilBERT financial sentiment inference.

The model is loaded from models/sentiment/ on the first call to analyze_sentiment().
Subsequent calls reuse the loaded singleton — startup time is not affected.
"""

import logging
import os
from typing import Dict

import torch
import torch.nn.functional as F

logger = logging.getLogger(__name__)

_MODEL_DIR = os.path.join(os.path.dirname(__file__), "models", "sentiment")

# Singleton holders — populated on first inference call
_tokenizer = None
_model = None


def _load_model() -> None:
    """Load the tokenizer and model into module-level singletons (once)."""
    global _tokenizer, _model
    if _model is not None:
        return  # already loaded

    # Defer heavy imports so FastAPI startup is unaffected when model is absent
    from transformers import (  # noqa: PLC0415
        DistilBertForSequenceClassification,
        DistilBertTokenizer,
    )

    if not os.path.isdir(_MODEL_DIR) or not any(
        f for f in os.listdir(_MODEL_DIR) if not f.startswith(".")
    ):
        raise RuntimeError(
            f"No trained model found at '{_MODEL_DIR}'. "
            "Run 'python train.py' from the training/ directory first, "
            "then re-start the backend."
        )

    logger.info("Loading DistilBERT sentiment model from %s", _MODEL_DIR)
    _tokenizer = DistilBertTokenizer.from_pretrained(_MODEL_DIR)
    _model = DistilBertForSequenceClassification.from_pretrained(_MODEL_DIR)
    _model.eval()
    logger.info("Sentiment model loaded successfully.")


def analyze_sentiment(text: str) -> Dict:
    """
    Run financial sentiment inference on a single text string.

    Args:
        text: Raw text to classify (news headlines, filing excerpts, etc.)

    Returns:
        {
            "label":      "positive" | "negative" | "neutral",
            "score":      float,   # confidence of the predicted class (0–1)
            "all_scores": {
                "positive": float,
                "negative": float,
                "neutral":  float,
            }
        }

    Raises:
        RuntimeError: If the model directory is missing or empty.
    """
    _load_model()

    inputs = _tokenizer(
        text,
        max_length=128,
        truncation=True,
        padding=True,
        return_tensors="pt",
    )

    with torch.no_grad():
        outputs = _model(**inputs)

    probs = F.softmax(outputs.logits, dim=-1).squeeze(0)  # shape: (3,)

    # id2label from model config: {0: "negative", 1: "neutral", 2: "positive"}
    id2label = _model.config.id2label
    predicted_id = int(torch.argmax(probs).item())
    label = id2label[predicted_id]
    score = float(probs[predicted_id].item())

    all_scores = {id2label[i]: float(probs[i].item()) for i in range(len(probs))}

    return {"label": label, "score": score, "all_scores": all_scores}
