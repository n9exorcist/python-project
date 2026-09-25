"""
rag_eval.py — RAG Evaluation Framework

Implements the evaluation metrics from the RAG evaluation framework:

  RETRIEVAL METRICS  (computed directly against FAISS — no LLM needed):
    Precision@K   — of K retrieved chunks, how many are actually relevant
    Recall@K      — of all relevant chunks in the index, how many were retrieved
    MRR           — Mean Reciprocal Rank: how early the first relevant chunk appears
    Hit Rate      — did at least one relevant chunk get retrieved (0 or 1)

  GENERATION METRICS  (LLM-as-judge using Gemini):
    Faithfulness      — is the answer grounded in the retrieved context (no hallucination)
    Answer Relevancy  — does the answer actually address the question
    Context Precision — how much of the retrieved context is actually useful (low noise)
    Context Recall    — does the retrieved context cover all aspects of the ground truth

Run:
    venv\\Scripts\\python.exe rag_eval.py
    venv\\Scripts\\python.exe rag_eval.py --retrieval-only
"""

import os
import re
import sys
import json
import asyncio
import statistics
import time
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RETRIEVAL_MAX_DISTANCE = float(os.getenv("RETRIEVAL_MAX_DISTANCE", "0.65"))
LOG_DIR = Path(BASE_DIR) / "logs"
LOG_DIR.mkdir(exist_ok=True)

RETRIEVAL_ONLY = "--retrieval-only" in sys.argv
K = 5  # number of chunks to retrieve per query


# ── Evaluation Dataset ─────────────────────────────────────────────────────────
# Each entry defines:
#   question          — the test query
#   reference         — ground truth answer (used for Context Recall scoring)
#   expected_sources  — source names in FAISS metadata that should appear in results
#   expected_keywords — words that must appear in a chunk for it to count as "relevant"
#
# A retrieved chunk is "relevant" if its source matches AND contains a keyword.
# Update this dataset after adding new documents to the index.

EVAL_DATASET = [
    {
        "question":          "What were Accenture's Q2 FY26 revenues?",
        "reference":         "Accenture's Q2 FY26 revenues reached $18.0 billion, an 8% increase.",
        "expected_sources":  ["manual_knowledge_base"],
        "expected_keywords": ["18.0", "revenue"],
    },
    {
        "question":          "What were Accenture's Q2 FY26 new bookings?",
        "reference":         "Accenture reported record new bookings of $22.1 billion for Q2 FY26.",
        "expected_sources":  ["manual_knowledge_base"],
        "expected_keywords": ["22.1", "bookings"],
    },
    {
        "question":          "What is Narayanan Selvaraj's specialization at Accenture?",
        "reference":         "Narayanan Selvaraj is a Team Lead at Accenture specializing in Full-Stack LLM and ReactJS.",
        "expected_sources":  ["manual_knowledge_base"],
        "expected_keywords": ["Narayanan", "Team Lead"],
    },
    {
        "question":          "What are considered safe-haven assets during market volatility?",
        "reference":         "Gold and silver are considered safe-haven assets during market volatility.",
        "expected_sources":  ["manual_knowledge_base"],
        "expected_keywords": ["gold", "silver"],
    },
    {
        "question":          "What dividend did Accenture declare in Q2 FY26?",
        "reference":         "Accenture declared a dividend of $1.63 per share, a 10% increase.",
        "expected_sources":  ["manual_knowledge_base"],
        "expected_keywords": ["1.63", "dividend"],
    },
]


# ── FAISS Setup ────────────────────────────────────────────────────────────────

def load_faiss():
    from langchain_google_genai import GoogleGenerativeAIEmbeddings
    from langchain_community.vectorstores import FAISS

    embeddings = GoogleGenerativeAIEmbeddings(
        model="models/gemini-embedding-001",
        google_api_key=os.getenv("GEMINI_API_KEY"),
    )
    candidates = [
        os.path.join(BASE_DIR, "faiss_index"),
        os.path.join(BASE_DIR, "app", "faiss_index"),
    ]
    path = next((p for p in candidates if os.path.exists(p)), None)
    if not path:
        raise FileNotFoundError(f"FAISS index not found. Searched: {candidates}")
    db = FAISS.load_local(path, embeddings, allow_dangerous_deserialization=True)
    print(f"  Loaded: {path}  ({db.index.ntotal} vectors)")
    return db


# ── Relevance Helper ───────────────────────────────────────────────────────────

