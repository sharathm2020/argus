"""
evaluate.py — Evaluate the fine-tuned DistilBERT sentiment model.
Run from inside the training/ directory: python evaluate.py
"""

import numpy as np
import torch
from datasets import load_dataset
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import train_test_split
from transformers import (
    DistilBertForSequenceClassification,
    DistilBertTokenizer,
    pipeline,
)


MODEL_PATH = "../backend/models/sentiment"

EXAMPLE_SENTENCES = [
    "The company reported record profits this quarter",
    "Revenue declined sharply due to supply chain disruptions",
    "The stock price remained flat amid mixed economic signals",
    "Strong earnings beat analyst expectations by a wide margin",
    "The firm announced significant layoffs and restructuring",
    "Operating margins improved slightly year over year",
    "Regulatory investigations pose a significant risk to operations",
    "The acquisition is expected to be accretive to earnings",
    "Cash flow from operations was largely unchanged",
    "Debt levels have risen to concerning levels",
]


def load_validation_data():
    """Load financial_phrasebank and return the 20% validation split."""
    print("Loading financial_phrasebank dataset...")
    raw = load_dataset("financial_phrasebank", "sentences_allagree")
    all_sentences = raw["train"]["sentence"]
    all_labels = raw["train"]["label"]

    _, val_sentences, _, val_labels = train_test_split(
        all_sentences, all_labels, test_size=0.2, random_state=42, stratify=all_labels
    )
    return val_sentences, val_labels


def run_batch_inference(model, tokenizer, sentences, device, batch_size=32):
    """Run inference on a list of sentences and return predicted labels."""
    all_preds = []
    model.eval()
    for i in range(0, len(sentences), batch_size):
        batch = sentences[i : i + batch_size]
        enc = tokenizer(
            batch,
            max_length=128,
            padding=True,
            truncation=True,
            return_tensors="pt",
        )
        enc = {k: v.to(device) for k, v in enc.items()}
        with torch.no_grad():
            outputs = model(**enc)
        preds = torch.argmax(outputs.logits, dim=-1).cpu().numpy()
        all_preds.extend(preds.tolist())
    return all_preds


def main():
    # --- Load model ---
    print(f"Loading model from {MODEL_PATH}...")
    tokenizer = DistilBertTokenizer.from_pretrained(MODEL_PATH)
    model = DistilBertForSequenceClassification.from_pretrained(MODEL_PATH)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device)
    print(f"Running on: {device}")

    # --- Validation set evaluation ---
    val_sentences, val_labels = load_validation_data()
    print(f"\nEvaluating on {len(val_sentences)} validation samples...")

    predictions = run_batch_inference(model, tokenizer, list(val_sentences), device)

    label_names = ["negative", "neutral", "positive"]
    print("\n--- Classification Report ---")
    print(
        classification_report(val_labels, predictions, target_names=label_names)
    )

    print("--- Confusion Matrix ---")
    cm = confusion_matrix(val_labels, predictions)
    header = f"{'':12s}" + "".join(f"{n:>12s}" for n in label_names)
    print(header)
    for i, row in enumerate(cm):
        row_str = f"{label_names[i]:12s}" + "".join(f"{v:>12d}" for v in row)
        print(row_str)

    # --- Example sentence inference ---
    print("\n--- Example Sentence Predictions ---")
    clf = pipeline(
        "text-classification",
        model=model,
        tokenizer=tokenizer,
        device=0 if torch.cuda.is_available() else -1,
    )
    results = clf(EXAMPLE_SENTENCES, truncation=True, max_length=128)
    for sentence, result in zip(EXAMPLE_SENTENCES, results):
        label = result["label"]
        score = result["score"]
        print(f"  [{label:>8s}  {score:.3f}]  {sentence}")


if __name__ == "__main__":
    main()
