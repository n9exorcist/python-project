# Market Analyst Pro

A full-stack market research assistant built with **React + FastAPI + LangGraph + MCP**.  
It combines:

- **FAISS** for local corporate document search
- **Tavily** for live web search
- **SQLite** for conversation memory
- **Groq / Llama 3.3** for response generation
- **LangGraph Studio** for graph visualization and debugging

---

## Features

| Component  | Purpose                               |
| ---------- | ------------------------------------- |
| FAISS      | Search local corporate documents      |
| Tavily     | Fetch live web and market information |
| SQLite     | Store chat/session memory             |
| MCP Server | Expose tools to LangGraph/FastAPI     |
| LangGraph  | Orchestrate tool-calling workflow     |
| React      | Frontend chat UI                      |
| FastAPI    | Backend streaming/chat API            |

---

## Architecture

```text
React UI (3000)
    ↓
FastAPI Backend (8001)
    ↓
LangGraph Workflow
    ↓
MCP Server (9001)
    ↓
FAISS + Tavily + Market Tools

Langgraph flow

START
  ↓
router
  ↓
agent
  ↓
tools
  ↓
validator
  ↓
writer
  ↓
END

Project Stucture
langchain project/
│
├── main.py                 # FastAPI backend
├── mcp_server.py           # MCP server exposing tools
├── studio_graph.py         # LangGraph Studio graph
├── ingest.py               # FAISS ingestion pipeline
├── langgraph.json          # LangGraph Studio config
├── memory.db               # SQLite memory store
├── faiss_index/            # Local vector index
├── requirements.txt
├── .env
│
└── frontend/
    └── frontend/
        ├── src/
        ├── public/
        └── package.json


Prerequisites

Prerequisites
Make sure you have:

Python 3.11 or 3.12

Node.js 18+

npm

PowerShell or terminal

API keys for:

   Groq

   Tavily

   Gemini

   LangSmith (optional but recommended)

Environment setup

Environment Setup
Create a .env file in the project root:

text
GROQ_API_KEY=your_groq_key
TAVILY_API_KEY=your_tavily_key
GEMINI_API_KEY=your_gemini_key
LANGSMITH_API_KEY=your_langsmith_key
LANGCHAIN_PROJECT=Market-Analyst-Pro
LANGCHAIN_TRACING_V2=true



--

Remove-Item -Recurse -Force venv

python -m venv venv

.\venv\Scripts\activate

python -m pip install -r requirements.txt


--

Installation
1. Clone the repo
powershell
git clone <your-repo>
cd "C:\Users\narayanan.selvaraj\python project\langchain project"
2. Create virtual environment
powershell
python -m venv venv
.\venv\Scripts\activate
3. Install backend dependencies
powershell
pip install -r requirements.txt
If you are installing manually:

powershell
pip install langchain langgraph langchain-groq langchain-mcp-adapters
pip install langchain-community langchain-google-genai langchain-tavily
pip install fastapi uvicorn python-dotenv faiss-cpu
pip install "langgraph-cli[inmem]"
4. Install frontend dependencies
powershell
cd frontend/frontend
npm install
Load Local Documents into FAISS
Before starting the app, ingest your local PDFs/documents:

powershell
python ingest.py
This builds the faiss_index/ folder used by the MCP search tool.

Run the Full Stack
Open 4 terminals.

Terminal 1 — MCP Server
powershell
cd "C:\Users\narayanan.selvaraj\python project\langchain project"
.\venv\Scripts\activate
python mcp_server.py
Terminal 2 — FastAPI Backend
powershell
cd "C:\Users\narayanan.selvaraj\python project\langchain project"
.\venv\Scripts\activate
uvicorn main:app --host 127.0.0.1 --port 8001 --reload
Terminal 3 — LangGraph Studio
powershell
cd "C:\Users\narayanan.selvaraj\python project\langchain project"
.\venv\Scripts\activate
langgraph dev
Terminal 4 — React Frontend
powershell
cd "C:\Users\narayanan.selvaraj\python project\langchain project\frontend\frontend"
npm start


Example Prompts
Try these in the UI or Studio:

Tell me Accenture Q2 2026 results from internal records

Latest news about Accenture stock

Compare Accenture results with market expectations

Use local records and web results to summarize Accenture performance

What does the market cycle suggest for defense and metals?

```
