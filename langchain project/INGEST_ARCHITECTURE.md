# Ingestion Architecture (`ingest.py`)

## Purpose

Reads documents from `./data`, chunks them, embeds them with Gemini, and saves them into a FAISS vector index. The index is what the RAG pipeline searches at query time.

Run this whenever source documents change. It is **incremental by default** — only new or modified files are re-embedded.

```bash
python ingest.py          # incremental (smart diff)
python ingest.py --full   # wipe and rebuild from scratch
```

---

## What Gets Indexed

### Files from `./data`

| Extension | Loader | Notes |
|---|---|---|
| `.pdf` | `PyPDFLoader` | Page-aware; page number stored in metadata |
| `.csv` | `CSVLoader` | Each row becomes a document |
| `.xlsx` / `.xls` | pandas + manual | Each row serialised as `"col: val col: val ..."` |

### Skipped files

```python
SKIP_FILES = {"EQUITY_L.csv", "SME_EQUITY_L.csv"}
```

Large listing/universe CSVs are excluded — embedding every row would exhaust the free-tier quota (1000 requests/day) and add retrieval noise. These are better served by direct lookup tools (`mcp_read_signals_csv`).

### Manual knowledge-base entries

Hardcoded short strings always indexed regardless of what's in `./data`:

```python
MANUAL_TEXTS = [
    "The defense sector relies heavily on advanced robotics and secure supply chains.",
    "Gold and silver are considered safe-haven assets during market volatility.",
    "Accenture reported record new bookings of $22.1 billion for Q2 FY26.",
    "Accenture's Q2 FY26 revenues reached $18.0 billion, an 8% increase.",
    "CEO Julie Sweet noted significant AI-driven growth.",
    "Accenture declared a dividend of $1.63 per share, a 10% increase.",
    "Narayanan Selvaraj is a Team Lead at Accenture specializing in Full-Stack LLM and ReactJS.",
    ...
]
```

Each manual entry gets its own `doc_version` (sha256 of its text), so changing one string is treated as a new document — old version deleted, new one embedded.

---

## Path Resolution

All paths are anchored to the script's own directory (`__file__`), not the current working directory:

```python
BASE_DIR  = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = BASE_DIR/data   (or ../data as fallback)
FAISS_OUT = BASE_DIR/faiss_index
```

A CWD-relative `"./data"` would silently resolve to wherever you launch from — potentially indexing nothing and overwriting a good index with an empty one.

---

## Chunking

### Category detection (from filename)

```python
_FAQ_KEYWORDS   = {"faq", "question", "q&a", "qa", "help", "support"}
_LEGAL_KEYWORDS = {"legal", "contract", "agreement", "policy", "terms",
                   "compliance", "regulation", "gdpr", "nda", "tos", "privacy"}
```

| Category | Chunk size | Overlap | Why |
|---|---|---|---|
| `faq` | 300 chars | 30 | Q&A pairs are short; bigger chunks dilute the answer |
| `technical` | 1000 chars | 100 | Default; suits earnings reports, specs, CSVs |
| `legal` | 2500 chars | 200 | Long clause context must stay together |

Overlap (~10% of chunk size) prevents a key sentence split across two chunks from being missed by both.

### Splitter

```python
RecursiveCharacterTextSplitter(chunk_size=..., chunk_overlap=..., add_start_index=True)
```

`add_start_index=True` records the byte offset of each chunk inside its page — this is what makes exact-offset citations possible (`char_start`, `char_end`).

---

## Deduplication

```python
def _content_hash(text):
    return sha256(" ".join(text.lower().split()).encode()).hexdigest()[:16]
```

- Whitespace/case-insensitive: the same paragraph with different line breaks is still a duplicate
- `seen_hashes` is shared across **all files in a run** — the same paragraph in two PDFs is embedded once
- For incremental runs, `seen_hashes` is pre-seeded with hashes already in the index, so text carried into a new file version is not re-embedded

---

## Metadata Stamped on Every Chunk

Every chunk enters FAISS with this full provenance record:

```python
{
  # Identity
  "source":         "accenture-q2-fy26.pdf",
  "doc_version":    "a1b2c3d4e5f6",       # sha256[:12] of raw file bytes
  "doc_type":       "pdf",                 # pdf | csv | xlsx | manual
  "chunk_category": "technical",           # faq | technical | legal

  # When
  "ingested_at":    "2026-10-08T09:15:00+00:00",  # UTC, ISO 8601

  # Citable identity
  "doc_id":         "accenture-q2-fy26.pdf@a1b2c3d4e5f6",
  "chunk_id":       "3f9a1c2b4d5e6f7a",   # sha256 of (doc_id|page|offset|content_hash)
  "char_start":     1200,                  # offset of chunk inside its page
  "char_end":       2190,

  # Dedup
  "content_hash":   "7a8b9c0d1e2f3a4b",   # normalised sha256

  # Access control
  "tenant_id":      "default",
  "acl":            ["public"],
}
```

