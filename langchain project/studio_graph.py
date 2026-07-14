"""
LangGraph Studio entry point.

Studio (and `langgraph dev`) loads the module-level `graph` below. Instead of
redefining the graph, this builds the SAME supervisor graph the app uses via
build_supervisor_graph() -- so Studio always reflects production, never the old
router/agent/validator graph.

langgraph.json already points at this file:  "agent": "./studio_graph.py:graph"
"""

import os
import asyncio

from dotenv import load_dotenv, find_dotenv
from langchain_groq import ChatGroq
from langchain_mcp_adapters.client import MultiServerMCPClient

from agents import build_supervisor_graph

load_dotenv(find_dotenv())

# Port 8000 matches your mcp_server.py logs.
MCP_SERVER_URL = "http://127.0.0.1:8000/sse"

llm = ChatGroq(
    model_name="llama-3.3-70b-versatile",
    temperature=0,
    api_key=os.getenv("GROQ_API_KEY"),
)


def _load_mcp_tools():
    """Load MCP tools synchronously at import time (Studio imports this module)."""
    mcp_client = MultiServerMCPClient({
        "market_tools": {"transport": "sse", "url": MCP_SERVER_URL}
    })
    try:
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        tools = loop.run_until_complete(mcp_client.get_tools())
        print(f"LOADED {len(tools)} MCP TOOLS (studio)")
        return tools
    except Exception as e:
        # Graph still renders with no tools; specialists fall back to the plain LLM.
        print(f"MCP TOOLS FAILED TO LOAD: {e}. Studio graph will render without tools.")
        return []


mcp_tools = _load_mcp_tools()

# Same graph the app builds. No checkpointer here -- `langgraph dev` provides its
# own persistence for Studio.
graph = build_supervisor_graph(llm, mcp_tools, checkpointer=None)