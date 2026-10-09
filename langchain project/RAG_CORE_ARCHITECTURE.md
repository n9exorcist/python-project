# RAG Core Architecture (`rag_core.py` + `ingest.py`)

## Overview

Two-phase pipeline: **index once** (ingest.py), **query many times** (rag_core.py).

```
INGEST (offline)                          QUERY (per user question)
─────────────────────────────────         ──────────────────────────────────────────
Files → chunk → embed → FAISS            query → cache? → embed → FAISS (dense)
                       → disk                          → BM25 (keyword)
                                                       → RRF merge
                                                       → injection screen
                                                       → version resolve
                                                       → FlashRank rerank
                                                       → format with citations
```

---

## 1 Database

| Property        | Value                                  |
| --------------- | -------------------------------------- |
| Engine          | FAISS (flat, in-memory, saved to disk) |
| Embedding model | Gemini `gemini-embedding-001`          |
| Dimensions      | 3072                                   |
| Index file      | `faiss_index/index.faiss`              |
| Current size    | ~305 vectors                           |
| Search type     | Exact (brute-force L2)                 |

FAISS is loaded **once** at MCP server startup and kept in memory — no disk I/O per query.

---

## Phase 1: Ingestion (`ingest.py`)

### Run modes

```bash
python ingest.py          # incremental — only changed/new files re-embedded
python ingest.py --full   # full rebuild from scratch
```

### Chunking strategy

Chunk size is tuned by document category, inferred from the filename:

| Category    | Chunk size | Overlap | Triggered by filename containing        |
| ----------- | ---------- | ------- | --------------------------------------- |
| `faq`       | 300 chars  | 30      | faq, question, q&a, help, support       |
| `technical` | 1000 chars | 100     | (default)                               |
| `legal`     | 2500 chars | 200     | legal, contract, policy, gdpr, nda, tos |

`add_start_index=True` on the splitter records the character offset of each chunk inside its page — used for exact citations.

### Metadata stamped on every chunk

```python
{
  "source":        "accenture-q2-fy26.pdf",   # filename
  "doc_version":   "a1b2c3d4e5f6",            # sha256[:12] of file content
  "doc_type":      "pdf",
  "chunk_category":"technical",
  "ingested_at":   "2026-10-08T09:15:00+00:00",
  "doc_id":        "accenture-q2-fy26.pdf@a1b2c3d4e5f6",
  "chunk_id":      "3f9a1c2b4d5e6f7a",        # sha256 of (doc_id|page|offset|content_hash)
  "char_start":    1200,
  "char_end":      2190,
  "content_hash":  "7a8b9c0d1e2f3a4b",        # normalised sha256 for dedup
  "tenant_id":     "default",
  "acl":           ["public"],
}
```

`chunk_id` is **deterministic** — re-ingesting the same file version yields identical ids, so citations stay valid across runs.

### Deduplication

```python
def _content_hash(text):
    return sha256(" ".join(text.lower().split()).encode()).hexdigest()[:16]
```

Whitespace/case-insensitive: the same paragraph re-extracted with different line breaks is still a duplicate. `seen_hashes` is shared across all files in a run — same paragraph in two PDFs is embedded once.

### Incremental sync

```python
present = {(source, doc_version): [chunk_ids]}   # what the index holds
want    = desired_versions()                       # sha256 of every file on disk

to_add = want - present   # new or changed files
stale  = present - want   # deleted or superseded files

vector_db.delete(stale_chunk_ids)         # remove old chunks first
embed_in_batches(new_chunks, vector_db)   # embed only what changed
```

Only changed files are re-embedded — a file whose content hash is unchanged is skipped entirely.

### Embedding (batched, rate-limit aware)

```python
# batches of 10, 75s pause between batches (free-tier Gemini limit)
# exponential backoff on 429/RESOURCE_EXHAUSTED: 10s → 20s → 40s → ...
embed_in_batches(documents, embeddings, batch_size=10)
```

### Skipped files

`EQUITY_L.csv` and `SME_EQUITY_L.csv` are excluded — large listing CSVs better served by direct SQL/CSV lookup tools. Embedding every row would burn the free-tier quota and add retrieval noise.

---

## Phase 2: Query (`rag_core.py`)

### Tuning knobs

| Constant                 | Default | What it controls                                         |
| ------------------------ | ------- | -------------------------------------------------------- |
| `RETRIEVAL_MAX_DISTANCE` | 0.65    | L2 distance threshold; beyond this a chunk is irrelevant |
| `CANDIDATES`             | 20      | Top-k from each retriever; also the rerank input budget  |
| `TOP_N`                  | 5       | Chunks the writer actually sees                          |
| `CACHE_TTL_S`            | 300     | Query cache TTL (seconds)                                |
| `CACHE_SIZE`             | 256     | LRU cache max entries                                    |
| `RRF_K`                  | 60      | RRF smoothing constant                                   |
| `STALE_AFTER_DAYS`       | 90      | Age threshold for STALE flag in citations                |

All overridable via env vars.

### The distance threshold (0.65)

FAISS always returns exactly `k` results regardless of relevance. Measured on this index with Gemini embeddings:

```
relevant queries, best hit     0.33 – 0.49
irrelevant queries, best hit   0.86 – 0.92   (chocolate cake, car tyres)
padding inside relevant ones   0.75 – 0.82
```

