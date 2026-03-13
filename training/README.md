# Argus — DistilBERT Financial Sentiment Training

Fine-tunes `distilbert-base-uncased` on the
[financial_phrasebank](https://huggingface.co/datasets/financial_phrasebank)
dataset to classify financial text into **negative / neutral / positive**
sentiment.

> **Note:** This directory is a local data-science workstream.
> It is **never deployed** alongside the backend or frontend.
> The trained model artifact is saved to `backend/models/sentiment/`
> and loaded at runtime by the backend inference layer.

---

## Setup

```bash
cd training
pip install -r requirements.txt
```

Python 3.9+ recommended. A virtual environment is strongly advised:

```bash
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

---

## Training

```bash
python train.py
```

- Downloads `distilbert-base-uncased` and `financial_phrasebank` on first run.
- Trains for **3 epochs** with batch size 16.
- **Estimated time: 20–40 minutes on CPU** (a few minutes on GPU).
- Saves the trained model and tokenizer to `../backend/models/sentiment/`.
- Writes a `training_results.json` summary to `training/`.

### What it does

1. Loads `financial_phrasebank` (`sentences_allagree` config — highest-quality labels).
2. Splits 80/20 into train/validation, stratified by class.
3. Tokenizes with `DistilBertTokenizer` (max length 128).
4. Fine-tunes `DistilBertForSequenceClassification` (3 labels) via HuggingFace `Trainer`.
5. Saves the best checkpoint (lowest `eval_loss`) at the end.

---

## Evaluation

```bash
python evaluate.py
```

- Loads the saved model from `../backend/models/sentiment/`.
- Runs inference on the validation split and prints:
  - Per-class precision, recall, and F1 (classification report)
  - Confusion matrix
- Tests 10 hand-picked financial sentences and prints predicted label +
  confidence score for each.

---

## Output

| Path | Description |
|------|-------------|
| `../backend/models/sentiment/` | Trained model + tokenizer (loaded by backend) |
| `training_results.json` | Final accuracy, F1, dataset size, training date |
| `training_output/` | HuggingFace Trainer checkpoints (gitignored) |
| `logs/` | TensorBoard-compatible training logs (gitignored) |

Large binary model files (`*.bin`, `*.safetensors`) are listed in `.gitignore`
and are **not committed to the repository**.