def _is_relevant(doc, entry: dict) -> bool:
    """
    A chunk is relevant if:
      - its source metadata matches one of the expected_sources, AND
      - its content contains at least one expected_keyword (case-insensitive)
    Both conditions are needed: source alone would match unrelated chunks from
    the same file; keyword alone would miss provenance.
    """
    meta    = getattr(doc, "metadata", None) or {}
    source  = meta.get("source", "")
    content = (getattr(doc, "page_content", "") or "").lower()
    source_ok  = any(s in source for s in entry["expected_sources"])
    keyword_ok = any(kw.lower() in content for kw in entry["expected_keywords"])
    return source_ok and keyword_ok


# ── Retrieval Metrics ──────────────────────────────────────────────────────────

def compute_retrieval_metrics(vector_db, entry: dict) -> dict:
    """
    Precision@K  = relevant_retrieved / K
    Recall@K     = relevant_retrieved / total_relevant_in_index
    MRR          = 1 / rank_of_first_relevant  (0.0 if none found)
    Hit Rate     = 1 if at least one relevant chunk retrieved, else 0

    total_relevant_in_index is estimated by running a high-K search (k=200)
    and counting chunks that pass the distance filter and relevance check.
    For a ~67-vector index, k=200 returns everything, giving exact recall.
    """
    # Top-K results the user actually sees
    scored_k = vector_db.similarity_search_with_score(entry["question"], k=K)
    retrieved = [(d, dist) for d, dist in scored_k if dist <= RETRIEVAL_MAX_DISTANCE]

    # Full index scan to find total relevant chunks (for Recall denominator)
    scored_all = vector_db.similarity_search_with_score(entry["question"], k=200)
    total_relevant = sum(
        1 for d, dist in scored_all
        if dist <= RETRIEVAL_MAX_DISTANCE and _is_relevant(d, entry)
    )

    # Count how many of the retrieved chunks are relevant
    relevant_retrieved = sum(1 for d, _ in retrieved if _is_relevant(d, entry))

    precision = relevant_retrieved / K
    recall    = relevant_retrieved / total_relevant if total_relevant > 0 else 0.0

    # MRR: rank counted from 1 within the full scored_k list (not just filtered)
    mrr = 0.0
    for rank, (doc, dist) in enumerate(scored_k, start=1):
        if dist <= RETRIEVAL_MAX_DISTANCE and _is_relevant(doc, entry):
            mrr = 1.0 / rank
            break

    hit = 1 if relevant_retrieved > 0 else 0

    return {
        "precision_at_k":           round(precision, 3),
        "recall_at_k":              round(recall, 3),
        "mrr":                      round(mrr, 3),
        "hit_rate":                 hit,
        "retrieved_count":          len(retrieved),
        "relevant_retrieved":       relevant_retrieved,
        "total_relevant_in_index":  total_relevant,
        # Raw context texts passed to the LLM and generation evaluators
        "contexts": [getattr(d, "page_content", "") for d, _ in retrieved],
        "context_distances": [round(dist, 4) for _, dist in retrieved],
    }


# ── Response text extractor ────────────────────────────────────────────────────
# Newer langchain_google_genai returns resp.content as a list of content blocks
# [{'type': 'text', 'text': '...', 'extras': {...}}] instead of a plain string.
# This helper normalises both formats.

def _text(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict):
                parts.append(item.get("text", ""))
            else:
                parts.append(str(item))
        return " ".join(p for p in parts if p)
    return str(content)


# ── Rate-limit-aware LLM caller ────────────────────────────────────────────────
# Free tier limits vary by model. On a 429 the error body includes a retryDelay.
# We read it and sleep exactly that long, then try again (up to MAX_RETRIES).
# Per-day exhaustion (retryDelay in hours) raises immediately so the caller
# can mark the question as skipped rather than waiting hours.

MAX_RETRIES = 3
MAX_RETRY_SLEEP = 120   # never sleep more than 2 min per retry

async def _invoke(llm, messages: list) -> str:
    """Call the LLM with automatic retry on per-minute 429 errors."""
    from langchain_core.messages import SystemMessage  # noqa: F401 (import guard)
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = await llm.ainvoke(messages)
            return _text(resp.content)
        except Exception as exc:
            msg = str(exc)
            if "429" not in msg and "RESOURCE_EXHAUSTED" not in msg:
                raise
            # Extract the retry delay the API told us to use
            m = re.search(r"retryDelay.*?(\d+)s", msg)
            delay = int(m.group(1)) if m else 60
            if delay > MAX_RETRY_SLEEP:
                # Daily quota exhausted — waiting won't help this run
                raise RuntimeError(
                    f"Daily quota exhausted (retry delay {delay}s). "
                    "Generation metrics will be skipped. "
                    "Reset time: midnight Pacific. Re-run tomorrow or use a paid API key."
                ) from exc
            wait = delay + 5
            print(f"  [429] rate limited — sleeping {wait}s (attempt {attempt}/{MAX_RETRIES})...")
            await asyncio.sleep(wait)
    raise RuntimeError("Max retries exceeded on rate limit")


