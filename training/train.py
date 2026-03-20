"""
train.py — Fine-tune DistilBERT on combined 4-class dataset for sentiment classification.
Run from inside the training/ directory: python train.py
"""

import json
import os
from datetime import date

import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, f1_score
from sklearn.model_selection import train_test_split
from transformers import (
    DistilBertForSequenceClassification,
    DistilBertTokenizer,
    Trainer,
    TrainingArguments,
)
import torch
from torch.utils.data import Dataset


# ---------------------------------------------------------------------------
# Dataset
# ---------------------------------------------------------------------------

class FinancialSentimentDataset(Dataset):
    def __init__(self, encodings, labels):
        self.encodings = encodings
        self.labels = labels

    def __len__(self):
        return len(self.labels)

    def __getitem__(self, idx):
        item = {
            "input_ids": torch.tensor(self.encodings["input_ids"][idx], dtype=torch.long),
            "attention_mask": torch.tensor(self.encodings["attention_mask"][idx], dtype=torch.long),
            "labels": torch.tensor(self.labels[idx], dtype=torch.long),
        }
        return item


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------

def compute_metrics(eval_pred):
    logits, labels = eval_pred
    preds = np.argmax(logits, axis=-1)
    acc = accuracy_score(labels, preds)
    f1 = f1_score(labels, preds, average="weighted")
    per_class_f1 = f1_score(labels, preds, average=None)
    result = {
        "accuracy": acc,
        "f1": f1,
        "f1_negative": per_class_f1[0],
        "f1_neutral": per_class_f1[1],
        "f1_positive": per_class_f1[2],
        "f1_mixed": per_class_f1[3],
    }
    return result


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

LABEL_NAMES = {0: "negative", 1: "neutral", 2: "positive", 3: "mixed"}


def main():
    # --- Load dataset ---
    print("Loading combined dataset from data/combined_dataset.csv...")
    df = pd.read_csv("data/combined_dataset.csv")
    all_sentences = df["sentence"].tolist()
    all_labels = df["label"].tolist()

    total = len(all_sentences)
    print(f"Total samples: {total}")
    for lbl_id, lbl_name in LABEL_NAMES.items():
        count = all_labels.count(lbl_id)
        print(f"  {lbl_name} ({lbl_id}): {count} ({count / total * 100:.1f}%)")

    # --- Train / validation split ---
    train_sentences, val_sentences, train_labels, val_labels = train_test_split(
        all_sentences, all_labels, test_size=0.2, random_state=42, stratify=all_labels
    )
    print(f"\nTrain: {len(train_sentences)} | Validation: {len(val_sentences)}")

    # --- Tokenize ---
    print("\nTokenizing...")
    tokenizer = DistilBertTokenizer.from_pretrained("distilbert-base-uncased")

    train_enc = tokenizer(
        train_sentences, max_length=128, padding=True, truncation=True
    )
    val_enc = tokenizer(
        val_sentences, max_length=128, padding=True, truncation=True
    )

    train_dataset = FinancialSentimentDataset(train_enc, train_labels)
    val_dataset = FinancialSentimentDataset(val_enc, val_labels)

    # --- Model ---
    print("\nLoading DistilBERT model...")
    model = DistilBertForSequenceClassification.from_pretrained(
        "distilbert-base-uncased",
        num_labels=4,
        id2label={0: "negative", 1: "neutral", 2: "positive", 3: "mixed"},
        label2id={"negative": 0, "neutral": 1, "positive": 2, "mixed": 3},
    )

    # --- Training arguments ---
    training_args = TrainingArguments(
        output_dir="./training_output",
        num_train_epochs=5,
        per_device_train_batch_size=16,
        per_device_eval_batch_size=16,
        warmup_steps=100,
        weight_decay=0.01,
        logging_dir="./logs",
        logging_steps=10,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="eval_f1",
        greater_is_better=True,
        fp16=False,
        report_to="none",
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=val_dataset,
        compute_metrics=compute_metrics,
    )

    # --- Train ---
    print("\nStarting training (estimated 20-40 min on CPU)...")
    train_result = trainer.train()

    # --- Final eval ---
    print("\nRunning final evaluation...")
    metrics = trainer.evaluate()
    final_accuracy = metrics.get("eval_accuracy", 0.0)
    final_f1 = metrics.get("eval_f1", 0.0)
    f1_negative = metrics.get("eval_f1_negative", 0.0)
    f1_neutral = metrics.get("eval_f1_neutral", 0.0)
    f1_positive = metrics.get("eval_f1_positive", 0.0)
    f1_mixed = metrics.get("eval_f1_mixed", 0.0)
    print(f"Final accuracy:      {final_accuracy:.4f}")
    print(f"Final F1 (weighted): {final_f1:.4f}")
    print(f"  f1_negative: {f1_negative:.4f}")
    print(f"  f1_neutral:  {f1_neutral:.4f}")
    print(f"  f1_positive: {f1_positive:.4f}")
    print(f"  f1_mixed:    {f1_mixed:.4f}")

    # --- Save model ---
    save_path = "../backend/models/sentiment"
    os.makedirs(save_path, exist_ok=True)
    trainer.save_model(save_path)
    tokenizer.save_pretrained(save_path)
    print(f"\nModel saved to {save_path}")

    # --- Save training results ---
    results = {
        "final_accuracy": round(final_accuracy, 4),
        "final_f1": round(final_f1, 4),
        "f1_negative": round(f1_negative, 4),
        "f1_neutral": round(f1_neutral, 4),
        "f1_positive": round(f1_positive, 4),
        "f1_mixed": round(f1_mixed, 4),
        "num_epochs": int(training_args.num_train_epochs),
        "num_classes": 4,
        "dataset_size": total,
        "training_date": date.today().isoformat(),
    }
    results_path = "training_results.json"
    with open(results_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"Training results saved to {results_path}")
    print(results)


if __name__ == "__main__":
    main()
