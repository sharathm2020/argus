"""
sentiment_analyzer.py — Lazy-loaded DistilBERT financial sentiment inference.

The model is loaded from models/sentiment/ on the first call to analyze_sentiment().
Subsequent calls reuse the loaded singleton — startup time is not affected.
"""

import logging
import os
from pathlib import Path
from typing import Dict

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
        DistilBertForSequenceClassification,
        DistilBertTokenizer,
    )

    logger.info("Loading DistilBERT sentiment model from %s", _MODEL_DIR)
    _tokenizer = DistilBertTokenizer.from_pretrained(str(_MODEL_DIR))
    _model = DistilBertForSequenceClassification.from_pretrained(str(_MODEL_DIR))
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
