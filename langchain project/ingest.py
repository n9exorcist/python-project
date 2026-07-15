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


def _stamp(docs, source, version, doc_type, ingested_at):
    """Attach provenance to every doc, preserving loader metadata (e.g. page)."""
    for d in docs:
        d.metadata = {
            **(d.metadata or {}),
            "source": source,
            "doc_version": version,
            "doc_type": doc_type,
            "ingested_at": ingested_at,
        }
    return docs


def load_local_documents():
    loaded_docs = []
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

        file_path = os.path.join(DATA_PATH, file)
        ext = os.path.splitext(file)[1].lower()

        try:
            version = _file_version(file_path)

            if ext == ".pdf":
                docs = PyPDFLoader(file_path).load()
                loaded_docs.extend(_stamp(docs, file, version, "pdf", ingested_at))
            elif ext == ".csv":
                docs = CSVLoader(file_path).load()
                loaded_docs.extend(_stamp(docs, file, version, "csv", ingested_at))
            elif ext in [".xlsx", ".xls"]:
                df = pd.read_excel(file_path)
                docs = []
                for index, row in df.iterrows():
                    content = " ".join(
                        [f"{col}: {val}" for col, val in row.items() if pd.notna(val)]
                    )
                    docs.append(Document(page_content=content, metadata={"row": index}))
                loaded_docs.extend(_stamp(docs, file, version, "xlsx", ingested_at))
            else:
                continue

            file_docs += 1
            print(f"  loaded {file}  (v:{version})")
        except Exception as e:
            print(f"Error loading {file}: {e}")

    # Manual knowledge-base entries. These previously carried NO metadata, so any
    # answer grounded in them was unattributable. Now each is versioned by content.
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
        loaded_docs.append(Document(
            page_content=text,
            metadata={
                "source": "manual_knowledge_base",
                "doc_version": _text_version(text),
                "doc_type": "manual",
                "ingested_at": ingested_at,
            },
        ))

    return loaded_docs


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


print("Starting ingestion process...")

try:
    raw_documents = load_local_documents()

    if raw_documents:
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
        # split_documents propagates each parent's metadata onto its chunks,
        # so provenance survives chunking.
        documents = text_splitter.split_documents(raw_documents)
        print(f"{len(raw_documents)} documents -> {len(documents)} chunks (provenance stamped)")

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