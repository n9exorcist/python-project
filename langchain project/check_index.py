"""
FAISS index diagnostic.

Answers three questions the agent can't tell you:
  1. Which index file is actually being read?
  2. How many vectors are in it? (67 = full ingest; 8 = manual entries only;
     anything else = an interrupted or stale build)
  3. What does a real query return, and does provenance metadata exist?

Run:  python check_index.py
"""

import os
import sys

from dotenv import load_dotenv
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_community.vectorstores import FAISS

load_dotenv()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Same candidate list mcp_server.py uses, so we read exactly what it reads.
candidates = [
    os.path.join(BASE_DIR, "faiss_index"),
    os.path.join(BASE_DIR, "app", "faiss_index"),
    os.path.abspath(os.path.join(BASE_DIR, "..", "faiss_index")),
]

print("Searching for index:")
for c in candidates:
    print(f"  {'FOUND ' if os.path.exists(c) else 'absent'} {c}")

path = next((c for c in candidates if os.path.exists(c)), None)
if not path:
    print("\nNo FAISS index found. Run ingest.py.")
    sys.exit(1)

print(f"\nLoading: {path}")
for f in sorted(os.listdir(path)):
    full = os.path.join(path, f)
    size = os.path.getsize(full)
    mtime = os.path.getmtime(full)
    import datetime
    ts = datetime.datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M:%S")
    print(f"  {f:<16} {size:>10,} bytes   modified {ts}")

embeddings = GoogleGenerativeAIEmbeddings(
    model="models/gemini-embedding-001",
    google_api_key=os.getenv("GEMINI_API_KEY"),
)

db = FAISS.load_local(path, embeddings, allow_dangerous_deserialization=True)

total = db.index.ntotal
print(f"\nTOTAL VECTORS: {total}")
if total <= 10:
    print("  ^^ Only the manual entries. The PDF/CSV ingest did NOT complete.")
elif total < 60:
    print("  ^^ Fewer than expected (67). Ingest may have been interrupted.")
else:
    print("  ^^ Looks like the full ingest.")

# What sources are actually in there?
sources = {}
for doc in db.docstore._dict.values():
    m = doc.metadata or {}
    key = (m.get("source", "NO METADATA"), m.get("doc_version", "-"))
    sources[key] = sources.get(key, 0) + 1

print("\nSOURCES IN INDEX:")
for (src, ver), n in sorted(sources.items(), key=lambda x: -x[1]):
    print(f"  {n:>3} chunks   {src}   v:{ver}")
if all(k[0] == "NO METADATA" for k in sources):
    print("  ^^ No provenance. This index predates the provenance change -- re-run ingest.py.")

# The actual query the researcher used.
QUERIES = [
    "Narayanan Selvaraj specialization",
    "Accenture Q2 FY26 revenue",
]
for q in QUERIES:
    print(f"\n{'='*70}\nQUERY: {q}")
    try:
        results = db.similarity_search_with_score(q, k=5)
    except Exception as e:
        print(f"  SEARCH FAILED: {e}")
        continue
    for i, (doc, score) in enumerate(results, 1):
        m = doc.metadata or {}
        print(f"\n[{i}] score={score:.4f}  source={m.get('source','?')}  v:{m.get('doc_version','?')}")
        print(f"    {doc.page_content[:180].replace(chr(10), ' ')}")

print(f"\n{'='*70}")
print("If the Narayanan chunk does NOT appear above, the index is the problem.")
print("If it DOES appear, the index is fine and the issue is in the agent/tool layer.")