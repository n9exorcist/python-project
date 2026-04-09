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

# Robust CORS Configuration
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

# Ensure the faiss_index exists before loading
if os.path.exists("faiss_index"):
    vector_db = FAISS.load_local(
        "faiss_index",
        embeddings,
        allow_dangerous_deserialization=True
    )
    retriever = vector_db.as_retriever(search_kwargs={"k": 10})
else:
    print("WARNING: faiss_index not found. Run ingest.py first.")
    retriever = None

# --- 2. Graph State & Nodes ---
class GraphState(TypedDict):
    messages: Annotated[list, operator.add]
    context: str

def retrieve_node(state):
    print("--- RETRIEVING FROM LOCAL DB ---")
    last_message = state["messages"][-1]
    query = last_message.content if hasattr(last_message, "content") else str(last_message)
    
    if retriever is None:
        return {"context": "NOT_FOUND"}
        
    docs = retriever.invoke(query)
    if not docs:
        return {"context": "NOT_FOUND"}

    context_str = "\n".join([d.page_content for d in docs])
    return {"context": context_str}

def web_search_node(state):
    print("--- SEARCHING THE WEB ---")
    last_message = state["messages"][-1]
    query = last_message.content if hasattr(last_message, "content") else str(last_message)
    search_results = web_search_tool.invoke({"query": query})
    context_str = "\n".join([res["content"] for res in search_results])
    return {"context": context_str}

async def generate_node(state):
    print("--- GENERATING RESPONSE ---")
    context = state["context"]
    
    prompt = f"""You are a Market Analyst. 
Synthesize earthly corporate data with the divine wisdom of Market Cycles.

KNOWLEDGE BASE:
1. Corporate Context: {context}

INSTRUCTIONS:
- If context is about Accenture Q2 2026, reference $18.0B revenue or $22.1B bookings.
- If context is missing, look to the stars and the web search results.

Answer in a professional way:"""

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
    {"web_search": "web_search", "generate": "generate"},
)
workflow.add_edge("web_search", "generate")
workflow.add_edge("generate", END)

# --- 4. PERSISTENCE ---
DB_PATH = "memory.db"
THREAD_ID = "market_analyst_session"

@app.get("/chat/history")
async def get_history():
    config = {"configurable": {"thread_id": THREAD_ID}}
    async with AsyncSqliteSaver.from_conn_string(DB_PATH) as saver:
        app_graph = workflow.compile(checkpointer=saver)
        state_snapshot = await app_graph.aget_state(config)

        if not state_snapshot or not state_snapshot.values:
            return {"history": []}

        raw_messages = state_snapshot.values.get("messages", [])
        formatted = []
        
        for msg in raw_messages:
            # Safely determine the role
            # Check if it's a LangChain message object (has .type)
            if hasattr(msg, "type"):
                m_role = "user" if msg.type in ["human", "user"] else "ai"
                m_text = msg.content
            # Check if it's a tuple (role, content)
            elif isinstance(msg, tuple):
                m_role = "user" if msg[0] in ["human", "user"] else "ai"
                m_text = msg[1]
            # Fallback for raw strings or unexpected types
            else:
                m_role = "ai" # Default fallback
                m_text = str(msg)

            formatted.append({"role": m_role, "text": m_text})

        return {"history": formatted}

@app.delete("/chat/history")
async def clear_history():
    async with AsyncSqliteSaver.from_conn_string(DB_PATH) as saver:
        await saver.adelete_thread(THREAD_ID)
    return {"status": "ok", "message": "History cleared"}

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

# --- 5. INITIALIZATION & VISUALIZATION ---

# Define a startup function to print the graph safely
@app.on_event("startup")
async def startup_event():
    print("\n--- LANGGRAPH ARCHITECTURE ---")
    try:
        # Use a local compile just for the drawing
        temp_graph = workflow.compile()
        # Ensure grandalf is installed in your venv: pip install grandalf
        print(temp_graph.get_graph().draw_ascii())
    except Exception as e:
        print(f"Visualization Note: {e}. (Diagram failed, but server is RUNNING)")

# Ensure this is the ONLY uvicorn run block
if __name__ == "__main__":
    import uvicorn
    # Make sure you are running the right file name
    uvicorn.run(app, host="0.0.0.0", port=8000)