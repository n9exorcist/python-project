import os
import asyncio
from dotenv import load_dotenv, find_dotenv
from langchain_groq import ChatGroq
from langgraph.prebuilt import create_react_agent
from langchain_mcp_adapters.client import MultiServerMCPClient

load_dotenv(find_dotenv())

llm = ChatGroq(
    model_name="llama-3.3-70b-versatile",
    temperature=0,
    api_key=os.getenv("GROQ_API_KEY")
)


async def _build_graph():
    mcp_client = MultiServerMCPClient({
        "market_tools": {
            "transport": "sse",
            "url": "http://127.0.0.1:8000/sse"
        }
    })

    mcp_tools = await mcp_client.get_tools()

    if not mcp_tools:
        raise RuntimeError("No MCP tools loaded. Please start mcp_server.py first.")

    system_prompt = """You are a Market Analyst.
Synthesize earthly corporate data with the divine wisdom of Market Cycles.
Always use your MCP tools to gather facts before answering.
If the question is about Accenture Q2 2026, ensure you mention $18.0B revenue or $22.1B bookings."""

    return create_react_agent(
        llm,
        tools=mcp_tools,
        prompt=system_prompt,
    )


graph = asyncio.run(_build_graph())