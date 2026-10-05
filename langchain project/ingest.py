"""
FAISS ingestion with PROVENANCE.

Every chunk is stamped with:
  source       - which file (or "manual_knowledge_base") it came from
  doc_version  - content hash of the source file; changes when the file changes
  doc_type     - pdf | csv | xlsx | manual
  ingested_at  - UTC timestamp of indexing (enables age / staleness signals)
  doc_id       - "<source>@<doc_version>": the citable document
  chunk_id     - stable id of the chunk; also its FAISS docstore id
  char_start / char_end - offsets of the chunk inside its page / row, so a
                 citation points at the exact evidence, not just the file
  tenant_id / acl - who may retrieve it (rag_core.access_filter)
  content_hash - normalised-text hash used to drop duplicate chunks

This is what lets you answer, weeks later: "which source did this recommendation
rely on, which version of it, and was it current at the time?"

Re-run this after changing anything in ./data. Indexing is INCREMENTAL: a file
whose content hash is already in the index is not re-read or re-embedded, a
changed file has its old version deleted and the new one added, and a removed
file's chunks are deleted. Pass --full to rebuild from scratch.

    python ingest.py            # incremental
    python ingest.py --full     # rebuild
"""

import os
import sys
import time
import hashlib
from datetime import datetime, timezone

import pandas as pd
from dotenv import load_dotenv
from langchain_community.vectorstores import FAISS
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_core.documents import Document
from langchain_community.document_loaders import PyPDFLoader, CSVLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter

load_dotenv()

gemini_key = os.getenv("GEMINI_API_KEY")

# Anchor paths to THIS file, not the current working directory. A CWD-relative
# "./data" silently resolves to wherever you happen to launch from -- which will
# quietly index nothing and overwrite a good index with an empty one.
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Look for the data folder next to this file first, then one level up.
_data_candidates = [
    os.path.join(BASE_DIR, "data"),
    os.path.abspath(os.path.join(BASE_DIR, "..", "data")),
]
DATA_PATH = next(
    (p for p in _data_candidates if os.path.isdir(p) and os.listdir(p)),
    _data_candidates[0],
)

# Write the index next to this file, where mcp_server.py looks for it.
FAISS_OUT = os.path.join(BASE_DIR, "faiss_index")

# Every chunk ingested by this run belongs to this tenant and is visible to
# these roles ("public" = anyone in the tenant). One run per tenant / ACL group.
INGEST_TENANT_ID = os.getenv("INGEST_TENANT_ID", "default")
INGEST_ACL = [a.strip() for a in os.getenv("INGEST_ACL", "public").split(",") if a.strip()]


