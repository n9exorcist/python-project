import os
import json
import pandas as pd
import sqlite3
from datetime import datetime, timezone
from dotenv import load_dotenv

from mcp.server.fastmcp import FastMCP, Context
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_community.tools.tavily_search import TavilySearchResults


load_dotenv()

# All file paths are anchored to THIS file's directory, not the current working
# directory, so the server behaves the same no matter where you launch it from.
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Chunks indexed longer ago than this are flagged STALE in retrieval output,
# so the agent can caveat rather than silently assert an outdated figure.
STALE_AFTER_DAYS = int(os.getenv("STALE_AFTER_DAYS", "90"))

# Initialize FastMCP
mcp = FastMCP("MarketAnalystPro")

# --- AI & SEARCH SETUP ---
embeddings = GoogleGenerativeAIEmbeddings(
    model="models/gemini-embedding-001",
    google_api_key=os.getenv("GEMINI_API_KEY")
)

# NOTE: TavilySearchResults is deprecated in newer langchain. When you clear
# warnings: pip install -U langchain-tavily, then
#   from langchain_tavily import TavilySearch
web_search_tool = TavilySearchResults(max_results=3)

# FAISS index: prefer <base>/faiss_index, fall back to <base>/app/faiss_index.
_faiss_candidates = [
    os.path.join(BASE_DIR, "faiss_index"),
    os.path.join(BASE_DIR, "app", "faiss_index"),
]
FAISS_PATH = next((p for p in _faiss_candidates if os.path.exists(p)), None)

if FAISS_PATH:
    vector_db = FAISS.load_local(
        FAISS_PATH,
        embeddings,
        allow_dangerous_deserialization=True
    )
    retriever = vector_db.as_retriever(search_kwargs={"k": 5})
else:
    print(f"--- WARNING: FAISS index not found in {_faiss_candidates} ---")
    retriever = None


# --- CSV SIGNAL TOOL ---
@mcp.tool()
def mcp_read_signals_csv(date: str = "today", time: str = "9:15 AM") -> str:
    """
    USE THIS TOOL TO READ THE LOCAL FILE 'signals.csv'.
    This is NOT for stock tickers. Use this to find the 'Candle' color
    (Green/Red) for a specific date from the local Options Selling records.
    """
    target_date = date
    if date.lower() == "today":
        target_date = datetime.now().strftime("%d-%m-%Y")

    # Search likely locations, all anchored to BASE_DIR.
    csv_paths = [
        os.path.join(BASE_DIR, "data", "signals.csv"),
        os.path.join(BASE_DIR, "app", "data", "signals.csv"),
        os.path.join(BASE_DIR, "..", "data", "signals.csv"),
    ]
    csv_path = next((p for p in csv_paths if os.path.exists(p)), None)

    if not csv_path:
        return f"Error: signals.csv not found at searched paths: {csv_paths}"

    try:
        df = pd.read_csv(csv_path)
        df['Date'] = df['Date'].astype(str).str.strip()

        result = df[df['Date'] == target_date]

        if result.empty:
            return f"No signal found in CSV for {target_date}. Please check the date format."

        # str() guards against a blank cell being read as NaN (a float),
        # which would crash .strip().
        signal = str(result.iloc[0]['Candle']).strip()

        s_lower = signal.lower()
        if s_lower == "green":
            bias = "BULLISH (Sell Put / Buy Call)"
        elif s_lower == "red":
            bias = "BEARISH (Sell Call / Buy Put)"
        else:
            bias = "NEUTRAL (No Trade / Observation)"

        return (f"Options Selling Data for {target_date}:\n"
                f"Entry Time: {time}\n"
                f"Candle Signal: {signal}\n"
                f"Strategy Bias: {bias}")
    except Exception as e:
        return f"Error reading signals.csv: {e}"


# --- TRADE HISTORY TOOL ---
@mcp.tool()
def mcp_get_trade_history(date: str = "today") -> str:
    """
    Queries the local SQLite memory.db to fetch executed dummy trades.
    Use this to verify if a trade was successfully logged.
    """
    if date.lower() == "today":
        date = datetime.now().strftime("%d-%m-%Y")

    # IMPORTANT: this reads memory.db from THIS file's folder. Confirm it is the
    # same file that main.py's daily_trade_job writes to (DB_PATH in
    # app/db/database.py). If they differ, verification will always look empty.
    db_path = os.path.join(BASE_DIR, "memory.db")
    print(f"--- DEBUG: MCP is looking for DB at: {db_path} ---")

    # Real existence check. sqlite3.connect() would otherwise silently CREATE an
    # empty memory.db, hiding the fact that the real one is elsewhere.
    if not os.path.exists(db_path):
        return f"Error: memory.db not found at {db_path}."

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='dummy_trades';")
        if not cursor.fetchone():
            conn.close()
            return "Error: Table 'dummy_trades' does not exist in the database yet."

        cursor.execute("SELECT * FROM dummy_trades WHERE date = ?", (date,))
        rows = cursor.fetchall()
        conn.close()

        if not rows:
            return f"No dummy trades were found in memory.db for the date {date}."

        return f"Confirmed Trade History for {date}: {str(rows)}"
    except Exception as e:
        return f"Database Query Error: {str(e)}"


