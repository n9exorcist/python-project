# Market Analyst MCP + LangGraph + FastAPI

A Python-based market analyst project that combines a local FAISS knowledge base, an MCP server, LangGraph orchestration, and a FastAPI streaming API. It can answer questions using local corporate records, web search, or both, while also supporting a frontend and LangGraph Studio for development.

---

## What this project does

This project has four main parts:

- `ingest.py` builds a local FAISS index from files in `./data` and a few manual seed documents.
- `mcp_server.py` exposes MCP tools for searching local corporate records and the web.
- `main.py` runs a FastAPI app that uses LangGraph + Groq to route, validate, and write final answers.
- `studio_graph.py` exposes the same graph flow for use with `langgraph dev`.

---

## Features

- Local retrieval using FAISS + Gemini embeddings
- MCP tools for local corporate search and web search
- LangGraph routing for local, web, hybrid, and general queries
- FastAPI streaming endpoint for chat responses
- SQLite-backed conversation memory via LangGraph checkpointing
- Optional LangGraph Studio support for graph debugging and development
- Frontend-friendly execution flow

---

## Architecture

```text
Frontend (npm start)
    ↓
FastAPI app (main.py) → http://127.0.0.1:8001
    ↓
LangGraph app_graph
    ↓
MultiServerMCPClient → http://127.0.0.1:9001/sse
    ↓
mcp_server.py
    ↓
FAISS local records + Tavily web search

Optional:
langgraph dev
    ↓
studio_graph.py
    ↓
Same MCP server at http://127.0.0.1:9001/sse
```

---

## Project files

```text
.
├── data/                    # PDF / CSV / XLSX / XLS files for ingestion
├── faiss_index/             # Generated FAISS index after running ingest.py
├── ingest.py                # Builds FAISS from local files + manual docs
├── main.py                  # FastAPI app with LangGraph workflow
├── mcp_server.py            # MCP server exposing search tools
├── studio_graph.py          # Graph entry for LangGraph Studio
├── memory.db                # SQLite checkpoint store created at runtime
├── .env                     # GEMINI_API_KEY, GROQ_API_KEY, TAVILY_API_KEY
└── README.md
```

---

## Prerequisites

- Python 3.11+
- Node.js and npm for the frontend
- A virtual environment
- Gemini API key for embeddings
- Groq API key for the LLM
- Tavily API key for web search

Install core packages with:

```bash
pip install fastapi uvicorn python-dotenv pandas openpyxl
pip install langchain langgraph langchain-community langchain-core
pip install langchain-groq langchain-google-genai langchain-mcp-adapters
pip install faiss-cpu fastmcp tavily-python pypdf aiosqlite
```

If your frontend is separate, install its dependencies inside the frontend folder:

```bash
npm install
```

---

## Environment variables

Create a `.env` file in the project root:

```env
GEMINI_API_KEY=your_gemini_api_key
GROQ_API_KEY=your_groq_api_key
TAVILY_API_KEY=your_tavily_api_key
```

---

## Data ingestion

Place your documents in the `./data` folder.

Supported file types:

- `.pdf`
- `.csv`
- `.xlsx`
- `.xls`

Then build the FAISS index:

```bash
python ingest.py
```

What `ingest.py` does:

- Creates `./data` if it does not exist
- Loads PDF, CSV, and Excel files
- Converts Excel rows into LangChain `Document` objects
- Adds built-in manual documents
- Splits content into chunks
- Generates Gemini embeddings
- Saves the vector store to `faiss_index/`

Run this again whenever your local source data changes.

---

## MCP server

The MCP server exposes:

- `mcp_search_corporate_records(query: str)`
- `mcp_search_the_web(query: str)`
- `market://cycles` resource
- `market_analyst_persona(question: str)` prompt

### Run the MCP server

Use port `9001` because both `main.py` and `studio_graph.py` connect to this URL:

```bash
fastmcp run mcp_server.py --transport sse --host 127.0.0.1 --port 9001
```

SSE endpoint:

```text
http://127.0.0.1:9001/sse
```

Important:

- Run `python ingest.py` first so `faiss_index/` exists.
- If `faiss_index/` is missing, local corporate search will fail.

