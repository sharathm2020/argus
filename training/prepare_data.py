"""
prepare_data.py — Build the 4-class combined training dataset for ARG-23/ARG-24.

Sources:
  1. financial_phrasebank (sentences_allagree)  — 0/1/2 labels
  2. TheFinAI/fiqa-sentiment-classification     — 0/1/2 labels
  3. GPT-4o generated mixed sentences           — label 3

Output:
  training/data/combined_dataset.csv      — full training set
  training/data/mixed_samples_review.csv  — all mixed sentences for manual review

Run from inside the training/ directory:
  C:\\Python312\\python.exe prepare_data.py
"""

import asyncio
import json
import os
import random
import time

import pandas as pd
from datasets import load_dataset
from difflib import SequenceMatcher
from openai import AsyncOpenAI

LABEL_NAMES = {0: "negative", 1: "neutral", 2: "positive", 3: "mixed"}

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

_MIXED_SYSTEM_PROMPT = (
    "You are a financial language expert. Generate financial sentences "
    "that contain BOTH positive and negative signals simultaneously — "
    "genuine mixed sentiment where a reasonable analyst could not clearly "
    "classify the sentence as purely positive, negative, or neutral.\n\n"
    "Examples of mixed sentiment:\n"
    "- 'Revenue grew 12% but margins compressed significantly due to rising input costs'\n"
    "- 'The acquisition expanded market share while substantially increasing debt burden'\n"
    "- 'Strong Q3 earnings were offset by a cautious Q4 outlook and elevated operational risks'\n\n"
    "Generate {n} diverse mixed-sentiment financial sentences. Return "
    "ONLY a JSON array of strings, no labels, no commentary, no markdown."
)


# ── Step 1: financial_phrasebank ──────────────────────────────────────────────

def load_financial_phrasebank() -> pd.DataFrame:
    print("Loading financial_phrasebank (sentences_allagree)...")
    ds = load_dataset(
        "takala/financial_phrasebank",
        "sentences_allagree",
        trust_remote_code=True,
    )
    # Use the train split (the only split available)
    split = ds["train"]
    df = pd.DataFrame({"sentence": split["sentence"], "label": split["label"]})
    print(f"  Loaded {len(df)} sentences from financial_phrasebank.")
    return df


# ── Step 2: FiQA sentiment ────────────────────────────────────────────────────

def score_to_label(score: float) -> int:
    if score < -0.2:
        return 0  # negative
    elif score > 0.2:
        return 2  # positive
    else:
        return 1  # neutral


def load_fiqa(phrasebank_sentences: set) -> pd.DataFrame:
    print("\nLoading TheFinAI/fiqa-sentiment-classification...")
    fiqa = load_dataset(
        "TheFinAI/fiqa-sentiment-classification",
        trust_remote_code=True,
    )

    # Collect all splits
    frames = []
    for split_name in fiqa.keys():
        split = fiqa[split_name]
        frames.append(pd.DataFrame({
            "sentence": split["sentence"],
            "label": [score_to_label(s) for s in split["score"]],
        }))
    df_raw = pd.concat(frames, ignore_index=True)

    print(f"  Raw FiQA rows: {len(df_raw)}")
    print("  FiQA label distribution after bucketing:")
    for lbl, name in LABEL_NAMES.items():
        if lbl == 3:
            continue
        count = (df_raw["label"] == lbl).sum()
        print(f"    {name} ({lbl}): {count}")

    # Filter: 10+ words only
    df_raw = df_raw[df_raw["sentence"].str.split().str.len() >= 10].copy()
    print(f"  After 10-word filter: {len(df_raw)} rows")

    # Deduplicate against phrasebank (exact match)
    df_raw = df_raw[~df_raw["sentence"].isin(phrasebank_sentences)].copy()
    print(f"  After exact-dedup vs phrasebank: {len(df_raw)} rows")

    return df_raw.reset_index(drop=True)