`chunk_id` is **deterministic** — re-ingesting the same file version produces identical IDs, so citations remain valid across runs and the FAISS docstore can delete chunks by ID.

---

## Versioning

### File version
```python
def _file_version(path):
    h = sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(65536), b""):
            h.update(block)
    return h.hexdigest()[:12]
```

Content hash of raw bytes — changes if and only if the file changes. Filename changes do not affect it.

### Manual text version
```python
def _text_version(text):
    return sha256(text.encode("utf-8")).hexdigest()[:12]
```

---

## Incremental Sync Logic

```
DISK state:   want = {(source, doc_version), ...}   ← sha256 every file right now
INDEX state:  present = {(source, doc_version): [chunk_ids], ...}  ← scan docstore

to_add = want - present      → new files or changed files (new version hash)
stale  = present - want      → deleted files or old versions of changed files
unchanged = want ∩ present   → skip entirely
```

```python
# 1. Delete stale chunks
vector_db.delete([id for key in stale for id in present[key]])

# 2. Embed only what's new
documents = load_local_documents(only=to_add, seen_hashes=surviving_hashes)
embed_in_batches(documents, embeddings, vector_db)

# 3. Save
vector_db.save_local(FAISS_OUT)
```

A changed file creates a new `doc_version` hash → old chunks land in `stale` (deleted), new chunks land in `to_add` (embedded). Unchanged files are never read or embedded.

---

## Embedding

### Model
```python
GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-001")
# → 3072-dimensional float vectors
```

### Batching + rate limiting
```python
# Free tier: limited requests per day
for i in range(0, len(documents), batch_size=10):
    FAISS.from_documents(batch, embeddings, ids=chunk_ids)
    sleep(75)   # pause between batches to stay under rate limit
```

### 429 retry (exponential backoff)
```python
def _with_429_retry(fn, max_retries=5):
    delay = 10
    for attempt in range(max_retries):
        try:
            return fn()
        except Exception as e:
            if "429" or "RESOURCE_EXHAUSTED" in str(e):
                sleep(delay * 2**attempt)   # 10s → 20s → 40s → 80s → 160s
            else:
                raise
```

---

## Full Run Flow

```
python ingest.py
        │
        ├── load .env (GEMINI_API_KEY, INGEST_TENANT_ID, INGEST_ACL)
        │
        ├── INCREMENTAL: load existing faiss_index from disk
        │       └── diff: present vs want
        │               ├── delete stale chunk IDs from index
        │               └── set to_add = new/changed (source, version) pairs
        │
        ├── FULL (--full flag or no index on disk):
        │       └── to_add = all files + all manual texts
        │
        ├── For each file in to_add:
        │       ├── detect category (faq / technical / legal)
        │       ├── load with appropriate loader
        │       ├── stamp source/version/type/ingested_at
        │       ├── split with category-tuned RecursiveCharacterTextSplitter
        │       └── _finalize(): dedup + stamp chunk_id, char offsets, tenant, acl
        │
        ├── For each manual text in to_add:
        │       └── same _finalize() path
        │
        ├── embed_in_batches():
        │       ├── batch_size=10
        │       ├── 75s pause between batches
        │       └── exponential 429 backoff
        │
        └── vector_db.save_local(faiss_index/)
                └── index.faiss + index.pkl (docstore with all metadata)
```

---

## Tenant & ACL

```python
INGEST_TENANT_ID = os.getenv("INGEST_TENANT_ID", "default")
INGEST_ACL       = os.getenv("INGEST_ACL", "public").split(",")
```

Every chunk ingested in a run belongs to one tenant and one ACL group. To index separate data for separate tenants, run `ingest.py` once per tenant with different env vars. At query time, `access_filter()` in `rag_core.py` enforces these — a chunk is only returned if the caller's `tenant_id` matches and their role intersects the chunk's `acl`.

---

## Output

```
faiss_index/
├── index.faiss   ← the vector matrix (3072-d float32 per chunk)
└── index.pkl     ← the docstore: {chunk_id → Document(page_content, metadata)}
```

The docstore is what makes metadata filtering and docstore-level deletes possible. `chunk_id` is the key in both the FAISS index and the docstore, so a delete by ID removes both the vector and the metadata atomically.