def _file_version(path: str) -> str:
    """Content hash of a file = its version. Changes iff the file changes."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(65536), b""):
            h.update(block)
    return h.hexdigest()[:12]


def _text_version(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:12]


def _stamp(docs, source, version, doc_type, ingested_at, chunk_category="technical"):
    """Attach provenance to every doc, preserving loader metadata (e.g. page)."""
    for d in docs:
        d.metadata = {
            **(d.metadata or {}),
            "source": source,
            "doc_version": version,
            "doc_type": doc_type,
            "ingested_at": ingested_at,
            "chunk_category": chunk_category,
        }
    return docs


# ---------------------------------------------------------------------------
# Document-aware chunking
# ---------------------------------------------------------------------------
# Tune these per category. chunk_overlap should be ~10% of chunk_size.
_CHUNK_CONFIGS = {
    "faq":       {"chunk_size": 300,  "chunk_overlap": 30},
    "technical": {"chunk_size": 1000, "chunk_overlap": 100},
    "legal":     {"chunk_size": 2500, "chunk_overlap": 200},
}

_FAQ_KEYWORDS     = {"faq", "question", "q&a", "qa", "help", "support"}
_LEGAL_KEYWORDS   = {"legal", "contract", "agreement", "policy", "terms",
                     "compliance", "regulation", "gdpr", "nda", "tos", "privacy"}


def _detect_doc_category(filename: str) -> str:
    """Infer chunk category from filename. FAQ → small, Legal → large, else Technical."""
    name = filename.lower()
    if any(kw in name for kw in _FAQ_KEYWORDS):
        return "faq"
    if any(kw in name for kw in _LEGAL_KEYWORDS):
        return "legal"
    return "technical"


def _make_splitter(category: str) -> RecursiveCharacterTextSplitter:
    cfg = _CHUNK_CONFIGS[category]
    return RecursiveCharacterTextSplitter(**cfg, add_start_index=True)


def _content_hash(text: str) -> str:
    """Whitespace/case-insensitive hash: the same paragraph re-extracted with
    different line breaks is still a duplicate."""
    return hashlib.sha256(" ".join(text.lower().split()).encode("utf-8")).hexdigest()[:16]


def _finalize(chunks, seen_hashes: set) -> list:
    """Stamp citation + access metadata on each chunk; drop duplicates.

    seen_hashes is shared across files (and pre-seeded with what the index
    already holds), so the same paragraph in two PDFs is embedded once.
    """
    kept = []
    for c in chunks:
        h = _content_hash(c.page_content)
        if h in seen_hashes:
            continue
        seen_hashes.add(h)
        m = c.metadata
        start = m.pop("start_index", 0) or 0
        doc_id = f"{m['source']}@{m['doc_version']}"
        # Deterministic from (document, position, content): re-ingesting the same
        # file version yields the same ids, so citations stay valid across runs.
        cid = hashlib.sha256(f"{doc_id}|{m.get('page', m.get('row', ''))}|{start}|{h}"
                             .encode("utf-8")).hexdigest()[:16]
        m.update({
            "doc_id": doc_id,
            "chunk_id": cid,
            "char_start": start,
            "char_end": start + len(c.page_content),
            "content_hash": h,
            "tenant_id": INGEST_TENANT_ID,
            "acl": INGEST_ACL,
        })
        kept.append(c)
    return kept


# Manual knowledge-base entries — short strings, always technical category.
MANUAL_TEXTS = [
    "The defense sector relies heavily on advanced robotics and secure supply chains.",
    "Gold and silver are considered safe-haven assets during market volatility.",
    "Copper is a highly conductive metal essential for industrial automation.",
    "Accenture reported record new bookings of $22.1 billion for Q2 FY26.",
    "Accenture's Q2 FY26 revenues reached $18.0 billion, an 8% increase.",
    "CEO Julie Sweet noted significant AI-driven growth.",
    "Accenture declared a dividend of $1.63 per share, a 10% increase.",
    "Narayanan Selvaraj is a Team Lead at Accenture specializing in Full-Stack LLM and ReactJS.",
]


def _data_files():
    """(file_name, path, ext) for every ingestible file in DATA_PATH."""
    if not os.path.isdir(DATA_PATH):
        print(f"\n!!! DATA FOLDER NOT FOUND: {DATA_PATH}")
        print(f"!!! Searched: {_data_candidates}")
        print("!!! Only the manual knowledge-base entries will be indexed.\n")
        return []
    out = []
    for file in os.listdir(DATA_PATH):
        ext = os.path.splitext(file)[1].lower()
        if file.startswith("~$") or ext not in (".pdf", ".csv", ".xlsx", ".xls"):
            continue
        if file in SKIP_FILES:
            print(f"  skipped {file}  (in SKIP_FILES — use direct lookup tools instead)")
            continue
        out.append((file, os.path.join(DATA_PATH, file), ext))
    return out


def desired_versions() -> set:
    """Every (source, doc_version) the index SHOULD hold — hashing only, no parsing."""
    want = set()
    for file, path, _ in _data_files():
        try:
            want.add((file, _file_version(path)))
        except OSError as e:
            print(f"Error hashing {file}: {e}")
    want.update(("manual_knowledge_base", _text_version(t)) for t in MANUAL_TEXTS)
    return want


def load_local_documents(only: set | None = None, seen_hashes: set | None = None):
    """Load, chunk, stamp and dedupe documents. Returns ready-to-embed chunks.

    only        - restrict to these (source, doc_version) pairs; None = everything
    seen_hashes - content hashes already indexed (incremental runs); updated in place

    Each file is split with a chunk size tuned to its category:
      faq      → 300  chars  (tight Q&A pairs)
      technical→ 1000 chars  (default; earnings reports, specs, CSVs)
      legal    → 2500 chars  (preserve long clause context)
    Category is inferred from the filename; override by renaming the file or
    editing _FAQ_KEYWORDS / _LEGAL_KEYWORDS above.
    """
    all_chunks = []
    seen_hashes = set() if seen_hashes is None else seen_hashes
    ingested_at = datetime.now(timezone.utc).isoformat(timespec="seconds")

    print(f"DATA_PATH  : {DATA_PATH}")
    print(f"FAISS_OUT  : {FAISS_OUT}")
    print(f"TENANT/ACL : {INGEST_TENANT_ID} / {INGEST_ACL}")

    for file, file_path, ext in _data_files():
        try:
            version = _file_version(file_path)
            if only is not None and (file, version) not in only:
                continue
            category = _detect_doc_category(file)
            splitter = _make_splitter(category)
            cfg = _CHUNK_CONFIGS[category]

            if ext == ".pdf":
                docs = PyPDFLoader(file_path).load()
            elif ext == ".csv":
                docs = CSVLoader(file_path).load()
            else:
                df = pd.read_excel(file_path)
                docs = []
                for index, row in df.iterrows():
                    content = " ".join(
                        [f"{col}: {val}" for col, val in row.items() if pd.notna(val)]
                    )
                    docs.append(Document(page_content=content, metadata={"row": index}))

            _stamp(docs, file, version, ext.lstrip("."), ingested_at, chunk_category=category)
            split = splitter.split_documents(docs)
            chunks = _finalize(split, seen_hashes)
            all_chunks.extend(chunks)

            print(f"  loaded {file}  (v:{version})  "
                  f"category={category}  chunk_size={cfg['chunk_size']}  "
                  f"→ {len(chunks)} chunks ({len(split) - len(chunks)} duplicates dropped)")
        except Exception as e:
            print(f"Error loading {file}: {e}")

    manual = []
    for text in MANUAL_TEXTS:
        version = _text_version(text)
        if only is not None and ("manual_knowledge_base", version) not in only:
            continue
        manual.append(Document(
            page_content=text,
            metadata={
                "source": "manual_knowledge_base",
                "doc_version": version,
                "doc_type": "manual",
                "chunk_category": "technical",
                "ingested_at": ingested_at,
                "start_index": 0,
            },
        ))
    all_chunks.extend(_finalize(manual, seen_hashes))

    return all_chunks


def build_embeddings_with_retry():
    return GoogleGenerativeAIEmbeddings(
        model="models/gemini-embedding-001",
        google_api_key=gemini_key,
    )


def _with_429_retry(fn, max_retries=5):
    delay = 10
    for attempt in range(max_retries):
        try:
            return fn()
        except Exception as e:
            msg = str(e)
            if ("RESOURCE_EXHAUSTED" in msg or "429" in msg) and attempt < max_retries - 1:
                wait = delay * (2 ** attempt)
                print(f"429 hit. Waiting {wait}s before retrying...")
                time.sleep(wait)
                continue
            raise


def embed_in_batches(documents, embeddings, vector_db=None, batch_size=10):
    """Embed in small batches under the free-tier rate limit. Chunk ids become
    the docstore ids, which is what lets a later run delete them by version."""
    for i in range(0, len(documents), batch_size):
        batch = documents[i:i + batch_size]
        ids = [d.metadata["chunk_id"] for d in batch]
        if vector_db is None:
            vector_db = _with_429_retry(lambda: FAISS.from_documents(batch, embeddings, ids=ids))
        else:
            _with_429_retry(lambda: vector_db.add_documents(batch, ids=ids))
        print(f"  embedded {min(i + batch_size, len(documents))}/{len(documents)}")
        if i + batch_size < len(documents):
            print("Waiting for rate limit...")
            time.sleep(75)
    return vector_db


# Files to skip — large listing/universe CSVs are better served by direct lookup
# tools (mcp_read_signals_csv, SQL queries) than by RAG. Embedding every row
# burns 3000+ of the 1000-per-day free-tier quota and adds retrieval noise.
SKIP_FILES = {
    "EQUITY_L.csv",
    "SME_EQUITY_L.csv",
}


def run(full: bool = False):
    embeddings = build_embeddings_with_retry()
    want = desired_versions()

    vector_db = None
    if not full and os.path.exists(os.path.join(FAISS_OUT, "index.faiss")):
        vector_db = FAISS.load_local(FAISS_OUT, embeddings, allow_dangerous_deserialization=True)

    if vector_db is None:
        print("Mode: FULL rebuild")
        documents = load_local_documents()
        if not documents:
            print("Nothing to index.")
            return
        if not any(d.metadata["source"] != "manual_knowledge_base" for d in documents):
            print("\n!!! WARNING: no PDF/CSV/XLSX files were loaded from DATA_PATH.")
            print("!!! Indexing ONLY the manual knowledge-base entries would REPLACE")
            print("!!! your existing index with a much smaller one. Check DATA_PATH above.\n")
        print(f"{len(documents)} total chunks across all documents")
        vector_db = embed_in_batches(documents, embeddings)
        vector_db.save_local(FAISS_OUT)
        print(f"\nSUCCESS: FAISS index saved with provenance metadata -> {FAISS_OUT}")
        return

    # Incremental: diff what the index holds against what ./data holds now.
    present: dict[tuple, list] = {}
    for doc_id, doc in vector_db.docstore._dict.items():
        m = doc.metadata or {}
        present.setdefault((m.get("source"), m.get("doc_version")), []).append(doc_id)

    if any("chunk_id" not in (d.metadata or {}) for d in vector_db.docstore._dict.values()):
        print("!!! Index predates chunk ids / char offsets — citations will be coarse.")
        print("!!! Run `python ingest.py --full` once to restamp every chunk.\n")

    to_add = want - set(present)
    stale = set(present) - want
    print(f"Mode: INCREMENTAL  unchanged={len(want & set(present))}  "
          f"new/changed={len(to_add)}  removed/superseded={len(stale)}")

    if stale:
        ids = [i for key in stale for i in present[key]]
        vector_db.delete(ids)
        for src, ver in sorted(stale, key=str):
            print(f"  deleted {src}@{ver}  ({len(present[(src, ver)])} chunks)")

    if to_add:
        # Seed dedup with what survives in the index, AFTER the deletes above, so
        # text carried over into a new version of a file is not dropped as a dupe.
        seen_hashes = {(d.metadata or {}).get("content_hash") or _content_hash(d.page_content)
                       for d in vector_db.docstore._dict.values()}
        documents = load_local_documents(only=to_add, seen_hashes=seen_hashes)
        print(f"{len(documents)} new chunks to embed")
        if documents:
            vector_db = embed_in_batches(documents, embeddings, vector_db)

    if stale or to_add:
        vector_db.save_local(FAISS_OUT)
        print(f"\nSUCCESS: index updated -> {FAISS_OUT}  ({vector_db.index.ntotal} vectors)")
    else:
        print("\nIndex already up to date.")


if __name__ == "__main__":
    print("Starting ingestion process...")
    try:
        run(full="--full" in sys.argv)
    except Exception as e:
        print(f"\nIngestion failed: {e}")