# ── Step 3: GPT-4o mixed sentences ───────────────────────────────────────────

async def generate_mixed_sentences(n: int = 300) -> list[str]:
    """Generate ~n mixed-sentiment financial sentences via GPT-4o."""
    client = AsyncOpenAI()
    batch_size = 100
    all_sentences: list[str] = []

    num_batches = (n + batch_size - 1) // batch_size  # ceil division

    for i in range(num_batches):
        remaining = n - len(all_sentences)
        this_batch = min(batch_size, remaining)
        print(f"  GPT-4o batch {i + 1}/{num_batches}: requesting {this_batch} sentences...")

        prompt = _MIXED_SYSTEM_PROMPT.format(n=this_batch)
        try:
            response = await client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=4000,
                temperature=0.8,
            )
            raw = (response.choices[0].message.content or "").strip()

            # Strip markdown fences if present
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
                raw = raw.strip()

            parsed: list = json.loads(raw)
            if not isinstance(parsed, list):
                raise ValueError("Response is not a JSON array")

            sentences = [s.strip() for s in parsed if isinstance(s, str) and s.strip()]
            all_sentences.extend(sentences)
            print(f"    Got {len(sentences)} sentences (total so far: {len(all_sentences)})")

        except Exception as exc:
            print(f"  WARNING: GPT-4o batch {i + 1} failed: {exc}")

        # Polite delay between batches to avoid rate limits
        if i < num_batches - 1:
            time.sleep(1.5)

    return all_sentences


# ── Step 4: Near-duplicate filter ─────────────────────────────────────────────

def _similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def remove_near_duplicates(
    df_new: pd.DataFrame,
    reference_sentences: list[str],
    threshold: float = 0.90,
) -> pd.DataFrame:
    """
    Remove rows from df_new whose sentence is >=threshold similar
    to any sentence in reference_sentences.
    """
    ref = reference_sentences
    keep = []
    for _, row in df_new.iterrows():
        sentence = row["sentence"]
        is_near_dup = any(_similarity(sentence, ref_s) >= threshold for ref_s in ref)
        keep.append(not is_near_dup)
    return df_new[keep].copy()


# ── Main ──────────────────────────────────────────────────────────────────────