# ── Answer Generation ──────────────────────────────────────────────────────────

async def generate_answer(llm, question: str, contexts: list) -> str:
    """Generate an answer using ONLY the retrieved context."""
    from langchain_core.messages import SystemMessage, HumanMessage
    context_block = "\n\n".join(contexts) if contexts else "No context retrieved."
    return await _invoke(llm, [
        SystemMessage(content=(
            "You are a market analyst. Answer the question using ONLY the provided context. "
            "Do not add information from your training knowledge. "
            "If the context does not contain the answer, say exactly: "
            "'Information not available in the knowledge base.'"
        )),
        HumanMessage(content=f"Context:\n{context_block}\n\nQuestion: {question}"),
    ])


# ── Generation Metrics (LLM-as-Judge, single combined call) ───────────────────
# All 4 metrics are scored in ONE LLM call per question to stay within the
# free-tier rate limit (5 requests/minute for gemini-3.6-flash).
# The video explains: an LLM evaluating another LLM's output is faster than
# human review and gives a solid baseline — just don't rely on it 100%.

async def score_all_generation_metrics(
    llm, question: str, reference: str, contexts: list, answer: str
) -> dict:
    """
    Scores all 4 generation metrics in a single LLM call:
      Faithfulness      — answer is grounded in context (no hallucination)
      Answer Relevancy  — answer addresses the question
      Context Precision — retrieved chunks are useful (not noisy)
      Context Recall    — context covers all aspects of the ground truth
    """
    from langchain_core.messages import SystemMessage, HumanMessage

    if not contexts:
        return {"faithfulness": 0.0, "answer_relevancy": 0.0,
                "context_precision": 0.0, "context_recall": 0.0}

    numbered = "\n\n".join(f"[Chunk {i+1}]: {c}" for i, c in enumerate(contexts))

    text = await _invoke(llm, [
        SystemMessage(content=(
            "You are a strict RAG evaluator. Score exactly 4 metrics from 0.0 to 1.0.\n\n"
            "FAITHFULNESS: Every claim in ANSWER is directly supported by CONTEXT.\n"
            "  1.0 = fully grounded  |  0.5 = partially  |  0.0 = hallucination\n\n"
            "ANSWER_RELEVANCY: ANSWER directly addresses QUESTION.\n"
            "  1.0 = fully on-topic  |  0.5 = partially  |  0.0 = off-topic\n\n"
            "CONTEXT_PRECISION: Fraction of retrieved CHUNKS actually useful for the QUESTION.\n"
            "  1.0 = all chunks useful  |  0.5 = half useful  |  0.0 = all noise\n\n"
            "CONTEXT_RECALL: CONTEXT contains all information needed to produce GROUND_TRUTH.\n"
            "  1.0 = fully covered  |  0.5 = partially  |  0.0 = critical info missing\n\n"
            "Reply in this EXACT format (no other text):\n"
            "FAITHFULNESS: <score>\n"
            "ANSWER_RELEVANCY: <score>\n"
            "CONTEXT_PRECISION: <score>\n"
            "CONTEXT_RECALL: <score>"
        )),
        HumanMessage(content=(
            f"QUESTION: {question}\n\n"
            f"GROUND_TRUTH: {reference}\n\n"
            f"CONTEXT:\n{numbered}\n\n"
            f"ANSWER:\n{answer}"
        )),
    ])

    scores: dict = {}
    for line in text.strip().splitlines():
        if ":" in line:
            key, _, val = line.partition(":")
            try:
                scores[key.strip().lower()] = min(1.0, max(0.0, float(val.strip())))
            except ValueError:
                pass

    return {
        "faithfulness":      scores.get("faithfulness", 0.5),
        "answer_relevancy":  scores.get("answer_relevancy", 0.5),
        "context_precision": scores.get("context_precision", 0.5),
        "context_recall":    scores.get("context_recall", 0.5),
    }


# ── Report Printer ─────────────────────────────────────────────────────────────

def _bar(value: float, width: int = 20) -> str:
    filled = round(value * width)
    return "█" * filled + "░" * (width - filled)


def _grade(value: float) -> str:
    if value >= 0.8: return "GOOD"
    if value >= 0.5: return "FAIR"
    return "POOR"


