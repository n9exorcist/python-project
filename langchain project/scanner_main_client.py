import os
import asyncio
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain.agents import create_agent
from langchain_mcp_adapters.client import MultiServerMCPClient


load_dotenv()


async def scanner_main_client():
    groq_api_key = os.getenv("GROQ_API_KEY")
    if not groq_api_key:
        raise ValueError("GROQ_API_KEY not found in environment or .env file")

    llm = ChatGroq(
        model_name="llama-3.3-70b-versatile",
        temperature=0,
        api_key=groq_api_key
    )

    mcp_client = MultiServerMCPClient({
        "scanner_tools": {
            "transport": "sse",
            "url": "http://127.0.0.1:9002/sse"
        }
    })

    tools = await mcp_client.get_tools()

    agent = create_agent(
        model=llm,
        tools=tools,
        system_prompt=(
            "You are a stock scanner assistant. "
            "Use the available scanner tools to evaluate stocks and return a short, clear summary."
        )
    )

    query = "Scan INFY and RELIANCE for breakout setups"

    result = await agent.ainvoke({
        "messages": [
            {"role": "user", "content": query}
        ]
    })

    final_text = ""
    messages = result.get("messages", [])

    for message in reversed(messages):
        content = getattr(message, "content", None)
        if isinstance(content, str) and content.strip():
            final_text = content.strip()
            break

    print("\n=== FINAL ANSWER ===\n")
    print(final_text or "No final answer generated.")


if __name__ == "__main__":
    asyncio.run(scanner_main_client())