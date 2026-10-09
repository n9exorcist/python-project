# MCP Architecture

## Overview

| Component | File | Role |
|---|---|---|
| **MCP Server** | `mcp_server.py` | Hosts tools, loads FAISS, listens on `127.0.0.1:8000` |
| **MCP Client** | `main.py` + `agents.py` | Connects at startup, wraps tools as LangChain tools |

---

## Transport: HTTP POST + SSE

Neither protocol is bidirectional alone — they form a pair:

| Protocol | Direction | Persistent? |
|---|---|---|
| HTTP POST | Client → Server | No (one shot per call) |
| SSE | Server → Client | Yes (long-lived stream) |
| WebSocket | Both | Yes |

```
CLIENT (main.py)                        SERVER (mcp_server.py)

1. GET /sse  ──────────────────────►   opens SSE stream
             ◄──────────────────────   "POST to /messages?session=abc"

2. POST /messages?session=abc ─────►   "call mcp_search_corporate_records"
   (closes after send)

3.           ◄──────────────────────   result pushed over SSE stream
```

**Why not WebSocket?** HTTP POST works through all proxies and firewalls; SSE reconnects automatically; each tool call is a stateless, independently retriable request.

---

## The 3 MCP Primitives

### 1. Tools (callable by the LLM)

| Tool | What it does |
|---|---|
| `mcp_search_corporate_records` | Full RAG pipeline → FAISS + BM25 + FlashRank + citations |
| `mcp_search_the_web` | Async Tavily web search with SSE progress events |
| `mcp_read_signals_csv` | Reads `signals.csv` → bullish/bearish candle bias |
| `mcp_get_trade_history` | Queries `memory.db` (SQLite) for logged trades |
| `mcp_read_market_cycles` | Returns hardcoded Gold/Silver/defense house view |

### 2. Resource
`@mcp.resource("market://cycles")` — URI-addressable read-only content. Unreachable via LangChain (graph sees tools only), so `mcp_read_market_cycles` duplicates it as a tool.

### 3. Prompt
`@mcp.prompt()` — `market_analyst_persona` template; wraps the user question in a system role.

---

## RAG Tool Pipeline (`mcp_search_corporate_records`)

```python
@mcp.tool()
def mcp_search_corporate_records(query: str) -> str:
    result = hybrid_retriever.retrieve(query, RAG_TENANT_ID, RAG_ROLES)
    return format_for_llm(result)
```

`HybridRetriever` steps:
1. Cache check (5-min TTL)
2. Access filter (tenant + ACL) — fixed from env vars, not the prompt
3. Embed query → FAISS dense search (top 20)
4. BM25 keyword search (top 20)
5. RRF merge
6. Injection screening + version resolution
7. FlashRank reranker → top 5
8. `format_for_llm()` wraps in `<document>` tags with exact-offset citations

---

## How the Agent Consumes the Tools

### Startup wiring (`main.py`)
```python
mcp_client = MultiServerMCPClient({
    "market_tools": {"transport": "sse", "url": "http://127.0.0.1:8000/sse"}
})
mcp_tools = await mcp_client.get_tools()   # downloads schemas, wraps as LangChain tools
app.state.app_graph = build_supervisor_graph(llm, mcp_tools, saver)
```

### Tool assignment by specialist (`agents.py`)
```python
researcher_tools = ["mcp_search_corporate_records", "mcp_read_market_cycles"]
web_tools        = ["mcp_search_the_web"]
trading_tools    = ["mcp_read_signals_csv", "mcp_get_trade_history"]

llm_researcher = llm.bind_tools(researcher_tools)   # specialist only sees its own tools
```

### Graph flow
```
START → input_guard → supervisor → specialist → tools → specialist → supervisor → writer → reflect → END
```

- **Supervisor** routes using a compact digest (not full history) → returns one word: `researcher | web | trading | FINISH`
- **Specialist** calls its bound LLM → if LLM emits a tool_call, `ToolNode` executes it via HTTP POST → result returns as `ToolMessage`
- Loop repeats up to `MAX_TOOL_ROUNDS=2` per specialist visit
- **Writer** composes the final answer from `ToolMessage` results already in state — it never calls tools itself
- **Reflect** reviewer checks the answer against retrieved context; can trigger one rewrite

### Guards
| Guard | Value | Purpose |
|---|---|---|
| `MAX_DELEGATIONS` | 4 | Overall supervisor loop cap |
| `MAX_TOOL_ROUNDS` | 2 | Tool calls per specialist visit |
| `MAX_REFLECT` | 1 | Rewrite attempts after critique |
| `used_agents` | set | Each specialist runs once per question |

### Per-call lifecycle
```
User question
  → supervisor picks "researcher"
  → researcher LLM emits tool_call: mcp_search_corporate_records(query)
  → ToolNode: HTTP POST to MCP server
  → server: HybridRetriever → FAISS + BM25 + FlashRank → cited chunks
  → result streams back over SSE → ToolMessage in graph state
  → researcher synthesises → supervisor → FINISH
  → writer composes cited answer
  → reflect: PASS
  → END
```

---

## Why Two Processes?

| Concern | Benefit |
|---|---|
| FAISS index load time | Loaded once at server startup, shared across all requests |
| Heavy dependencies | `flashrank`, `presidio`, BM25 isolated from the FastAPI process |
| Separation of concerns | Server owns data; client owns reasoning |
| Replaceability | Swap the MCP server without touching the agent graph |
