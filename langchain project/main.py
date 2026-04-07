import os
import json
import operator
from typing import TypedDict, Annotated

from dotenv import load_dotenv, find_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware

from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_groq import ChatGroq
from langchain_community.vectorstores import FAISS
from langchain_community.tools.tavily_search import TavilySearchResults
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

# 1. LOAD ENVIRONMENT
load_dotenv(find_dotenv())

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 1. Tools & Models Setup ---
groq_key = os.getenv("GROQ_API_KEY")
gemini_key = os.getenv("GEMINI_API_KEY")

embeddings = GoogleGenerativeAIEmbeddings(
    model="models/gemini-embedding-001",
    google_api_key=gemini_key
)

llm = ChatGroq(
    model_name="llama-3.3-70b-versatile",
    temperature=0,
    api_key=groq_key
)

web_search_tool = TavilySearchResults(k=3)

vector_db = FAISS.load_local(
    "faiss_index",
    embeddings,
    allow_dangerous_deserialization=True
)
retriever = vector_db.as_retriever(search_kwargs={"k": 10})

# --- 2. Graph State & Nodes ---
class GraphState(TypedDict):
    messages: Annotated[list, operator.add]
    context: str

def retrieve_node(state):
    print("--- RETRIEVING FROM LOCAL DB ---")
    last_message = state["messages"][-1]
    query = last_message.content if hasattr(last_message, "content") else last_message[1] if isinstance(last_message, tuple) else str(last_message)
    docs = retriever.invoke(query)

    if not docs:
        return {"context": "NOT_FOUND"}

    context_str = "\n".join([d.page_content for d in docs])
    return {"context": context_str}

def web_search_node(state):
    print("--- SEARCHING THE WEB ---")
    last_message = state["messages"][-1]
    query = last_message.content if hasattr(last_message, "content") else last_message[1] if isinstance(last_message, tuple) else str(last_message)
    search_results = web_search_tool.invoke({"query": query})
    context_str = "\n".join([res["content"] for res in search_results])
    return {"context": context_str}

async def generate_node(state):
    print("--- GENERATING RESPONSE ---")
    context = state["context"]
    last_message = state["messages"][-1]

    if hasattr(last_message, "content"):
        question = last_message.content
    elif isinstance(last_message, tuple):
        question = last_message[1]
    else:
        question = str(last_message)

    prompt = f"""You are an expert Financial Astrologer.
Use the provided "Parth Prophecies" context to answer the user's question.
Context: {context}
Question: {question}"""

    messages_with_context = [("system", prompt)] + state["messages"]
    response = await llm.ainvoke(messages_with_context)
    return {"messages": [response]}

# --- 3. Graph Construction ---
def router_logic(state):
    if state["context"] == "NOT_FOUND":
        return "web_search"
    return "generate"

workflow = StateGraph(GraphState)
workflow.add_node("retrieve", retrieve_node)
workflow.add_node("web_search", web_search_node)
workflow.add_node("generate", generate_node)
workflow.set_entry_point("retrieve")
workflow.add_conditional_edges(
    "retrieve",
    router_logic,
    {
        "web_search": "web_search",
        "generate": "generate",
    },
)
workflow.add_edge("web_search", "generate")
workflow.add_edge("generate", END)

# --- 4. PERSISTENCE (Async SQLite) ---
DB_PATH = "memory.db"
THREAD_ID = "market_analyst_session"

@app.get("/chat/history")
async def get_history():
    config = {"configurable": {"thread_id": THREAD_ID}}

    async with AsyncSqliteSaver.from_conn_string(DB_PATH) as saver:
        app_graph = workflow.compile(checkpointer=saver)
        state_snapshot = await app_graph.aget_state(config)

        if not state_snapshot:
            return {"history": []}

        values = state_snapshot.values or {}
        raw_messages = values.get("messages", [])

        formatted = []
        for msg in raw_messages:
            m_type = getattr(msg, "type", None) or getattr(msg, "role", None)

            if m_type in ["human", "user"]:
                formatted.append({
                    "role": "user",
                    "text": getattr(msg, "content", str(msg))
                })
            elif m_type in ["ai", "assistant"]:
                formatted.append({
                    "role": "ai",
                    "text": getattr(msg, "content", str(msg))
                })

        return {"history": formatted}

@app.post("/chat/stream")
async def chat_stream(request: Request):
    body = await request.json()
    user_message = body.get("message")
    config = {"configurable": {"thread_id": THREAD_ID}}

    async def event_generator():
        async with AsyncSqliteSaver.from_conn_string(DB_PATH) as saver:
            app_graph = workflow.compile(checkpointer=saver)

            async for event in app_graph.astream_events(
                {"messages": [("user", user_message)]},
                config,
                version="v1"
            ):
                if event["event"] == "on_chat_model_stream":
                    chunk = event["data"]["chunk"].content
                    if chunk:
                        yield f"data: {json.dumps({'text': chunk})}\n\n"

        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")