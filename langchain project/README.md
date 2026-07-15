# Market Analyst MCP + LangGraph + FastAPI

A Python-based market analyst project that combines a local FAISS knowledge base, an MCP server, LangGraph orchestration, and a FastAPI streaming API. It can answer questions using local corporate records, web search, or both, while also supporting a frontend and LangGraph Studio for development.

---

## What this project does

This project has four main parts:

- `ingest.py` builds a local FAISS index from files in `./data` and a few manual seed documents.
- `mcp_server.py` exposes MCP tools for searching local corporate records and the web.
- `main.py` runs a FastAPI app that uses LangGraph + Groq to route, validate, and write final answers.
- `studio_graph.py` exposes the same graph flow for use with `langgraph dev`.
- (venv) PS C:\Users\narayanan.selvaraj\python project> codex

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

```

PS C:\Users\narayanan.selvaraj\python project> cd '.\langchain project\'
PS C:\Users\narayanan.selvaraj\python project\langchain project> uv venv --python 3.12
Using CPython 3.12.0 interpreter at: C:\Users\narayanan.selvaraj\AppData\Local\Programs\Python\Python312\python.exe
Creating virtual environment at: .venv
Activate with: .venv\Scripts\activate
PS C:\Users\narayanan.selvaraj\python project\langchain project> .\.venv\Scripts\activate
(langchain project) PS C:\Users\narayanan.selvaraj\python project\langchain project> python -c "import sys; print(sys.executable)"
C:\Users\narayanan.selvaraj\python project\langchain project\.venv\Scripts\python.exe
(langchain project) PS C:\Users\narayanan.selvaraj\python project\langchain project> uv pip install -r requirements.txt
Resolved 244 packages in 14.00s
Installed 244 packages in 53.51s
 + aiofile==3.9.0
 + aiofiles==25.1.0
 + aiohappyeyeballs==2.6.1
 + aiohttp==3.13.5
 + aiosignal==1.4.0
 + aiosqlite==0.22.1
 + annotated-doc==0.0.4
 + annotated-types==0.7.0
 + anyio==4.13.0
 + appdirs==1.4.4
 + apscheduler==3.11.2
 + attrs==26.1.0
 + authlib==1.6.9
 + beartype==0.22.9
 + beautifulsoup4==4.14.3
 + bidict==0.23.1
 + blis==1.3.3
 + blockbuster==1.5.26
 + breeze-connect==1.0.69
 + cachetools==7.0.5
 + caio==0.9.25
 + catalogue==2.0.10
 + certifi==2026.2.25
 + cffi==2.0.0
 + charset-normalizer==3.4.7
 + click==8.4.2
 + cloudpathlib==0.23.0
 + cloudpickle==3.1.2
 + colorama==0.4.6
 + confection==1.3.3
 + croniter==6.2.2
 + cryptography==46.0.6
 + curl-cffi==0.15.0
 + cyclopts==4.10.2
 + cymem==2.0.13
 + dataclasses-json==0.6.7
 + datasets==5.0.0
 + dill==0.4.1
 + diskcache==5.6.3
 + distro==1.9.0
 + dnspython==2.8.0
 + docstring-parser==0.17.0
 + docutils==0.22.4
 + email-validator==2.3.0
 + emoji==2.15.0
 + et-xmlfile==2.0.0
 + exceptiongroup==1.3.1
 + faiss-cpu==1.13.2
 + fastapi==0.135.3
 + fastmcp==3.2.3
 + filelock==3.25.2
 + filetype==1.2.0
 + forbiddenfruit==0.1.4
 + frozendict==2.4.7
 + frozenlist==1.8.0
 + fsspec==2026.4.0
 + google-auth==2.49.1
 + google-genai==1.70.0
 + googleapis-common-protos==1.74.0
 + grandalf==0.8
 + greenlet==3.3.2
 + groq==0.37.1
 + grpcio==1.78.0
 + grpcio-health-checking==1.78.0
 + grpcio-tools==1.78.0
 + h11==0.16.0
 + hf-xet==1.5.1
 + html5lib==1.1
 + httpcore==1.0.9
 + httpx==0.28.1
 + httpx-sse==0.4.3
 + huggingface-hub==1.23.0
 + idna==3.11
 + importlib-metadata==8.7.1
 + installer==0.7.0
 + instructor==1.15.4
 + jaraco-classes==3.4.0
 + jaraco-context==6.1.2
 + jaraco-functools==4.4.0
 + jinja2==3.1.6
 + jiter==0.14.0
 + jsonpatch==1.33
 + jsonpointer==3.1.1
 + jsonref==1.1.0
 + jsonschema==4.26.0
 + jsonschema-path==0.4.5
 + jsonschema-rs==0.44.1
 + jsonschema-specifications==2025.9.1
 + keyring==25.7.0
 + langchain==1.2.15
 + langchain-classic==1.0.3
 + langchain-community==0.4.1
 + langchain-core==1.4.9
 + langchain-google-genai==4.2.1
 + langchain-groq==1.1.2
 + langchain-mcp-adapters==0.2.2
 + langchain-openai==1.3.5
 + langchain-protocol==0.0.18
 + langchain-tavily==0.2.17
 + langchain-text-splitters==1.1.1
 + langdetect==1.0.9
 + langgraph==1.1.6
 + langgraph-api==0.7.98
 + langgraph-checkpoint==4.0.1
 + langgraph-checkpoint-postgres==3.0.5
 + langgraph-checkpoint-sqlite==3.0.3
 + langgraph-cli==0.4.21
 + langgraph-prebuilt==1.0.9
 + langgraph-runtime-inmem==0.27.3
 + langgraph-sdk==0.3.12
 + langsmith==0.7.25
 + llvmlite==0.47.0
 + lxml==6.0.2
 + markdown-it-py==4.0.0
 + markupsafe==3.0.3
 + marshmallow==3.26.2
 + mcp==1.27.0
 + mdurl==0.1.2
 + more-itertools==11.0.2
 + motor==3.7.1
 + multidict==6.7.1
 + multiprocess==0.70.19
 + multitasking==0.0.12
 + murmurhash==1.0.15
 + mypy-extensions==1.1.0
 + nest-asyncio==1.6.0
 + networkx==3.6.1
 + numba==0.65.0
 + numpy==2.4.4
 + olefile==0.47
 + openai==2.45.0
 + openapi-pydantic==0.5.1
 + openpyxl==3.1.5
 + opentelemetry-api==1.40.0
 + opentelemetry-exporter-otlp-proto-common==1.40.0
 + opentelemetry-exporter-otlp-proto-http==1.40.0
 + opentelemetry-proto==1.40.0
 + opentelemetry-sdk==1.40.0
 + opentelemetry-semantic-conventions==0.61b0
 + orjson==3.11.8
 + ormsgpack==1.12.2
 + packaging==26.0
 + pandas==3.0.2
 + pandas-ta-classic==0.4.47
 + pathable==0.5.0
 + pathspec==1.0.4
 + peewee==4.0.4
 + pillow==12.3.0
 + platformdirs==4.9.6
 + playwright==1.58.0
 + preshed==3.0.13
 + propcache==0.4.1
 + protobuf==6.33.6
 + psutil==7.2.2
 + psycopg==3.3.3
 + psycopg-binary==3.3.3
 + psycopg-pool==3.3.0
 + py-key-value-aio==0.4.4
 + pyarrow==25.0.0
 + pyasn1==0.6.3
 + pyasn1-modules==0.4.2
 + pycparser==3.0
 + pydantic==2.12.5
 + pydantic-core==2.41.5
 + pydantic-settings==2.13.1
 + pyee==13.0.1
 + pygments==2.20.0
 + pyjwt==2.12.1
 + pymongo==4.16.0
 + pyotp==2.9.0
 + pyparsing==3.3.2
 + pypdf==6.9.2
 + pypdfium2==5.6.0
 + pyperclip==1.11.0
 + python-dateutil==2.9.0.post0
 + python-dotenv==1.2.2
 + python-engineio==4.13.1
 + python-iso639==2026.1.31
 + python-magic==0.4.27
 + python-multipart==0.0.24
 + python-oxmsg==0.0.2
 + python-socketio==5.16.1
 + pytz==2026.1.post1
 + pywin32==312
 + pywin32-ctypes==0.2.3
 + pyyaml==6.0.3
 + ragas==0.4.3
 + rapidfuzz==3.14.3
 + referencing==0.37.0
 + regex==2026.4.4
 + requests==2.33.1
 + requests-toolbelt==1.0.0
 + rich==14.3.3
 + rich-rst==1.3.2
 + rpds-py==0.30.0
 + scikit-network==0.33.5
 + scipy==1.18.0
 + setuptools==82.0.1
 + shellingham==1.5.4
 + simple-websocket==1.1.0
 + six==1.17.0
 + smart-open==7.5.1
 + sniffio==1.3.1
 + soupsieve==2.8.3
 + spacy==3.8.14
 + spacy-legacy==3.0.12
 + spacy-loggers==1.0.5
 + sqlalchemy==2.0.49
 + sqlite-vec==0.1.9
 + srsly==2.5.3
 + sse-starlette==3.3.4
 + starlette==1.0.0
 + structlog==25.5.0
 + tavily-python==0.7.23
 + tenacity==9.1.4
 + thinc==8.3.13
 + tiktoken==0.12.0
 + tqdm==4.67.3
 + truststore==0.10.4
 + typer==0.24.1
 + typing-extensions==4.15.0
 + typing-inspect==0.9.0
 + typing-inspection==0.4.2
 + tzdata==2026.1
 + tzlocal==5.3.1
 + uncalled-for==0.3.1
 + unstructured==0.22.16
 + unstructured-client==0.43.2
 + urllib3==2.6.3
 + uuid-utils==0.14.1
 + uvicorn==0.43.0
 + wasabi==1.1.3
 + watchfiles==1.1.1
 + weasel==1.0.0
 + webencodings==0.5.1
 + websocket-client==1.9.0
 + websockets==16.0
 + wrapt==2.1.2
 + wsproto==1.3.2
 + xxhash==3.6.0
 + yarl==1.23.0
 + yfinance==1.2.1
 + zipp==3.23.0
 + zstandard==0.25.0
(langchain project) PS C:\Users\narayanan.selvaraj\python project\langchain project> uv pip install ragas
Checked 1 package in 1.30s
(langchain project) PS C:\Users\narayanan.selvaraj\python project\langchain project> uv pip install pynacl
Resolved 3 packages in 1.53s
Installed 1 package in 422ms
 + pynacl==1.6.2
(langchain project) PS C:\Users\narayanan.selvaraj\python project\langchain project> python mcp_server.py
C:\Users\narayanan.selvaraj\python project\langchain project\mcp_server.py:36: LangChainDeprecationWarning: The class `TavilySearchResults` was deprecated in LangChain 0.3.25 and will be removed in 1.0. An updated version of the class exists in the `langchain-tavily package and should be used instead. To use it run `pip install -U `langchain-tavily` and import as `from `langchain_tavily import TavilySearch``.
  web_search_tool = TavilySearchResults(max_results=3)
--- WARNING: FAISS index not found in ['C:\\Users\\narayanan.selvaraj\\python project\\langchain project\\faiss_index', 'C:\\Users\\narayanan.selvaraj\\python project\\langchain project\\app\\faiss_index'] ---
--- [MCP] Starting SSE Server on http://127.0.0.1:8000 ---
INFO:     Started server process [16712]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     127.0.0.1:63567 - "GET /sse HTTP/1.1" 200 OK
INFO:     127.0.0.1:63568 - "POST /messages/?session_id=7dd978c885c443179a136c80cc4cf23a HTTP/1.1" 202 Accepted
INFO:     127.0.0.1:63568 - "POST /messages/?session_id=7dd978c885c443179a136c80cc4cf23a HTTP/1.1" 202 Accepted
INFO:     127.0.0.1:63568 - "POST /messages/?session_id=7dd978c885c443179a136c80cc4cf23a HTTP/1.1" 202 Accepted
[07/15/26 15:38:10] INFO     Processing request of type ListToolsRequest
```