0.65 sits in the empty band between the two populations. Past it a chunk is dropped and the query returns "No local records found." instead of confident-looking irrelevancies.

> Re-measure if the embedding model or corpus changes — distances are only comparable within one model.

---

### Step-by-step: `HybridRetriever.retrieve()`

#### Step 0 — Cache check

```python
key = (tenant_id, roles, " ".join(query.lower().split()))
if (hit := self._cache.get(key)) is not None:
    return RetrievalResult(**{**hit.__dict__, "cached": True})
```

Identical queries (normalised) skip all downstream work for 5 minutes. Cache is thread-safe (LRU + TTL, `threading.Lock()`).

#### Step 1 — Access filter

```python
allowed = access_filter(tenant_id, roles)
# allowed(meta) -> True if meta["tenant_id"] matches AND role intersects ACL
```

Identity comes from env vars (`RAG_TENANT_ID`, `RAG_ROLES`), set at server startup — the prompt or retrieved text can never escalate its own permissions.

#### Step 2 — Dense search (FAISS)

```python
vec = self._embed(query)    # lru_cache(1024): same query string → no re-embed
scored = self.db.similarity_search_with_score_by_vector(
    vec, k=CANDIDATES, filter=allowed, fetch_k=self.db.index.ntotal)
semantic = [d for d, dist in scored if dist <= RETRIEVAL_MAX_DISTANCE]
```

- `fetch_k=ntotal` → scans the whole index so the filter can be applied pre-retrieval (not post-hoc)
- Returns up to 20 semantically similar chunks, capped by the distance threshold

#### Step 3 — Keyword search (BM25)

```python
keyword = [d for d in self._bm25[tenant_id].invoke(query) if allowed(d.metadata)]
```

- One `BM25Retriever` built per tenant at startup — keyword search never scores another tenant's chunks
- Catches exact-term queries that semantic search ranks poorly (e.g. ticker symbols, proper nouns)

#### Step 4 — RRF merge

```python
fused = rrf_merge(semantic, keyword, top_n=CANDIDATES)
# score(doc) = Σ 1/(rank_in_list + 60)  for each list the doc appears in
```

A chunk in both lists outscores one in either alone. Result: top 20 by combined score.

#### Step 5 — Injection screening

```python
screened, quarantined = screen_injection(fused)
# drops chunks matching INJECTION_RE patterns (e.g. "ignore previous instructions")
```

Secondary defence — primary defence is `format_for_llm()` which wraps every chunk as `<document>` tagged DATA with an explicit "not instructions" preamble.

#### Step 6 — Version resolution

```python
resolved, superseded = resolve_versions(screened)
# same source in two versions → keep only the newest ingested_at timestamp
```

Prevents the writer from seeing two conflicting versions of the same document. Incremental ingest normally handles this at index time, but this is a runtime safety net.

#### Step 7 — Rerank (FlashRank)

```python
docs, reranker = rerank(query, resolved, TOP_N)
# 20 candidates → ms-marco-MiniLM-L-12-v2 cross-encoder → top 5
```

Cross-encoder rescores each candidate against the full query, not just the embedding. More accurate than vector distance alone. Falls back to RRF order if FlashRank isn't installed.

#### Step 8 — Format for LLM

```python
format_for_llm(result)
# "[1] cite: file.pdf@v1a2b#p3:c1200-2190 · chunk: 3f9a... · indexed 5d ago
#  <document index="1">
#  ...chunk text...
#  </document>"
```

- Every chunk wrapped in `<document>` tags (data framing, not instructions)
- Citation includes: doc_id, page, char range, chunk_id, age, STALE flag
- Preamble instructs the LLM to cite by `[n]` and prefer newer non-STALE chunks when records disagree

---

## Timing

Each stage is timed and logged per query:

```python
{"embed": 120.3, "dense": 8.1, "bm25": 2.4, "fuse_rerank": 45.2, "total": 176.0}  # ms
```

---

## Data Flow Diagram

```
                    ┌─────────────┐
                    │  ingest.py  │
                    │  (offline)  │
                    └──────┬──────┘
                           │ embed (Gemini 3072-d)
                           ▼
                    ┌─────────────┐        ┌──────────────┐
                    │ FAISS index │        │ BM25 indexes │
                    │  (disk)     │        │  (in-memory, │
                    └──────┬──────┘        │  per tenant) │
                           │ load once     └──────┬───────┘
                           ▼                      │
                    ┌──────────────────────────────┴──────────┐
                    │           HybridRetriever               │
                    │                                         │
  query ──────────► │  cache? ──► embed ──► FAISS dense (20) │
                    │                   ──► BM25 keyword (20)│
                    │                   ──► RRF merge (20)   │
                    │                   ──► screen injection  │
                    │                   ──► resolve versions  │
                    │                   ──► FlashRank (→ 5)  │
                    │                   ──► format + cite     │
                    └─────────────────────────────────────────┘
                                         │
                                         ▼
                              ToolMessage in graph state
                              (writer reads, never calls tools)
```

---

## Citation Format

```
accenture-q2-fy26.pdf@a1b2c3d4e5f6#p1:c1200-2190
│                    │             │  │  │
│                    │             │  │  └── char_end (offset in page text)
│                    │             │  └───── char_start
│                    │             └──────── page number
│                    └────────────────────── doc_version (file content hash)
└─────────────────────────────────────────── source filename
```

Deterministic — re-ingesting the same file version yields the same citation, so links remain valid across runs.
