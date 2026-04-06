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
from langgraph.checkpoint.memory import MemorySaver

# 1. SEARCH FOR .ENV AUTOMATICALLY
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

# Verify keys are loaded
groq_key = os.getenv("GROQ_API_KEY")
gemini_key = os.getenv("GEMINI_API_KEY")

if not groq_key:
    raise ValueError("GROQ_API_KEY not found in .env! Check your folder structure.")

embeddings = GoogleGenerativeAIEmbeddings(
    model="models/gemini-embedding-001", 
    google_api_key=gemini_key
)

llm = ChatGroq(
    model_name="llama-3.3-70b-versatile",
    temperature=0,
    api_key=groq_key # Fixed parameter name for Groq initialization
)

web_search_tool = TavilySearchResults(k=3)

# Load FAISS Index
vector_db = FAISS.load_local(
    "faiss_index", 
    embeddings, 
    allow_dangerous_deserialization=True
)
retriever = vector_db.as_retriever(search_kwargs={"k": 10})

# --- 2. Graph State & Nodes ---

class GraphState(TypedDict):
    # Annotated[list, operator.add] ensures history is appended, not overwritten
    messages: Annotated[list, operator.add]
    context: str

def retrieve_node(state):
    print("--- RETRIEVING FROM LOCAL DB ---")
    # Get the latest message content
    last_message = state["messages"][-1]
    query = last_message.content if hasattr(last_message, 'content') else last_message
    
    docs = retriever.invoke(query)
    
    if not docs:
        return {"context": "NOT_FOUND"}
    
    context_str = "\n".join([d.page_content for d in docs])
    return {"context": context_str}

def web_search_node(state):
    print("--- SEARCHING THE WEB ---")
    last_message = state["messages"][-1]
    query = last_message.content if hasattr(last_message, 'content') else last_message
    
    search_results = web_search_tool.invoke({"query": query})
    context_str = "\n".join([res["content"] for res in search_results])
    return {"context": context_str}

async def generate_node(state):
    print("--- GENERATING RESPONSE ---")
    context = state["context"]
    
    # SAFE ACCESS: Check if message is an object or a tuple/string
    last_message = state["messages"][-1]
    if hasattr(last_message, 'content'):
        question = last_message.content
    elif isinstance(last_message, tuple):
        question = last_message[1]  # Get the text from ("user", "text")
    else:
        question = str(last_message)
    
    prompt = f"""You are an expert Financial Astrologer. 
    Use the provided "Parth Prophecies" context to answer the user's question. 
    
    If the context mentions months, dates, or planetary movements (like Nakshatras), explain them clearly. 
    If you don't find the specific month in the context, say "I don't see April in my notes," but then summarize what you DO see for the surrounding months.

    Context: {context}
    Question: {question}"""
    
    # We insert the system prompt at the beginning of the message history
    messages_with_context = [("system", prompt)] + state["messages"]
    
    response = await llm.ainvoke(messages_with_context)
    return {"messages": [response]}

# --- 3. Graph Construction & Routing ---

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
        "generate": "generate"
    }
)

workflow.add_edge("web_search", "generate")
workflow.add_edge("generate", END)

# PERSISTENCE: Add MemorySaver to enable chat history
memory = MemorySaver()
app_graph = workflow.compile(checkpointer=memory)

# --- 4. Streaming Endpoint ---

@app.post("/chat/stream")
async def chat_stream(request: Request):
    body = await request.json()
    user_message = body.get("message")
    
    # Define a thread_id for history persistence (constant for local testing)
    config = {"configurable": {"thread_id": "market_analyst_session"}}
    
    async def event_generator():
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