```
PS C:\Users\narayanan.selvaraj\python project> cd '.\langchain project\'
PS C:\Users\narayanan.selvaraj\python project\langchain project> .\.venv\Scripts\activate
(langchain project) PS C:\Users\narayanan.selvaraj\python project\langchain project> python ingest.py
Starting ingestion process...
DATA_PATH  : C:\Users\narayanan.selvaraj\python project\data
FAISS_OUT  : C:\Users\narayanan.selvaraj\python project\langchain project\faiss_index
  loaded accentures-second-quarter-fiscal-2026-earnings-press-release.pdf  (v:afe56fa6fd7c)
  loaded signals.csv  (v:2146590d825f)
43 documents -> 67 chunks (provenance stamped)
Waiting for rate limit...
Waiting for rate limit...
```

### Start services

Terminal 1:

```bash
cd frontend/frontend
npm start
```

Terminal 2:

```
(langchain project) PS C:\Users\narayanan.selvaraj\python project\langchain project> python mcp_server.py
```

Terminal 3:

```(langchain project) PS C:\Users\narayanan.selvaraj\python project\langchain project> python main.py

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

(venv) PS C:\Users\narayanan.selvaraj\python project\langchain project> python mcp_server.py

(venv) PS C:\Users\narayanan.selvaraj\python project\langchain project> python main.py

PS C:\Users\narayanan.selvaraj\python project\langchain project\frontend\frontend> npm start

(venv) PS C:\Users\narayanan.selvaraj\python project\langchain project> langgraph dev

---

1. Test: FAISS + Manual Docs (local route)
   The router looks for: "internal", "records", "document", "faiss", "local"

Prompt A (Testing personal data): > "According to our internal records, who is Narayanan Selvaraj and what does he specialize in?"

{
"messages": [
{
"role": "user",
"content": "According to our internal records, who is Narayanan Selvaraj and what does he specialize in?"
}
]
}

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

---

# Market Analyst Agent — Production-Hardened Agentic AI

A multi-agent LangGraph system that answers market questions from internal corporate
records and live web intelligence, with the engineering layers that make an agent safe
to rely on: evaluation, guardrails, human-in-the-loop approval, multi-agent supervision,
reflection, and observability.

The reasoning engine is fully decoupled from its tools (via MCP), so tools can be swapped
without touching the graph.

---

## Architecture

```
React + Redux (SSE client)
        │
