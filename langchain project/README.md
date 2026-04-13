# Market Scanner MCP (Python)

A Python‑based stock scanner MCP server and client that exposes market‑data tools via the Model Context Protocol (MCP) and uses Groq‑powered agents to run scans.

---

## Features

- Expose `fetch_ohlcv`, `compute_indicators`, `scan_symbol`, and `scan_watchlist` over MCP‑SSE
- Built‑in breakout / momentum / pullback / Bollinger‑reversal rules
- Full integration with `langchain.agents` and `langchain_mcp_adapters`
- Asynchronous Python client using `MultiServerMCPClient` and `ChatGroq`

---

## Architecture

```text
scanner_main_client.py
    ↓
MultiServerMCPClient → http://127.0.0.1:9002/sse
    ↓
mcp_market_scanner_server.py
    ↓
yfinance + pandas_ta + rules
```

---

## Prerequisites

- Python 3.11+
- `mcp[fastmcp]`, `langchain`, `langgraph`, `langchain_mcp_adapters`, `langchain_groq`
- Groq API key for `scanner_main_client.py`
- `yfinance` and `pandas_ta_classic` for indicator calculations

Install them with:

```bash
pip install fastmcp langchain langgraph langchain_mcp_adapters langchain_groq
pip install yfinance pandas_ta_classic
```

---

## Folder structure

```text
.
├── mcp_market_scanner_server.py     # MCP scanner tools server
├── scanner_main_client.py           # MCP client + agent runner
├── .env                             # GROQ_API_KEY, etc.
└── README.md
```

---

## MCP Server: `mcp_market_scanner_server.py`

This file exposes:

- `fetch_ohlcv(symbol, exchange, interval, period) -> str`
- `compute_indicators(symbol, exchange, interval, period) -> str`
- `scan_symbol(symbol, scan_type, exchange, interval, period) -> str`
- `scan_watchlist(symbols_csv, scan_type, exchange, interval, period) -> str`
- `supported_indicators` resource

### How to run the server

```bash
fastmcp run mcp_market_scanner_server.py --transport sse --host 127.0.0.1 --port 9002
```

The server will be available at:

---

http://127.0.0.1:9002/sse

---

## MCP Client: `scanner_main_client.py`

This file:

1. loads `GROQ_API_KEY` from `.env`,
2. connects to the MCP server at `http://127.0.0.1:9002/sse`,
3. loads tools,
4. builds a ReAct agent,
5. runs a query and prints the final answer text.

### Environment

Create `.env`:

```env
GROQ_API_KEY=your_groq_api_key
```

### How to run the client

Make sure the server is running, then:

```bash
python scanner_main_client.py
```

Example output:

```text
=== FINAL ANSWER ===

Neither INFY nor RELIANCE have passed the breakout scan...
```

---

## How to update the query

Edit `scanner_main_client.py` and change:

```python
query = "Scan INFY and RELIANCE for breakout setups"
```

to another prompt, such as:

- `Scan INFY and RELIANCE for momentum setups`
- `Scan a watchlist of large‑cap Indian stocks for breakout setups`
- `Explain whether INFY is in a bullish trend`

---

## Key ports and endpoints

| Role                 | URL / port                                 |
| -------------------- | ------------------------------------------ |
| MCP server transport | `http://127.0.0.1:9002/sse`                |
| Groq model           | `llama-3.3-70b-versatile` (via `ChatGroq`) |

---

## Troubleshooting

- **401 invalid_api_key from Groq**  
  → Check `.env` and ensure `GROQ_API_KEY` is set correctly.

- **MCP client cannot connect**  
  → Confirm the server is running and the URL matches `9002`.

- **No candidates returned**  
  → Your scan rules are strict; try `scan_type="momentum"` or a broader watchlist.

---

## Future extensions

- Add more scan types (e.g., “mean‑reversion”, “value‑growth crossover”)
- Expose a REST API on top of the MCP server
- Integrate with your React app via FastAPI‑LangGraph‑MCP flow

---

## Notes

This project is specifically for experimenting with **MCP + LangGraph + Groq** in Python.  
You do **not** need `scanner_graph.py` unless you want a custom `StateGraph`‑based workflow.  
For production, consider adding logging, rate‑limiting, and unit tests.

--

EXECUTION:

(venv) PS C:\Users\narayanan.selvaraj\python project\langchain project> fastmcp run mcp_market_scanner_server.py --transport sse --host 127.0.0.1 --port 9002

(venv) PS C:\Users\narayanan.selvaraj\python project\langchain project> python scanner_main_client.py