def print_report(results: list) -> None:
    print("\n" + "=" * 72)
    print("  RAG EVALUATION REPORT")
    print(f"  {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    print("=" * 72)

    # ── Per-question retrieval detail
    print("\n── RETRIEVAL (per question) ─────────────────────────────────────────\n")
    prec_vals, recall_vals, mrr_vals, hit_vals = [], [], [], []
    for r in results:
        rm = r["retrieval"]
        q = r["question"]
        q_disp = q[:58] + "..." if len(q) > 58 else q
        print(f"  Q: {q_disp}")
        print(f"     Precision@{K}: {rm['precision_at_k']:.3f}  {_bar(rm['precision_at_k'])}  {_grade(rm['precision_at_k'])}")
        print(f"     Recall@{K}   : {rm['recall_at_k']:.3f}  {_bar(rm['recall_at_k'])}  {_grade(rm['recall_at_k'])}")
        print(f"     MRR         : {rm['mrr']:.3f}  {_bar(rm['mrr'])}  {_grade(rm['mrr'])}")
        print(f"     Hit Rate    : {rm['hit_rate']}     {'✓ hit' if rm['hit_rate'] else '✗ miss'}")
        print(f"     Retrieved   : {rm['retrieved_count']} chunks  "
              f"({rm['relevant_retrieved']} relevant / {rm['total_relevant_in_index']} in index)")
        if rm["context_distances"]:
            print(f"     Distances   : {rm['context_distances']}")
        print()
        prec_vals.append(rm["precision_at_k"])
        recall_vals.append(rm["recall_at_k"])
        mrr_vals.append(rm["mrr"])
        hit_vals.append(rm["hit_rate"])

    # ── Retrieval averages
    print("── RETRIEVAL AVERAGES ───────────────────────────────────────────────\n")
    avg_p = statistics.mean(prec_vals)
    avg_r = statistics.mean(recall_vals)
    avg_mrr = statistics.mean(mrr_vals)
    avg_hit = statistics.mean(hit_vals)
    print(f"  Avg Precision@{K}: {avg_p:.3f}  {_bar(avg_p)}  {_grade(avg_p)}")
    print(f"  Avg Recall@{K}   : {avg_r:.3f}  {_bar(avg_r)}  {_grade(avg_r)}")
    print(f"  Avg MRR         : {avg_mrr:.3f}  {_bar(avg_mrr)}  {_grade(avg_mrr)}")
    print(f"  Avg Hit Rate    : {avg_hit:.3f}  {_bar(avg_hit)}  {_grade(avg_hit)}")

    # ── Generation metrics (if computed)
    if not RETRIEVAL_ONLY:
        faith_vals, rel_vals, prec_ctx_vals, recall_ctx_vals = [], [], [], []
        for r in results:
            if "generation" in r:
                g = r["generation"]
                faith_vals.append(g.get("faithfulness", 0))
                rel_vals.append(g.get("answer_relevancy", 0))
                prec_ctx_vals.append(g.get("context_precision", 0))
                recall_ctx_vals.append(g.get("context_recall", 0))

        if faith_vals:
            print("\n── GENERATION (per question, LLM-as-Judge) ──────────────────────────\n")
            for r in results:
                if "generation" not in r:
                    continue
                g = r["generation"]
                q = r["question"]
                q_disp = q[:58] + "..." if len(q) > 58 else q
                print(f"  Q: {q_disp}")
                print(f"     Faithfulness      : {g['faithfulness']:.3f}  {_bar(g['faithfulness'])}  {_grade(g['faithfulness'])}")
                print(f"     Answer Relevancy  : {g['answer_relevancy']:.3f}  {_bar(g['answer_relevancy'])}  {_grade(g['answer_relevancy'])}")
                print(f"     Context Precision : {g['context_precision']:.3f}  {_bar(g['context_precision'])}  {_grade(g['context_precision'])}")
                print(f"     Context Recall    : {g['context_recall']:.3f}  {_bar(g['context_recall'])}  {_grade(g['context_recall'])}")
                print()

            print("── GENERATION AVERAGES ─────────────────────────────────────────────\n")
            avg_f   = statistics.mean(faith_vals)
            avg_ar  = statistics.mean(rel_vals)
            avg_cp  = statistics.mean(prec_ctx_vals)
            avg_cr  = statistics.mean(recall_ctx_vals)
            print(f"  Avg Faithfulness      : {avg_f:.3f}  {_bar(avg_f)}  {_grade(avg_f)}")
            print(f"  Avg Answer Relevancy  : {avg_ar:.3f}  {_bar(avg_ar)}  {_grade(avg_ar)}")
            print(f"  Avg Context Precision : {avg_cp:.3f}  {_bar(avg_cp)}  {_grade(avg_cp)}")
            print(f"  Avg Context Recall    : {avg_cr:.3f}  {_bar(avg_cr)}  {_grade(avg_cr)}")

            print("\n── WHAT THESE SCORES MEAN ───────────────────────────────────────────\n")
            print("  Faithfulness      — answer uses ONLY the retrieved context (no hallucination)")
            print("  Answer Relevancy  — answer actually addresses the question")
            print("  Context Precision — retrieved chunks are useful, not noisy")
            print("  Context Recall    — retrieved context covers the full ground truth")
            print("  Score: GOOD ≥ 0.8  |  FAIR ≥ 0.5  |  POOR < 0.5")

    print("\n" + "=" * 72)


# ── Main ───────────────────────────────────────────────────────────────────────

async def main():
    print("\n=== RAG Evaluation ===\n")
    print("Loading FAISS index...")
    vector_db = load_faiss()

    # Allow overriding the model via env var. Default: gemini-3.5-flash-lite
    # (lighter free-tier model with higher daily quota than gemini-3.6-flash).
    JUDGE_MODEL = os.getenv("RAG_EVAL_MODEL", "gemini-3.5-flash-lite")

    if not RETRIEVAL_ONLY:
        from langchain_google_genai import ChatGoogleGenerativeAI
        llm = ChatGoogleGenerativeAI(
            model=JUDGE_MODEL,
            google_api_key=os.getenv("GEMINI_API_KEY"),
        )
        print(f"  LLM: {JUDGE_MODEL} (LLM-as-Judge)")
        print("  Tip: set RAG_EVAL_MODEL=<model> in .env to change the judge model.\n")
    else:
        llm = None
        print("  Mode: retrieval-only (skipping generation metrics)\n")

    results = []
    # Free tier: 5 requests/minute for gemini-3.6-flash.
    # Each question uses 2 calls (answer + combined scoring) = 24s minimum spacing.
    # 30s sleep gives comfortable headroom without making the run too slow.
    RATE_LIMIT_SLEEP = 30

    for i, entry in enumerate(EVAL_DATASET, start=1):
        q = entry["question"]
        print(f"[{i}/{len(EVAL_DATASET)}] {q}")

        # ── Retrieval metrics (always — no LLM needed)
        rm = compute_retrieval_metrics(vector_db, entry)
        print(f"  Retrieval → Precision={rm['precision_at_k']}  "
              f"Recall={rm['recall_at_k']}  MRR={rm['mrr']}  Hit={rm['hit_rate']}")

        result = {
            "question":  q,
            "reference": entry["reference"],
            "retrieval": rm,
        }

        # ── Generation metrics (2 LLM calls per question)
        if llm and not RETRIEVAL_ONLY:
            try:
                # Call 1: generate the answer from retrieved context
                answer = await generate_answer(llm, q, rm["contexts"])
                await asyncio.sleep(RATE_LIMIT_SLEEP)

                # Call 2: score all 4 generation metrics in one prompt
                gen_scores = await score_all_generation_metrics(
                    llm, q, entry["reference"], rm["contexts"], answer
                )
                result["generation"] = {"answer": answer, **gen_scores}
                print(f"  Generation → Faith={gen_scores['faithfulness']:.2f}  "
                      f"Relevancy={gen_scores['answer_relevancy']:.2f}  "
                      f"CtxPrec={gen_scores['context_precision']:.2f}  "
                      f"CtxRecall={gen_scores['context_recall']:.2f}")

                # Sleep before the next question (skip after the last one)
                if i < len(EVAL_DATASET):
                    print(f"  Waiting {RATE_LIMIT_SLEEP}s (rate limit)...")
                    await asyncio.sleep(RATE_LIMIT_SLEEP)

            except RuntimeError as e:
                # Daily quota exhausted — save retrieval results and move on
                print(f"  [SKIP] Generation metrics unavailable: {e}")
                result["generation_skipped"] = str(e)

        results.append(result)
        print()

    # ── Print report
    print_report(results)

    # ── Save to logs/
    out = {
        "run_at":         datetime.now(timezone.utc).isoformat(),
        "retrieval_only": RETRIEVAL_ONLY,
        "k":              K,
        "distance_threshold": RETRIEVAL_MAX_DISTANCE,
        "results":        results,
    }
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = LOG_DIR / f"rag_eval_{ts}.json"
    out_path.write_text(json.dumps(out, indent=2, default=str))
    print(f"\nFull results saved → {out_path}")


if __name__ == "__main__":
    asyncio.run(main())