async def _async_main() -> None:
    os.makedirs(DATA_DIR, exist_ok=True)

    # ── Step 1 ────────────────────────────────────────────────────────────────
    df_phrasebank = load_financial_phrasebank()
    phrasebank_sentences = set(df_phrasebank["sentence"].tolist())

    # ── Step 2 ────────────────────────────────────────────────────────────────
    df_fiqa = load_fiqa(phrasebank_sentences)

    # Near-duplicate removal: FiQA vs phrasebank
    print("  Removing FiQA near-duplicates (>= 90% similarity) vs phrasebank...")
    before = len(df_fiqa)
    df_fiqa = remove_near_duplicates(df_fiqa, list(phrasebank_sentences), threshold=0.90)
    print(f"  Removed {before - len(df_fiqa)} near-duplicates. FiQA rows kept: {len(df_fiqa)}")

    # ── Step 3 ────────────────────────────────────────────────────────────────
    print("\nGenerating mixed-sentiment sentences with GPT-4o...")
    mixed_raw = await generate_mixed_sentences(n=300)

    df_mixed_all = pd.DataFrame({"sentence": mixed_raw, "label": 3})

    # Save ALL mixed sentences for manual review (before quality filters)
    review_path = os.path.join(DATA_DIR, "mixed_samples_review.csv")
    df_mixed_all.to_csv(review_path, index=False)
    print(f"  Saved {len(df_mixed_all)} raw mixed sentences to {review_path}")

    # Near-duplicate removal: mixed vs phrasebank
    print("  Removing mixed near-duplicates (>= 90% similarity) vs phrasebank...")
    before = len(df_mixed_all)
    df_mixed = remove_near_duplicates(df_mixed_all, list(phrasebank_sentences), threshold=0.90)
    print(f"  Removed {before - len(df_mixed)} near-duplicates. Mixed rows kept: {len(df_mixed)}")

    # ── Step 4: Combine ───────────────────────────────────────────────────────
    print("\nCombining datasets...")
    df_combined = pd.concat(
        [df_phrasebank, df_fiqa, df_mixed],
        ignore_index=True,
    )

    # Quality filters
    # Filter 1: Remove sentences shorter than 5 words
    before = len(df_combined)
    df_combined = df_combined[df_combined["sentence"].str.split().str.len() >= 5]
    print(f"  Removed {before - len(df_combined)} sentences shorter than 5 words.")

    # Filter 2: Remove exact duplicates
    before = len(df_combined)
    df_combined = df_combined.drop_duplicates(subset=["sentence"])
    print(f"  Removed {before - len(df_combined)} exact duplicates.")

    df_combined = df_combined.reset_index(drop=True)

    # Print final statistics
    total = len(df_combined)
    print(f"\nFinal dataset statistics:")
    print(f"  Total sentences: {total}")
    for lbl, name in LABEL_NAMES.items():
        count = (df_combined["label"] == lbl).sum()
        pct = count / total * 100
        print(f"  {name} ({lbl}): {count} ({pct:.1f}%)")

    # Save combined dataset
    out_path = os.path.join(DATA_DIR, "combined_dataset.csv")
    df_combined.to_csv(out_path, index=False)
    print(f"\nSaved combined dataset to {out_path}")

    # ── Step 5: Spot-check samples ────────────────────────────────────────────
    print("\n── Spot-check: 10 random examples per class ──")
    random.seed(42)
    for lbl, name in LABEL_NAMES.items():
        subset = df_combined[df_combined["label"] == lbl]
        samples = subset.sample(min(10, len(subset)), random_state=42)
        print(f"\n  {name.upper()} (label={lbl}) — {len(subset)} total:")
        for _, row in samples.iterrows():
            print(f"    • {row['sentence']}")


async def generate_additional_mixed(n: int = 200) -> None:
    """Generate n additional mixed sentences and append them to existing CSVs."""
    combined_path = os.path.join(DATA_DIR, "combined_dataset.csv")
    review_path = os.path.join(DATA_DIR, "mixed_samples_review.csv")

    # Load existing data
    df_combined = pd.read_csv(combined_path)
    df_review = pd.read_csv(review_path)

    existing_sentences = set(df_combined["sentence"].tolist()) | set(df_review["sentence"].tolist())
    print(f"Existing dataset: {len(df_combined)} sentences ({len(existing_sentences)} unique across both files)")

    # Generate new mixed sentences
    print(f"\nGenerating {n} additional mixed sentences with GPT-4o...")
    new_raw = await generate_mixed_sentences(n)

    # Filter out sentences already in either file
    new_sentences = [s for s in new_raw if s not in existing_sentences]
    print(f"  {len(new_raw) - len(new_sentences)} duplicates removed. {len(new_sentences)} new sentences kept.")

    if not new_sentences:
        print("No new sentences to add.")
        return

    df_new = pd.DataFrame({"sentence": new_sentences, "label": 3})

    # Append to both CSVs
    df_new.to_csv(combined_path, mode="a", header=False, index=False)
    df_new.to_csv(review_path, mode="a", header=False, index=False)
    print(f"  Appended {len(df_new)} sentences to {combined_path}")
    print(f"  Appended {len(df_new)} sentences to {review_path}")

    # Print updated class distribution
    df_updated = pd.read_csv(combined_path)
    total = len(df_updated)
    print(f"\nUpdated dataset statistics:")
    print(f"  Total sentences: {total}")
    for lbl, name in LABEL_NAMES.items():
        count = (df_updated["label"] == lbl).sum()
        pct = count / total * 100
        print(f"  {name} ({lbl}): {count} ({pct:.1f}%)")


