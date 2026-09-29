"""
FAISS ingestion with PROVENANCE.

Every chunk is stamped with:
  source       - which file (or "manual_knowledge_base") it came from
  doc_version  - content hash of the source file; changes when the file changes
  doc_type     - pdf | csv | xlsx | manual
  ingested_at  - UTC timestamp of indexing (enables age / staleness signals)

This is what lets you answer, weeks later: "which source did this recommendation
rely on, which version of it, and was it current at the time?"

Re-run this after changing anything in ./data to refresh the index and versions.
"""

import os
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
    return RecursiveCharacterTextSplitter(**cfg)


def load_local_documents():
    """Load, chunk, and stamp all documents. Returns ready-to-embed chunks.

    Each file is split with a chunk size tuned to its category:
      faq      → 300  chars  (tight Q&A pairs)
      technical→ 1000 chars  (default; earnings reports, specs, CSVs)
      legal    → 2500 chars  (preserve long clause context)
    Category is inferred from the filename; override by renaming the file or
    editing _FAQ_KEYWORDS / _LEGAL_KEYWORDS above.
    """
    all_chunks = []
    file_docs = 0
    ingested_at = datetime.now(timezone.utc).isoformat(timespec="seconds")

    print(f"DATA_PATH  : {DATA_PATH}")
    print(f"FAISS_OUT  : {FAISS_OUT}")

    if not os.path.isdir(DATA_PATH):
        print(f"\n!!! DATA FOLDER NOT FOUND: {DATA_PATH}")
        print(f"!!! Searched: {_data_candidates}")
        print("!!! Only the manual knowledge-base entries will be indexed.\n")

    for file in os.listdir(DATA_PATH):
        if file.startswith("~$"):
            continue
        if file in SKIP_FILES:
            print(f"  skipped {file}  (in SKIP_FILES — use direct lookup tools instead)")
            continue

        file_path = os.path.join(DATA_PATH, file)
        ext = os.path.splitext(file)[1].lower()

        try:
            version = _file_version(file_path)
            category = _detect_doc_category(file)
            splitter = _make_splitter(category)
            cfg = _CHUNK_CONFIGS[category]

            if ext == ".pdf":
                docs = PyPDFLoader(file_path).load()
            elif ext == ".csv":
                docs = CSVLoader(file_path).load()
            elif ext in [".xlsx", ".xls"]:
                df = pd.read_excel(file_path)
                docs = []
                for index, row in df.iterrows():
                    content = " ".join(
                        [f"{col}: {val}" for col, val in row.items() if pd.notna(val)]
                    )
                    docs.append(Document(page_content=content, metadata={"row": index}))
            else:
                continue

            _stamp(docs, file, version, ext.lstrip("."), ingested_at, chunk_category=category)
            chunks = splitter.split_documents(docs)
            all_chunks.extend(chunks)

            file_docs += 1
            print(f"  loaded {file}  (v:{version})  "
                  f"category={category}  chunk_size={cfg['chunk_size']}  "
                  f"→ {len(chunks)} chunks")
        except Exception as e:
            print(f"Error loading {file}: {e}")

    # Manual knowledge-base entries — short strings, always technical category.
    manual_texts = [
        "The defense sector relies heavily on advanced robotics and secure supply chains.",
        "Gold and silver are considered safe-haven assets during market volatility.",
        "Copper is a highly conductive metal essential for industrial automation.",
        "Accenture reported record new bookings of $22.1 billion for Q2 FY26.",
        "Accenture's Q2 FY26 revenues reached $18.0 billion, an 8% increase.",
        "CEO Julie Sweet noted significant AI-driven growth.",
        "Accenture declared a dividend of $1.63 per share, a 10% increase.",
        "Narayanan Selvaraj is a Team Lead at Accenture specializing in Full-Stack LLM and ReactJS.",
    ]
    if file_docs == 0:
        print("\n!!! WARNING: no PDF/CSV/XLSX files were loaded from DATA_PATH.")
        print("!!! Indexing ONLY the manual knowledge-base entries would REPLACE")
        print("!!! your existing index with a much smaller one. Check DATA_PATH above.\n")

    for text in manual_texts:
        all_chunks.append(Document(
            page_content=text,
            metadata={
                "source": "manual_knowledge_base",
                "doc_version": _text_version(text),
                "doc_type": "manual",
                "chunk_category": "technical",
                "ingested_at": ingested_at,
            },
        ))

    return all_chunks


def build_embeddings_with_retry():
    return GoogleGenerativeAIEmbeddings(
        model="models/gemini-embedding-001",
        google_api_key=gemini_key,
    )


def safe_from_documents(batch, embeddings, max_retries=5):
    delay = 10
    for attempt in range(max_retries):
        try:
            return FAISS.from_documents(batch, embeddings)
        except Exception as e:
            msg = str(e)
            if "RESOURCE_EXHAUSTED" in msg or "429" in msg:
                if attempt < max_retries - 1:
                    wait = delay * (2 ** attempt)
                    print(f"429 hit. Waiting {wait}s before retrying...")
                    time.sleep(wait)
                    continue
            raise


# Files to skip — large listing/universe CSVs are better served by direct lookup
# tools (mcp_read_signals_csv, SQL queries) than by RAG. Embedding every row
# burns 3000+ of the 1000-per-day free-tier quota and adds retrieval noise.
SKIP_FILES = {
    "EQUITY_L.csv",
    "SME_EQUITY_L.csv",
}

if __name__ == "__main__":
    print("Starting ingestion process...")

    try:
        raw_documents = load_local_documents()  # already chunked per-file

        if raw_documents:
            # load_local_documents() already split each file with its per-category
            # splitter, so raw_documents are ready-to-embed chunks.
            documents = raw_documents
            print(f"{len(documents)} total chunks across all documents")

            embeddings = build_embeddings_with_retry()

            batch_size = 10
            vector_db = None

            for i in range(0, len(documents), batch_size):
                batch = documents[i:i + batch_size]

                if vector_db is None:
                    vector_db = safe_from_documents(batch, embeddings)
                else:
                    retry_delay = 10
                    for attempt in range(5):
                        try:
                            vector_db.add_documents(batch)
                            break
                        except Exception as e:
                            msg = str(e)
                            if "RESOURCE_EXHAUSTED" in msg or "429" in msg:
                                if attempt < 4:
                                    wait = retry_delay * (2 ** attempt)
                                    print(f"429 hit while adding docs. Waiting {wait}s before retrying...")
                                    time.sleep(wait)
                                    continue
                            raise

                if i + batch_size < len(documents):
                    print("Waiting for rate limit...")
                    time.sleep(75)

            vector_db.save_local(FAISS_OUT)
            print(f"\nSUCCESS: FAISS index saved with provenance metadata -> {FAISS_OUT}")

    except Exception as e:
        print(f"\nIngestion failed: {e}")