---

## FastAPI app

`main.py` creates a FastAPI service with a LangGraph workflow.

### What it does

- Routes the query as `local`, `web`, `hybrid`, or `general`
- Invokes Groq with bound MCP tools
- Validates weak retrieval results
- Retries once if tool output is weak
- Writes a final user-facing answer
- Streams the final answer over Server-Sent Events
- Stores thread state in SQLite using `AsyncSqliteSaver`

### Run the FastAPI app

```bash
uvicorn main:app --host 127.0.0.1 --port 8001 --reload
```

API endpoints:

| Endpoint        | Method | Purpose                  |
| --------------- | ------ | ------------------------ |
| `/chat/stream`  | POST   | Stream final answer text |
| `/chat/history` | GET    | Return chat history      |
| `/chat/history` | DELETE | Start a fresh thread     |

Example request body for `/chat/stream`:

```json
{
  "message": "What are the latest updates on Accenture Q2 FY26?"
}
```

---

## LangGraph Studio

`studio_graph.py` is for LangGraph Studio and local graph debugging.

### Run LangGraph Studio

Make sure the MCP server is already running on port `9001`, then run:

```bash
langgraph dev
```

This lets you inspect and test the graph defined in `studio_graph.py`.

---

## Frontend

If your React frontend is inside `frontend/frontend`, start it first:

```bash
cd frontend/frontend
npm start
```

This typically runs the UI before starting the backend services.

---

## Correct execution order

Use this order for your current setup.

### 1) Start the frontend

```bash
cd frontend/frontend
npm start
```

### 2) Start the MCP server

```bash
fastmcp run mcp_server.py --transport sse --host 127.0.0.1 --port 9001
```

### 3) Start the FastAPI app

```bash
uvicorn main:app --host 127.0.0.1 --port 8001 --reload
```

### 4) Start LangGraph Studio (optional)

```bash
langgraph dev
```

### Full recommended flow

If local documents changed:

```bash
python ingest.py
```

Then:

```bash
cd frontend/frontend
npm start
```

In a new terminal:

```bash
fastmcp run mcp_server.py --transport sse --host 127.0.0.1 --port 9001
```

In another new terminal:

```bash
uvicorn main:app --host 127.0.0.1 --port 8001 --reload
```

Optional extra terminal:

```bash
langgraph dev
```

---

## Why port 9001 matters

Your code in both `main.py` and `studio_graph.py` connects to:

```python
"url": "http://127.0.0.1:9001/sse"
```

So the MCP server must run on port `9001`, not `9002`, unless you also update the client code.

---

## How routing works

The router checks the latest user message and sets one of these routes:

- `local` for terms like `internal`, `records`, `document`, `faiss`, `local`
- `web` for terms like `latest`, `news`, `today`, `current`, `market reaction`, `web`
- `hybrid` for terms like `compare`, `versus`, `vs`, `both`, `internal and web`
- `general` for everything else

This route influences how the LLM is instructed to use MCP tools.

---

## Troubleshooting

### `No MCP tools loaded. Please start mcp_server.py first.`

- Confirm the MCP server is running
- Confirm it is running on `127.0.0.1:9001`
- Confirm the `/sse` endpoint is reachable

### `Error: Local FAISS index not found. Please run ingestion first.`

- Run:

```bash
python ingest.py
```

### `401` or auth-related API errors

- Check `.env`
- Verify `GEMINI_API_KEY`, `GROQ_API_KEY`, and `TAVILY_API_KEY`

### No useful local results

- Make sure your files are actually inside `./data`
- Re-run `python ingest.py`
- Check whether the query text matches your ingested content

### FastAPI starts but chat returns server errors

- Make sure the MCP server is already running before `uvicorn`
- Check that `memory.db` can be created in the project folder
- Check terminal logs for MCP connection issues

### `langgraph dev` fails to use tools

- Confirm `mcp_server.py` is already running
- Confirm `studio_graph.py` still points to `http://127.0.0.1:9001/sse`

---

## Example developer workflow

### Update local knowledge base

```bash
python ingest.py
```

### Start services