_NEGATIVE_SYSTEM_PROMPT = (
    "You are a financial language expert. Generate financial sentences "
    "that are clearly NEGATIVE in sentiment from an investor's perspective.\n"
    "Focus on these underrepresented patterns that models often miss:\n"
    "- Subtle negative signals: declining metrics, missed targets, warnings, downgrades\n"
    "- Debt and leverage concerns: rising liabilities, credit issues\n"
    "- Operational failures: supply chain, recalls, writedowns\n"
    "- Market and competitive threats: losing share, pricing pressure\n"
    "- Regulatory and legal risks: investigations, penalties, sanctions\n\n"
    "Avoid sentences that contain ANY positive signals — these should be "
    "unambiguously negative from an investor standpoint.\n\n"
    "Generate {n} diverse negative financial sentences. Return ONLY a "
    "JSON array of strings, no labels, no commentary, no markdown."
)


async def _generate_negative_sentences(n: int) -> list[str]:
    """Generate n negative-sentiment financial sentences via GPT-4o."""
    client = AsyncOpenAI()
    batch_size = 100
    all_sentences: list[str] = []

    num_batches = (n + batch_size - 1) // batch_size

    for i in range(num_batches):
        remaining = n - len(all_sentences)
        this_batch = min(batch_size, remaining)
        print(f"  GPT-4o batch {i + 1}/{num_batches}: requesting {this_batch} negative sentences...")

        prompt = _NEGATIVE_SYSTEM_PROMPT.format(n=this_batch)
        try:
            response = await client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=4000,
                temperature=0.7,
            )
            raw = (response.choices[0].message.content or "").strip()

            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
                raw = raw.strip()

            parsed: list = json.loads(raw)
            if not isinstance(parsed, list):
                raise ValueError("Response is not a JSON array")

            sentences = [s.strip() for s in parsed if isinstance(s, str) and s.strip()]
            all_sentences.extend(sentences)
            print(f"    Got {len(sentences)} sentences (total so far: {len(all_sentences)})")

        except Exception as exc:
            print(f"  WARNING: GPT-4o batch {i + 1} failed: {exc}")

        if i < num_batches - 1:
            time.sleep(1.5)

    return all_sentences


async def generate_additional_negative(n: int = 200) -> None:
    """Generate n additional negative sentences and append them to combined_dataset.csv."""
    combined_path = os.path.join(DATA_DIR, "combined_dataset.csv")

    df_combined = pd.read_csv(combined_path)
    existing_sentences = set(df_combined["sentence"].tolist())
    print(f"Existing dataset: {len(df_combined)} sentences")

    print(f"\nGenerating {n} additional negative sentences with GPT-4o...")
    new_raw = await _generate_negative_sentences(n)

    new_sentences = [s for s in new_raw if s not in existing_sentences]
    print(f"  {len(new_raw) - len(new_sentences)} duplicates removed. {len(new_sentences)} new sentences kept.")

    if not new_sentences:
        print("No new sentences to add.")
        return

    df_new = pd.DataFrame({"sentence": new_sentences, "label": 0})

    df_new.to_csv(combined_path, mode="a", header=False, index=False)
    print(f"  Appended {len(df_new)} sentences to {combined_path}")

    df_updated = pd.read_csv(combined_path)
    total = len(df_updated)
    print(f"\nUpdated dataset statistics:")
    print(f"  Total sentences: {total}")
    for lbl, name in LABEL_NAMES.items():
        count = (df_updated["label"] == lbl).sum()
        pct = count / total * 100
        print(f"  {name} ({lbl}): {count} ({pct:.1f}%)")