FastAPI · SSE streaming  (port 8001)          ── app.state.app_graph
        │
LangGraph Supervisor Graph  (the reasoning engine)
   input_guard → supervisor → { researcher | web | trading } → tools → writer → reflect
        │                                                                        │
   AsyncSqliteSaver (cross-session memory)                                     END
        │
MCP Server (port 8000) — tools decoupled from reasoning
   corporate_records (FAISS) · web_search (Tavily) · signals_csv · trade_history (SQLite)

Separate scheduler path:
   APScheduler → signal → Telegram Human Approval (HITL) → execution
```

- **LLM:** Groq `llama-3.3-70b-versatile`
- **Embeddings / RAGAS judge:** Google Gemini
- **Vector store:** FAISS · **Web search:** Tavily

---

## What's built, and how it's verified

| Capability                 | Where                                                                                          | How it was verified                                                                                                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Evaluation**             | `evals/dataset.json`, `evals/run_evals.py` (Groq judge), `evals/run_ragas.py` (Gemini + RAGAS) | 20-case suite scored on faithfulness / context / tool-use; produced a baseline scorecard and caught a real prompt-injection leak on the first run                                    |
| **Guardrails**             | `guardrails.py`                                                                                | Input layer blocks injection / exfil before the model; output layer redacts secrets & PII. `safety_prompt_leak` eval flipped **FAIL → PASS** after wiring                            |
| **Human-in-the-loop**      | `app/core/trade_approval.py`, `trading.py`                                                     | Scheduler pauses and sends Telegram Approve/Reject buttons, holds until a response; auth + execution happen only after approval                                                      |
| **Multi-agent supervisor** | `agents.py`                                                                                    | Supervisor delegates to focused specialists. Verified in LangGraph Studio: `input_guard → supervisor (next_agent: researcher) → researcher` routed correctly                         |
| **Reflection + tool-cap**  | `agents.py`                                                                                    | Specialist tool budget (`MAX_TOOL_ROUNDS`) + writer self-critique. Studio trace confirmed **one** `mcp_search_corporate_records` call (down from 4) with the correct record returned |
| **Observability**          | `observability.py`                                                                             | Per-request tokens / latency / step counts + daily token-budget guard, logged to console and `logs/metrics.jsonl`                                                                    |

---

## Project structure

```
main.py                     # startup orchestration (builds graph, scheduler, MCP)
agents.py                   # supervisor graph + specialists + reflection (build_supervisor_graph)
guardrails.py               # input injection/exfil guard + output secret/PII sanitizer
observability.py            # metrics callback + daily token-budget guard
routes.py                   # FastAPI endpoints (/chat/stream, /chat/history, /chat/debug_state)
trading.py                  # trading services + scheduled daily job (with HITL)
studio_graph.py             # LangGraph Studio entry — reuses build_supervisor_graph
mcp_server.py               # MCP tool server (FAISS RAG, Tavily, signals, trade history)
app/core/trade_approval.py  # Telegram approve/reject + long-poll hold
evals/
  dataset.json              # 20-case test suite (shared by both runners)
  run_evals.py              # lightweight harness, Groq-as-judge
  run_ragas.py              # rigorous RAGAS metrics, Gemini-as-judge
