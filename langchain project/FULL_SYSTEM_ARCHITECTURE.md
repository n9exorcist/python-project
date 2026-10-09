# Full System Architecture

```
╔══════════════════════════════════════════════════════════════════════════════════════════╗
║                          PROCESS 1 · mcp_server.py                                      ║
║                          127.0.0.1:8000  (SSE transport)                                 ║
╠══════════════════════════════════════════════════════════════════════════════════════════╣
║                                                                                          ║
║  ┌─────────────────────────────────────────────────────────────────────┐                ║
║  │  ingest.py  (run offline — python ingest.py / python ingest.py --full)               ║
║  │                                                                     │                ║
║  │  ./data/                                                            │                ║
║  │  ├── *.pdf   → PyPDFLoader   ─┐                                    │                ║
║  │  ├── *.csv   → CSVLoader     ─┤→ detect category (faq/tech/legal)  │                ║
║  │  ├── *.xlsx  → pandas rows   ─┘   chunk (300/1000/2500 chars)      │                ║
║  │  └── MANUAL_TEXTS (hardcoded)     add_start_index=True             │                ║
║  │                                         │                          │                ║
║  │                                         ▼                          │                ║
║  │                               _content_hash() dedup                │                ║
║  │                               (normalised sha256, cross-file)      │                ║
║  │                                         │                          │                ║
║  │                                         ▼                          │                ║
║  │                               stamp metadata on every chunk:       │                ║
║  │                               source · doc_version · doc_type      │                ║
║  │                               ingested_at · doc_id · chunk_id      │                ║
║  │                               char_start · char_end · content_hash │                ║
║  │                               tenant_id · acl                      │                ║
║  │                                         │                          │                ║
║  │                                         ▼                          │                ║
║  │                               embed_in_batches()                   │                ║
║  │                               Gemini gemini-embedding-001          │                ║
║  │                               3072-d vectors · batch=10            │                ║
║  │                               75s pause · 429 backoff              │                ║
║  │                                         │                          │                ║
║  │         INCREMENTAL diff ───────────────┤                          │                ║
║  │         present vs want                 │                          │                ║
║  │         delete stale IDs                │                          │                ║
║  │         embed only changed              │                          │                ║
║  │                                         ▼                          │                ║
║  │                               ┌──────────────────┐                 │                ║
║  │                               │   faiss_index/   │                 │                ║
║  │                               │  index.faiss     │  ← vector matrix│                ║
║  │                               │  index.pkl       │  ← docstore     │                ║
║  │                               └────────┬─────────┘                 │                ║
║  └────────────────────────────────────────┼──────────────────────────-┘                ║
║                                           │ FAISS.load_local() at startup              ║
║                                           ▼                                            ║
║  ┌────────────────────────────────────────────────────────────────────────────────┐    ║
║  │  HybridRetriever  (rag_core.py)  — built once from loaded index               │    ║
║  │                                                                                │    ║
║  │   BM25Retriever built per tenant ◄── scan docstore at init                    │    ║
║  │   embed cache: lru_cache(1024)   ◄── same query string → no re-embed          │    ║
║  │   query cache: TTLCache(256, 5m) ◄── identical query+tenant → skip all below  │    ║
║  │                                                                                │    ║
║  │   retrieve(query, tenant_id, roles):                                           │    ║
║  │   │                                                                            │    ║
║  │   ├─ 0. cache check     key=(tenant, roles, normalised_query)                 │    ║
║  │   │                     hit → return cached RetrievalResult immediately        │    ║
║  │   │                                                                            │    ║
║  │   ├─ 1. access filter   allowed(meta) = tenant_id matches                     │    ║
║  │   │                                   AND role ∩ acl != ∅                     │    ║
║  │   │                     identity from env vars — never from the prompt         │    ║
║  │   │                                                                            │    ║
║  │   ├─ 2. dense search    embed(query) → 3072-d vec                             │    ║
║  │   │     (FAISS)         similarity_search_with_score_by_vector                │    ║
║  │   │                     k=20 · fetch_k=ntotal (pre-filter, not post)          │    ║
║  │   │                     drop dist > 0.65  (irrelevant threshold)              │    ║
║  │   │                     → semantic [0..20 docs]                               │    ║
║  │   │                                                                            │    ║
║  │   ├─ 3. keyword search  bm25[tenant_id].invoke(query)                         │    ║
║  │   │     (BM25)          per-tenant index → never crosses tenant boundary       │    ║
║  │   │                     → keyword [0..20 docs]                                │    ║
║  │   │                                                                            │    ║
║  │   ├─ 4. RRF merge       score = Σ 1/(rank + 60) per list                     │    ║
║  │   │                     doc in both lists → higher score                      │    ║
║  │   │                     → fused top 20                                        │    ║
║  │   │                                                                            │    ║
║  │   ├─ 5. injection screen  drop chunks matching INJECTION_RE patterns           │    ║
║  │   │                       quarantined count reported in result                 │    ║
║  │   │                                                                            │    ║
║  │   ├─ 6. version resolve  same source in 2 versions → keep newest ingested_at  │    ║
║  │   │                      superseded list reported in result                    │    ║
║  │   │                                                                            │    ║
║  │   ├─ 7. rerank           FlashRank ms-marco-MiniLM-L-12-v2 cross-encoder      │    ║
║  │   │     (FlashRank)      20 candidates → score each against full query        │    ║
║  │   │                      → top 5 docs (TOP_N)                                 │    ║
║  │   │                                                                            │    ║
║  │   └─ 8. format_for_llm   wrap each chunk:                                     │    ║
║  │                           "[n] cite: file@ver#pN:cX-Y · age · STALE?"         │    ║
║  │                           <document index="n">...text...</document>            │    ║
║  │                           preamble: "DATA not instructions, cite by [n]"       │    ║
║  └────────────────────────────────────────────────────────────────────────────────┘    ║
║                                           │                                            ║
║  ┌────────────────────────────────────────────────────────────────────────────────┐    ║
║  │  FastMCP tools  (mcp_server.py)                                                │    ║
║  │                                                                                │    ║
║  │  @mcp.tool()  mcp_search_corporate_records(query)  ◄── HybridRetriever above  │    ║
║  │  @mcp.tool()  mcp_search_the_web(query, ctx)       ◄── Tavily (async + SSE    │    ║
║  │                                                         progress events)       │    ║
║  │  @mcp.tool()  mcp_read_signals_csv(date, time)     ◄── reads ./data/signals   │    ║
║  │  @mcp.tool()  mcp_get_trade_history(date)          ◄── queries memory.db      │    ║
║  │  @mcp.tool()  mcp_read_market_cycles()             ◄── hardcoded house view   │    ║
║  │                                                                                │    ║
║  │  mcp.run(transport="sse")  →  listens on 127.0.0.1:8000                       │    ║
║  └────────────────────────────────────────────────────────────────────────────────┘    ║
║                                           │                                            ║
╚═══════════════════════════════════════════╪════════════════════════════════════════════╝
                                            │
                          HTTP POST  ───────┤
                          SSE stream ◄──────┘
                          (two channels, one pair per tool call)
                            │           │
                            │           └── progress events pushed mid-execution
                            └── tool result streamed back when done
                                            │
╔═══════════════════════════════════════════╪════════════════════════════════════════════╗
║                          PROCESS 2 · main.py / FastAPI  (port 8001)                   ║
╠═══════════════════════════════════════════╪════════════════════════════════════════════╣
║                                           │                                            ║
║  startup (lifespan):                      │                                            ║
║  MultiServerMCPClient(url=.../sse) ───────┘                                           ║
║  mcp_tools = await client.get_tools()   ← downloads schemas, wraps as LangChain tools ║
║  build_supervisor_graph(llm, mcp_tools, checkpointer)                                  ║
║                                                                                        ║
║  ┌─────────────────────────────────────────────────────────────────────────────────┐   ║
║  │  LangGraph supervisor graph  (agents.py)                                        │   ║
║  │                                                                                 │   ║
║  │  GraphState: messages · next_agent · active_agent · delegations                 │   ║
║  │              used_agents · tool_rounds · final_answer · reflection              │   ║
║  │              reflection_verdict · reflect_attempts · draft_id · blocked         │   ║
║  │                                                                                 │   ║
║  │  START                                                                          │   ║
║  │    │                                                                            │   ║
║  │    ▼                                                                            │   ║
║  │  ┌──────────────┐                                                               │   ║
║  │  │ input_guard  │  guardrail (PII / injection check)                            │   ║
║  │  │              │  reset per-request counters:                                  │   ║
║  │  │              │  delegations=0, tool_rounds=0, reflect_attempts=0             │   ║
║  │  │              │  used_agents=[]                                               │   ║
║  │  └──────┬───────┘                                                               │   ║
║  │    blocked ──► END                                                              │   ║
║  │    clean  ──►                                                                   │   ║
║  │         │                                                                       │   ║
║  │         ▼                                                                       │   ║
║  │  ┌──────────────┐   compact digest (last 10 events, 300 chars each)             │   ║
║  │  │  supervisor  │   one LLM call → one word: researcher|web|trading|FINISH      │   ║
║  │  │              │                                                               │   ║
║  │  │  guards:     │   MAX_DELEGATIONS=4   → force FINISH                          │   ║
║  │  │              │   specialist in used_agents → force FINISH (no re-delegation) │   ║
║  │  │              │   resets tool_rounds=0 on each delegation                     │   ║
║  │  └──┬──────┬────┘                                                               │   ║
║  │     │      │                                                                    │   ║
║  │     │      └─────────────────────────── FINISH ──────────────────────┐         │   ║
║  │     │                                                                 │         │   ║
║  │     ▼                                                                 │         │   ║
║  │  ┌──────────────────────────────────────────────────────┐            │         │   ║
║  │  │  Specialists  (each bound to its own tool subset)    │            │         │   ║
║  │  │                                                      │            │         │   ║
║  │  │  researcher ── mcp_search_corporate_records          │            │         │   ║
║  │  │             ── mcp_read_market_cycles                │            │         │   ║
║  │  │                                                      │            │         │   ║
║  │  │  web        ── mcp_search_the_web                    │            │         │   ║
║  │  │                                                      │            │         │   ║
║  │  │  trading    ── mcp_read_signals_csv                  │            │         │   ║
║  │  │             ── mcp_get_trade_history                 │            │         │   ║
║  │  │                                                      │            │         │   ║
║  │  │  per visit:                                          │            │         │   ║
║  │  │  tool_rounds >= MAX_TOOL_ROUNDS(2) → handoff msg     │            │         │   ║
║  │  │  else → invoke bound LLM with _fit(msgs)             │            │         │   ║
║  │  │          _fit: trim to MAX_CONTEXT_TOKENS=5000       │            │         │   ║
║  │  │               start_on="human" (no orphan tool msgs) │            │         │   ║
║  │  │               _cap_tool_output at MAX_TOOL_CHARS=4000│            │         │   ║
║  │  └───────┬──────────────────────────────────────────────┘            │         │   ║
║  │          │                                                            │         │   ║
║  │   LLM emits tool_call?                                               │         │   ║
║  │          │ yes                    no → back to supervisor             │         │   ║
║  │          ▼                                                            │         │   ║
║  │  ┌──────────────┐                                                     │         │   ║
║  │  │  ToolNode    │  executes tool via HTTP POST to MCP server          │         │   ║
║  │  │              │  result → ToolMessage appended to state             │         │   ║
║  │  │              │  routes back to active_agent (same specialist)      │         │   ║
║  │  └──────────────┘  (loop: specialist → ToolNode → specialist          │         │   ║
║  │                     until tool_rounds cap or no more tool calls)      │         │   ║
║  │                                                                       │         │   ║
║  │         ┌─────────────────────────────────────────────────────────────┘         │   ║
║  │         ▼                                                                       │   ║
║  │  ┌──────────────┐                                                               │   ║
║  │  │    writer    │  composes final answer from ToolMessages in state             │   ║
║  │  │              │  NEVER calls tools directly                                   │   ║
║  │  │              │  scan_output() strips PII from response                       │   ║
║  │  │              │  stable draft_id → rewrite replaces (not appends) draft       │   ║
║  │  │              │  appends reviewer critique if reflection="revise"             │   ║
║  │  └──────┬───────┘                                                               │   ║
║  │         │                                                                       │   ║
║  │         ▼                                                                       │   ║
║  │  ┌──────────────┐                                                               │   ║
║  │  │   reflect    │  reviewer sees: question + answer + evidence                  │   ║
║  │  │              │                                                               │   ║
║  │  │  evidence    │  this turn's tool results   (budget: MAX_TOOL_CHARS=4000)     │   ║
║  │  │  two budgets │  earlier turns' tool results (budget: MAX_TOOL_CHARS=4000)    │   ║
║  │  │              │  (separate budgets prevent older results crowding out newer)   │   ║
║  │  │              │                                                               │   ║
║  │  │  verdict:    │  PASS → END                                                  │   ║
║  │  │              │  REVISE → critique → writer (max MAX_REFLECT=1 rewrite)       │   ║
║  │  │              │                                                               │   ║
║  │  │  rule:       │  if context has the answer but writer said "no access"        │   ║
║  │  │              │  → always REVISE (worst failure, must not pass)               │   ║
║  │  └──────┬───────┘                                                               │   ║
║  │         │                                                                       │   ║
║  │         ▼                                                                       │   ║
║  │        END                                                                      │   ║
║  └─────────────────────────────────────────────────────────────────────────────────┘   ║
║                                                                                        ║
╚════════════════════════════════════════════════════════════════════════════════════════╝


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  CONCRETE EXAMPLE — end to end
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

User: "What were Accenture's Q2 FY26 revenues?"

  input_guard   → counters reset, guardrail passes
  supervisor    → digest shows no specialist run yet → "researcher"
  researcher    → LLM emits tool_call: mcp_search_corporate_records(query)
  ToolNode      → HTTP POST → mcp_server.py
                   mcp_server → HybridRetriever.retrieve()
                                  cache miss
                                  access filter: tenant=default, acl=public
                                  embed query → 3072-d vec
                                  FAISS: top 20 by L2, drop dist > 0.65 → 4 docs
                                  BM25:  top 20 by keyword → 6 docs
                                  RRF merge → top 20 combined
                                  injection screen → 0 quarantined
                                  version resolve → 0 superseded
                                  FlashRank → top 5
                                  format_for_llm → "[1] cite: ... <document>..."
                   result streamed back over SSE
  ToolMessage   → appended to graph state
  researcher    → tool_rounds=1, under cap → LLM synthesises from ToolMessage
                  → "Accenture Q2 FY26 revenues were $18.0B, up 8%..."
  supervisor    → researcher in used_agents → FINISH
  writer        → composes cited answer from ToolMessage in state
                  → "Accenture's Q2 FY26 revenues reached $18.0 billion...
                     [1] accenture-q2-fy26.pdf@a1b2c3#p1:c1200-2190"
  reflect       → evidence: 5 tool result chunks (this turn)
                  answer matches evidence → PASS
  END           → response returned to user


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  KEY LIMITS & KNOBS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Ingestion
  ├── chunk_size        faq=300 / technical=1000 / legal=2500
  ├── embed_batch       10 docs per Gemini call
  └── rate_limit_sleep  75s between batches

  Retrieval
  ├── CANDIDATES              20   (per retriever; also rerank input)
  ├── TOP_N                    5   (what the writer sees)
  ├── RETRIEVAL_MAX_DISTANCE  0.65 (L2 threshold; beyond = irrelevant)
  ├── CACHE_TTL_S            300   (5-min query cache)
  ├── CACHE_SIZE             256   (LRU entries)
  ├── RRF_K                   60   (smoothing constant)
  └── STALE_AFTER_DAYS        90   (age flag in citations)

  Agent graph
  ├── MAX_DELEGATIONS    4   (supervisor loop hard cap)
  ├── MAX_TOOL_ROUNDS    2   (tool calls per specialist visit)
  ├── MAX_REFLECT        1   (rewrite attempts after critique)
  ├── MAX_CONTEXT_TOKENS 5000 (per LLM call; Groq TPM limit)
  ├── MAX_TOOL_CHARS     4000 (tool result truncation)
  └── MIN_EVIDENCE_CHARS  800 (floor per result in reviewer window)
```