_POSITIVE_SYSTEM_PROMPT = (
    "You are a financial language expert. Generate financial sentences "
    "that are clearly POSITIVE in sentiment from an investor's perspective.\n"
    "Focus on these patterns that are distinct from mixed sentiment:\n"
    "- Strong earnings and revenue growth with no offsetting negatives\n"
    "- Market share gains and competitive wins\n"
    "- Successful product launches and customer adoption\n"
    "- Strategic wins: partnerships, contracts, expansions\n"
    "- Financial strength: improving margins, debt reduction, upgrades\n\n"
    "Critically important: Do NOT include any negative qualifiers, "
    "caveats, or offsetting risks — these should be unambiguously "
    "positive from an investor standpoint with no dual signals.\n\n"
    "Generate {n} diverse positive financial sentences. Return ONLY a "
    "JSON array of strings, no labels, no commentary, no markdown."
)


async def _generate_positive_sentences(n: int) -> list[str]:
    """Generate n positive-sentiment financial sentences via GPT-4o."""
    client = AsyncOpenAI()
    batch_size = 100
    all_sentences: list[str] = []

    num_batches = (n + batch_size - 1) // batch_size

    for i in range(num_batches):
        remaining = n - len(all_sentences)
        this_batch = min(batch_size, remaining)
        print(f"  GPT-4o batch {i + 1}/{num_batches}: requesting {this_batch} positive sentences...")

        prompt = _POSITIVE_SYSTEM_PROMPT.format(n=this_batch)
        try:
            response = await client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=4000,
                temperature=0.7,
            )
            raw = (response.choices[0].message.content or "").strip()

            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
                raw = raw.strip()

            parsed: list = json.loads(raw)
            if not isinstance(parsed, list):
                raise ValueError("Response is not a JSON array")

            sentences = [s.strip() for s in parsed if isinstance(s, str) and s.strip()]
            all_sentences.extend(sentences)
            print(f"    Got {len(sentences)} sentences (total so far: {len(all_sentences)})")

        except Exception as exc:
            print(f"  WARNING: GPT-4o batch {i + 1} failed: {exc}")

        if i < num_batches - 1:
            time.sleep(1.5)

    return all_sentences


async def generate_additional_positive(n: int = 150) -> None:
    """Generate n additional positive sentences and append them to combined_dataset.csv."""
    combined_path = os.path.join(DATA_DIR, "combined_dataset.csv")

    df_combined = pd.read_csv(combined_path)
    existing_sentences = set(df_combined["sentence"].tolist())
    print(f"Existing dataset: {len(df_combined)} sentences")

    print(f"\nGenerating {n} additional positive sentences with GPT-4o...")
    new_raw = await _generate_positive_sentences(n)

    new_sentences = [s for s in new_raw if s not in existing_sentences]
    print(f"  {len(new_raw) - len(new_sentences)} duplicates removed. {len(new_sentences)} new sentences kept.")

    if not new_sentences:
        print("No new sentences to add.")
        return

    df_new = pd.DataFrame({"sentence": new_sentences, "label": 2})

    df_new.to_csv(combined_path, mode="a", header=False, index=False)
    print(f"  Appended {len(df_new)} sentences to {combined_path}")

    df_updated = pd.read_csv(combined_path)
    total = len(df_updated)
    print(f"\nUpdated dataset statistics:")
    print(f"  Total sentences: {total}")
    for lbl, name in LABEL_NAMES.items():
        count = (df_updated["label"] == lbl).sum()
        pct = count / total * 100
        print(f"  {name} ({lbl}): {count} ({pct:.1f}%)")


def main() -> None:
    asyncio.run(_async_main())


import sys
if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--add-mixed":
        n = int(sys.argv[2]) if len(sys.argv) > 2 else 200
        asyncio.run(generate_additional_mixed(n))
    elif len(sys.argv) > 1 and sys.argv[1] == "--add-negative":
        n = int(sys.argv[2]) if len(sys.argv) > 2 else 200
        asyncio.run(generate_additional_negative(n))
    elif len(sys.argv) > 1 and sys.argv[1] == "--add-positive":
        n = int(sys.argv[2]) if len(sys.argv) > 2 else 150
        asyncio.run(generate_additional_positive(n))
    else:
        main()