@mcp.resource("market://cycles")
def get_market_cycles() -> str:
    return (
        "Defense sectors thrive under robotic advancement; Gold/Silver remain safe havens. "
        "Observe the current ratio for Gold-Silver for reversal signs."
    )


# --- CORPORATE RECORDS (RAG) TOOL ---
def _format_with_provenance(doc, idx: int) -> str:
    """Render a retrieved chunk with its source, version, and age.

    This is what makes an answer reconstructable later: the provenance travels in
    the tool result -> ToolMessage -> graph state -> /chat/debug_state.
    """
    meta = getattr(doc, "metadata", None) or {}
    source = meta.get("source", "unknown")
    version = meta.get("doc_version", "unversioned")
    page = meta.get("page")
    ingested = meta.get("ingested_at")

    bits = [f"source: {source}", f"v:{version}"]
    if page is not None:
        bits.append(f"p.{page}")
    if ingested:
        try:
            dt = datetime.fromisoformat(ingested)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            days = (datetime.now(timezone.utc) - dt).days
            age = f"indexed {days}d ago"
            if days > STALE_AFTER_DAYS:
                age += " \u00b7 STALE"
            bits.append(age)
        except Exception:
            pass

    header = f"[{idx}] " + " \u00b7 ".join(bits)
    content = getattr(doc, "page_content", str(doc))
    return f"{header}\n{content}"


@mcp.tool()
def mcp_search_corporate_records(query: str) -> str:
    """
    Search internal corporate records (Accenture financials, market notes, and
    other ingested documents) from the local FAISS knowledge base. Use this for
    company facts, earnings figures, bookings, dividends, and named people that
    live in internal documents rather than on the live web.

    Each result is returned with its provenance: source file, document version,
    and how long ago it was indexed. Results marked STALE may be outdated -- say
    so in your answer rather than asserting the figure as current.
    """
    if not retriever:
        return "Error: Local FAISS index not found."
    try:
        docs = retriever.invoke(query)
        if not docs:
            return "No local records found."
        # Provenance is preserved here. The previous version returned page_content
        # only, discarding metadata entirely -- so answers were unattributable.
        return "\n\n".join(_format_with_provenance(d, i) for i, d in enumerate(docs, 1))
    except Exception as e:
        return f"Error searching local records: {e}"


# --- WEB SEARCH TOOL (with async progress) ---
@mcp.tool()
async def mcp_search_the_web(query: str, ctx: Context) -> str:
    """Searches the web for market data with real-time progress updates."""
    try:
        await ctx.report_progress(10, 100, message="Initializing Tavily search engine...")

        await ctx.report_progress(30, 100, message=f"Searching web for: {query}...")
        results = await web_search_tool.ainvoke({"query": query})

        await ctx.report_progress(70, 100, message="Analyzing search results...")

        if isinstance(results, list):
            output = "\n".join([
                res.get("content", str(res)) if isinstance(res, dict) else str(res)
                for res in results
            ])
            await ctx.report_progress(100, 100, message="Web search complete.")
            return output

        return str(results)
    except Exception as e:
        await ctx.report_progress(100, 100, message="Search failed.")
        return f"Error searching the web: {e}"


@mcp.prompt()
def market_analyst_persona(question: str) -> str:
    return f"""You are a Market Analyst. 
    User Question: {question}
    Use your tools to provide a professional and detailed response."""


if __name__ == "__main__":
    # FastMCP's SSE transport serves on 127.0.0.1:8000 by default, which is what
    # main.py's MCP client connects to. (The old getattr(mcp, "app"...) / uvicorn
    # fallback targeted an attribute that doesn't exist in this version, so it
    # silently landed here anyway — on 8000, not the 9001 it printed.)
    print("--- [MCP] Starting SSE Server on http://127.0.0.1:8000 ---")
    mcp.run(transport="sse")