Terminal 1:

```bash
cd frontend/frontend
npm start
```

Terminal 2:

```bash
fastmcp run mcp_server.py --transport sse --host 127.0.0.1 --port 9001
```

Terminal 3:

```bash
uvicorn main:app --host 127.0.0.1 --port 8001 --reload
```

Terminal 4 (optional):

```bash
langgraph dev
```

---

## Notes

- `langgraph dev` is optional for development and debugging.
- `main.py` is the app you should use for your running backend service.
- Re-run `ingest.py` whenever documents in `./data` change.
- If you want to use a different MCP port, update both `main.py` and `studio_graph.py`.

--

EXECUTION:

PS C:\Users\narayanan.selvaraj\python project\langchain project\frontend\frontend> npm start

(venv) PS C:\Users\narayanan.selvaraj\python project\langchain project> python mcp_server.py

(venv) PS C:\Users\narayanan.selvaraj\python project\langchain project> uvicorn main:app --host 127.0.0.1 --port 8001 --reload

(venv) PS C:\Users\narayanan.selvaraj\python project\langchain project> langgraph dev

---

1. Test: FAISS + Manual Docs (local route)
   The router looks for: "internal", "records", "document", "faiss", "local"

Prompt A (Testing personal data): > "According to our internal records, who is Narayanan Selvaraj and what does he specialize in?"

Expected: It should route to local, call mcp_search_corporate_records, find the manual doc, and tell you he is a Team Lead at Accenture specializing in Full-Stack LLM and ReactJS.

Prompt B (Testing corporate data):

"What do the local documents say about Accenture's dividend and Julie Sweet?"

Expected: It should retrieve the manual docs mentioning the $1.63 dividend and Julie Sweet's note on AI-driven growth.

Prompt C (Testing commodities/defense):

"Check the faiss index for information regarding copper and the defense sector."

Expected: It should pull the sentences about copper being conductive and defense relying on robotics.

2. Test: Web Search / Tavily (web route)
   The router looks for: "latest", "news", "today", "current", "market reaction", "web"

Prompt A (Live data fetch): > "What is the latest news today regarding the S&P 500?"

Expected: It should route to web, call mcp_search_the_web, hit the Tavily API, and stream back real-time news from today.

Prompt B (Live company data):

"Search the web for the current market reaction to Nvidia's stock."

Expected: It should fetch live internet data about Nvidia.

3. Test: Hybrid Routing (Comparing FAISS vs. Web)
   The router looks for: "compare", "versus", "vs", "both", "internal and web"

Prompt A (The Ultimate E2E Test):

"Compare our internal records regarding Accenture's Q2 FY26 revenue versus the latest news about Accenture's stock performance today."

Expected: The router should set the route to hybrid. The LLM should make two tool calls: one to FAISS for the $18.0B revenue, and one to Tavily for today's stock news, then synthesize them together.

4. Test: MCP Resource (market://cycles)
   Because you instructed the LLM to use "the Market Cycles" in the system prompt, you can prompt it to fetch this specific resource.

Prompt A:

"Read the Market Cycles resource. What does the market cycles say about the Gold-Silver ratio and the defense sector?"

Expected: The LLM should request to read the market://cycles URI from the MCP server and quote the text about looking to the stars and the current ratio for reversal signs.

5. Test: The Persona & System Rules
   Testing the hardcoded instructions in your market_analyst_persona and agent_node system prompts.

Prompt A:

"Tell me about Accenture Q2 2026."

Expected: Even without specifying "internal records", the system prompt rules mandate that it mentions "$18.0B revenue or $22.1B bookings". It should answer in a "professional yet mystical tone."

6. Test: The Validator Node (Self-Correction/Retry)
   Testing if your LangGraph graph successfully catches bad retrievals and loops back.

Prompt A:

"Search our internal records for the recipe to bake a chocolate cake."

Expected: The agent will try to search FAISS for a cake recipe. FAISS will return nothing (or hallucinated garbage). Your validator_node will detect "No local records found" in the tool output, set the status to retry, and loop back to the agent. It will likely end up gracefully telling you that the corporate records do not contain baking recipes.
