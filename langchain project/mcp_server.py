import os
import json
from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_community.tools.tavily_search import TavilySearchResults


load_dotenv()

mcp = FastMCP("MarketAnalystPro")

embeddings = GoogleGenerativeAIEmbeddings(
    model="models/gemini-embedding-001",
    google_api_key=os.getenv("GEMINI_API_KEY")
)

web_search_tool = TavilySearchResults(max_results=3)

if os.path.exists("faiss_index"):
    vector_db = FAISS.load_local(
        "faiss_index",
        embeddings,
        allow_dangerous_deserialization=True
    )
    retriever = vector_db.as_retriever(search_kwargs={"k": 5})
else:
    retriever = None


@mcp.resource("market://cycles")
def get_market_cycles() -> str:
    return (
        "Market Cycle Wisdom: Look to the stars and corporate transits. "
        "Defense sectors thrive under robotic advancement; Gold/Silver remain safe havens. "
        "Observe the current ratio for Gold-Silver for reversal signs."
    )


@mcp.tool()
def mcp_search_corporate_records(query: str) -> str:
    if not retriever:
        return "Error: Local FAISS index not found. Please run ingestion first."

    try:
        docs = retriever.invoke(query)
    except Exception as e:
        return f"Error searching local records: {e}"

    if not docs:
        return "No local records found for this query."

    return "\n\n".join([getattr(d, "page_content", str(d)) for d in docs])


@mcp.tool()
def mcp_search_the_web(query: str) -> str:
    try:
        results = web_search_tool.invoke({"query": query})
    except Exception as e:
        return f"Error searching the web: {e}"

    if isinstance(results, str):
        return results.strip() or "No web results returned."

    if isinstance(results, list):
        parts = []
        for res in results:
            if isinstance(res, dict):
                text = res.get("content") or res.get("snippet") or res.get("title") or json.dumps(res, default=str)
            else:
                text = str(res)
            parts.append(text)
        return "\n".join(parts) if parts else "No web results returned."

    return str(results)


@mcp.prompt()
def market_analyst_persona(question: str) -> str:
    return f"""You are a Market Analyst.
Synthesize earthly corporate data with the divine wisdom found in the 'Market Cycles'.

INSTRUCTIONS:
- If the question is about Accenture Q2 2026, ensure you mention $18.0B revenue or $22.1B bookings.
- If data is missing from local records, use the mcp_search_the_web tool.

User Question: {question}

Answer in a professional yet mystical tone:"""


if __name__ == "__main__":
    mcp.run(transport="sse")