import os
import json
import pandas as pd
import sqlite3
from datetime import datetime
from dotenv import load_dotenv

from mcp.server.fastmcp import FastMCP, Context
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_community.tools.tavily_search import TavilySearchResults


load_dotenv()

# Initialize FastMCP
mcp = FastMCP("MarketAnalystPro")

# --- AI & SEARCH SETUP ---
embeddings = GoogleGenerativeAIEmbeddings(
    model="models/gemini-embedding-001",
    google_api_key=os.getenv("GEMINI_API_KEY")
)

web_search_tool = TavilySearchResults(max_results=3)

# Path handling for FAISS and Data
# If you run from root, it looks in /app/faiss_index. Adjust if needed.
FAISS_PATH = "faiss_index" if os.path.exists("faiss_index") else "app/faiss_index"

if os.path.exists(FAISS_PATH):
    vector_db = FAISS.load_local(
        FAISS_PATH,
        embeddings,
        allow_dangerous_deserialization=True
    )
    retriever = vector_db.as_retriever(search_kwargs={"k": 5})
else:
    print(f"--- WARNING: FAISS index not found at {FAISS_PATH} ---")
    retriever = None

# --- NEW: CSV SIGNAL TOOL ---
@mcp.tool()
def mcp_read_signals_csv(date: str = "today", time: str = "9:15 AM") -> str:
    """
    USE THIS TOOL TO READ THE LOCAL FILE 'signals.csv'. 
    This is NOT for stock tickers. Use this to find the 'Candle' color 
    (Green/Red) for a specific date from the local Options Selling records.
    """
    # 1. Handle 'today' logic
    # FIX: Ensure we use 'target_date' consistently
    target_date = date
    if date.lower() == "today":
        target_date = datetime.now().strftime("%d-%m-%Y")
    
    # 2. Find signals.csv (check root/data or app/data)
    csv_paths = ["data/signals.csv", "app/data/signals.csv", "../data/signals.csv", "data/signals.csv"]
    csv_path = next((p for p in csv_paths if os.path.exists(p)), None)
    
    if not csv_path:
        return f"Error: signals.csv not found at searched paths: {csv_paths}"

    try:
        df = pd.read_csv(csv_path)
        # Clean columns and search
        df['Date'] = df['Date'].astype(str).str.strip()
        
        # FIX: Ensure we are filtering by target_date
        result = df[df['Date'] == target_date]
        
        if result.empty:
            return f"No signal found in CSV for {target_date}. Please check the date format."
        
        signal = result.iloc[0]['Candle']
        
        # Determine Market Bias
        s_lower = signal.strip().lower()
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
# --- EXISTING TOOLS ---

# --- UPDATE THE TOOL CODE ---
@mcp.tool()
def mcp_get_trade_history(date: str = "today") -> str:
    """
    Queries the local SQLite memory.db to fetch executed dummy trades.
    Use this to verify if a trade was successfully logged.
    """
    if date.lower() == "today":
        date = datetime.now().strftime("%d-%m-%Y")

    # Absolute path detection
    current_dir = os.path.dirname(os.path.abspath(__file__))
    # Look exactly where the server file is
    db_path = os.path.join(current_dir, "memory.db")

    # DEBUG PRINT: This will show in your fastmcp terminal
    print(f"--- DEBUG: MCP is looking for DB at: {db_path} ---")
    
    if not db_path:
        return f"Error: memory.db not found. Searched in: {db_path}"

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check if the table exists first to avoid crashing
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

@mcp.tool()
def mcp_search_corporate_records(query: str) -> str:
    if not retriever:
        return "Error: Local FAISS index not found."
    try:
        docs = retriever.invoke(query)
        if not docs: return "No local records found."
        return "\n\n".join([getattr(d, "page_content", str(d)) for d in docs])
    except Exception as e:
        return f"Error searching local records: {e}"

# --- UPDATED WEB SEARCH TOOL WITH ASYNC PROGRESS ---
# --- CORRECTED WEB SEARCH TOOL ---
@mcp.tool()
async def mcp_search_the_web(query: str, ctx: Context) -> str: 
    """Searches the web for market data with real-time progress updates."""
    try:
        # Change 'status' to 'message'
        await ctx.report_progress(10, 100, message="Initializing Tavily search engine...")
        
        await ctx.report_progress(30, 100, message=f"Searching web for: {query}...")
        results = await web_search_tool.ainvoke({"query": query})
        
        await ctx.report_progress(70, 100, message="Analyzing search results...")
        
        if isinstance(results, list):
            output = "\n".join([res.get("content", str(res)) for res in results])
            await ctx.report_progress(100, 100, message="Web search complete.")
            return output
            
        return str(results)
    except Exception as e:
        # Ensure 'message' is used here as well
        await ctx.report_progress(100, 100, message="Search failed.")
        return f"Error searching the web: {e}"

@mcp.prompt()
def market_analyst_persona(question: str) -> str:
    return f"""You are a Market Analyst. 
    User Question: {question}
    Use your tools to provide a professional and detailed response."""

if __name__ == "__main__":
    import uvicorn
    # Access the underlying Starlette app from the FastMCP object
    # In some versions it's ._app, in others it's .app
    server_app = getattr(mcp, "app", getattr(mcp, "_app", None))
    
    if server_app:
        print("--- [MCP] Starting SSE Server on http://127.0.0.1:9001 ---")
        uvicorn.run(server_app, host="127.0.0.1", port=9001)
    else:
        # If we can't find the app, run standard (but update main.py to 8000)
        mcp.run(transport="sse")