logs/
  metrics.jsonl             # per-request observability records
```

---

## Running it

Three processes:

```bash
# 1. MCP tool server (port 8000)  — start FIRST
python mcp_server.py

# 2. FastAPI backend (port 8001)
python main.py

# 3. Frontend, or use the built-in API docs at http://127.0.0.1:8001/docs
```

**Evaluate** (server must be running):

```bash
python evals/run_ragas.py --sleep 4        # rigorous, Gemini-judged (spares Groq budget)
python evals/run_evals.py                   # quick, Groq-judged smoke test
```

**Inspect the graph** in LangGraph Studio:

```bash
langgraph dev
```

---

## Environment (`.env`)

```
GROQ_API_KEY=...
GEMINI_API_KEY=...
TAVILY_API_KEY=...

# Telegram HITL
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...

# Broker (execution path)
ICICI_API_KEY=...
ICICI_SECRET_KEY=...
ICICI_SESSION_TOKEN=...

# Observability budget guard (Groq free tier = 100000/day)
DAILY_TOKEN_LIMIT=100000

# Optional: RAGAS judge model + LangSmith tracing
RAGAS_JUDGE_MODEL=gemini-2.0-flash
LANGSMITH_API_KEY=...
LANGSMITH_TRACING=true
LANGSMITH_PROJECT=market-analyst
```

---

## Known limitations

- **Groq free-tier budget (100K tokens/day)** is the practical dev bottleneck — a multi-agent query with reflection burns several thousand tokens, so heavy iteration hits the daily cap. Dev tier or a second provider for dev runs lifts it.
- **Output guardrail** sanitizes the stored/eval answer, not tokens already streamed live; airtight live-stream guarding needs the writer output buffered before emit.
- **HITL hold is in-memory** — a server restart mid-hold loses the pending approval (the Telegram buttons remain but do nothing). Persist pending approvals to the DB for restart-safety.
- **Observability** aggregates one request at a time (fine for sequential evals / single-user chat; concurrent load needs per-`run_id` tracking).

---

## Roadmap

Built: Evaluation · Guardrails · HITL · Multi-agent supervision · Reflection · Observability.

Next, roughly in order:

1. **Hybrid retrieval** — combine keyword + semantic (currently semantic-only)
2. **Long-term memory** — episodic / semantic recall across sessions (currently working memory only)
3. **Plan-and-execute** — explicit plan step for complex multi-step queries
4. **Deployment** — cloud deploy with observability wired in
5. **Sovereign on-prem** — self-hosted LLM / embeddings / search to remove external dependencies
6. **Live execution** — flip MockBroker to real orders. **Last**, and gated by the HITL approval already in place.
