import { useState } from "react";

const sections = [
  {
    id: "langchain",
    emoji: "⛓️",
    title: "LangChain — What Problem Does It Solve?",
    color: "#22c55e",
    content: (
      <div>
        <p style={{lineHeight:"1.7",marginBottom:"1rem",color:"#94a3b8"}}>
          Without LangChain, calling an LLM + tools looks like this mess:
        </p>
        <div style={{background:"#0f172a",borderRadius:"8px",padding:"1rem",marginBottom:"1rem",border:"1px solid #334155"}}>
          <div style={{color:"#f87171",fontSize:"0.75rem",marginBottom:"0.5rem"}}>WITHOUT LangChain (raw code):</div>
          <pre style={{color:"#94a3b8",fontSize:"0.72rem",lineHeight:"1.7",margin:0}}>{`# 1. Call Groq API manually
import requests
res = requests.post("https://api.groq.com/v1/chat", 
    headers={"Authorization": f"Bearer {key}"},
    json={"model":"llama-3.3", "messages":[...]}
)

# 2. Parse response manually
text = res.json()["choices"][0]["message"]["content"]

# 3. Check if it wants to call a tool — write this yourself
if '"tool_call"' in text:
    tool_name = parse_tool_name(text)  # write this yourself
    tool_result = call_tool(tool_name) # write this yourself
    # call LLM again with tool result...
    # handle errors yourself, retries yourself, history yourself...`}</pre>
        </div>
        <div style={{background:"#0f172a",borderRadius:"8px",padding:"1rem",marginBottom:"1rem",border:"1px solid #22c55e"}}>
          <div style={{color:"#86efac",fontSize:"0.75rem",marginBottom:"0.5rem"}}>WITH LangChain (your code):</div>
          <pre style={{color:"#86efac",fontSize:"0.72rem",lineHeight:"1.7",margin:0}}>{`from langchain_groq import ChatGroq

llm = ChatGroq(model_name="llama-3.3-70b-versatile", api_key=groq_key)
llm_with_tools = llm.bind_tools(mcp_tools)  # that's it!

# LangChain handles:
# Auth headers, request/response format, tool call parsing,
# message history format, retry logic, streaming —
# AND it works the same way for OpenAI, Groq, Gemini, Ollama`}</pre>
        </div>
        <div style={{marginBottom:"1rem"}}>
          <div style={{color:"#22c55e",fontWeight:"700",marginBottom:"0.75rem",fontSize:"0.9rem"}}>What LangChain gives you (used in your code):</div>
          <div style={{display:"grid",gap:"0.5rem"}}>
            {[
              {item:"ChatGroq", what:"Wrapper so you call Groq same way as OpenAI/Gemini", file:"main.py"},
              {item:"SystemMessage / HumanMessage", what:"Typed message objects instead of raw dicts", file:"main.py"},
              {item:"llm.bind_tools()", what:"Attaches MCP tools to LLM so it knows what it can call", file:"main.py"},
              {item:"FAISS (langchain_community)", what:"Vector store wrapper with .from_documents() and .as_retriever()", file:"ingest.py + mcp_server.py"},
              {item:"PyPDFLoader / CSVLoader", what:"File loaders that return Document objects", file:"ingest.py"},
              {item:"RecursiveCharacterTextSplitter", what:"Smart chunking that respects sentence/paragraph boundaries", file:"ingest.py"},
              {item:"TavilySearchResults", what:"Web search tool wrapped as a LangChain tool", file:"mcp_server.py"},
            ].map(r=>(
              <div key={r.item} style={{background:"#1e293b",borderRadius:"6px",padding:"0.6rem 0.85rem",display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:"0.5rem",flexWrap:"wrap"}}>
                <div>
                  <code style={{color:"#86efac",fontSize:"0.77rem",fontFamily:"monospace"}}>{r.item}</code>
                  <div style={{color:"#64748b",fontSize:"0.72rem",marginTop:"2px"}}>{r.what}</div>
                </div>
                <span style={{color:"#334155",fontSize:"0.65rem",fontFamily:"monospace",whiteSpace:"nowrap"}}>{r.file}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{background:"#1e293b",borderRadius:"8px",padding:"1rem",border:"1px solid #22c55e"}}>
          <div style={{color:"#22c55e",fontWeight:"700",fontSize:"0.8rem",marginBottom:"0.4rem"}}>One-line summary:</div>
          <div style={{color:"#94a3b8",fontSize:"0.82rem",lineHeight:"1.6"}}>
            LangChain = <strong style={{color:"#f8fafc"}}>utility belt</strong> of wrappers and abstractions. 
            It does not run your logic — it gives you clean, unified interfaces to LLMs, vector stores, document loaders, and tools.
          </div>
        </div>
      </div>
    )
  },
  {
    id: "langgraph",
    emoji: "🕸️",
    title: "LangGraph — Why a Graph? Why Not Just Call LLM Directly?",
    color: "#6366f1",
    content: (
      <div>
        <p style={{lineHeight:"1.7",marginBottom:"1rem",color:"#94a3b8"}}>
          LangGraph is for when your AI needs to make <strong style={{color:"#f8fafc"}}>decisions, loops, and branches</strong> — not just one call and done.
        </p>
        <div style={{background:"#0f172a",borderRadius:"8px",padding:"1rem",marginBottom:"1rem",border:"1px solid #334155"}}>
          <div style={{color:"#94a3b8",fontSize:"0.75rem",marginBottom:"0.75rem"}}>YOUR EXACT GRAPH from main.py:</div>
          <pre style={{color:"#94a3b8",fontSize:"0.72rem",lineHeight:"1.9",margin:0}}>{`START
  |
  v
[router_node] -- Reads user message, decides: "local" / "web" / "hybrid"
  |
  v
[agent_node] -- LLM looks at message + routing hint, decides which tool to call
  |
  +-- wants to call a tool? ---> [tools node] -- Actually calls MCP tool
  |                                   |
  |                                   v
  |                            [validator_node] -- Was the tool result good?
  |                                   |
  |                           bad? ---+ retry --> back to [agent_node]  <- LOOP!
  |                           good? -->
  |
  v
[writer_node] -- LLM writes clean final answer using retrieved context
  |
  v
END`}</pre>
        </div>
        <div style={{marginBottom:"1rem"}}>
          <div style={{color:"#6366f1",fontWeight:"700",marginBottom:"0.75rem"}}>Why you cannot do this without LangGraph:</div>
          <div style={{display:"grid",gap:"0.5rem"}}>
            {[
              {prob:"Loops", desc:"The validator can send execution BACK to the agent. Pure Python while-loops do not have checkpointing or state persistence."},
              {prob:"Shared state across nodes", desc:"Each node (router, agent, validator, writer) shares a typed GraphState dict. No global variables needed."},
              {prob:"Checkpointing", desc:"AsyncSqliteSaver saves the full conversation state to SQLite after each step. If the server crashes mid-conversation, it resumes."},
              {prob:"Streaming", desc:"LangGraph streams partial results. Your /chat/stream endpoint works because of this."},
              {prob:"Conditional edges", desc:"'If agent called a tool go to tools node. Otherwise go to validator.' Clean branching without spaghetti if/else."},
            ].map(r=>(
              <div key={r.prob} style={{background:"#1e293b",borderRadius:"6px",padding:"0.7rem 0.85rem",borderLeft:"3px solid #6366f1"}}>
                <div style={{color:"#a5b4fc",fontWeight:"600",fontSize:"0.8rem",marginBottom:"0.2rem"}}>{r.prob}</div>
                <div style={{color:"#64748b",fontSize:"0.75rem",lineHeight:"1.5"}}>{r.desc}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{background:"#0f172a",borderRadius:"8px",padding:"1rem",border:"1px solid #6366f1"}}>
          <div style={{color:"#6366f1",fontSize:"0.75rem",marginBottom:"0.5rem"}}>KEY CODE from main.py explained:</div>
          <pre style={{color:"#86efac",fontSize:"0.72rem",lineHeight:"1.7",margin:0}}>{`# Define state shape (shared between ALL nodes)
class GraphState(TypedDict):
    messages: list         # full conversation history
    route: str             # "local" / "web" / "hybrid"
    validation_status: str # "ok" / "retry" / "fallback"
    retry_count: int       # how many retries so far
    final_answer: str      # the clean final response

# Conditional edges = routing between nodes based on state
graph_builder.add_conditional_edges(
    "agent",
    route_after_agent,        # function that inspects state
    {"tools": "tools",        # returns "tools" -> go to tools node
     "validator": "validator"} # returns "validator" -> skip tools
)

# Compile with checkpointer = auto-save to SQLite after each step
app_graph = graph_builder.compile(checkpointer=db_saver)`}</pre>
        </div>
        <div style={{marginTop:"1rem",background:"#1e293b",borderRadius:"8px",padding:"1rem",border:"1px solid #6366f1"}}>
          <div style={{color:"#6366f1",fontWeight:"700",fontSize:"0.8rem",marginBottom:"0.4rem"}}>One-line summary:</div>
          <div style={{color:"#94a3b8",fontSize:"0.82rem",lineHeight:"1.6"}}>
            LangGraph = <strong style={{color:"#f8fafc"}}>state machine for AI</strong>. It lets your AI loop, branch, retry, and remember — things a simple LLM call cannot do.
          </div>
        </div>
      </div>
    )
  },
  {
    id: "mcp-what",
    emoji: "🔌",
    title: "MCP — What Is It Really?",
    color: "#f59e0b",
    content: (
      <div>
        <p style={{lineHeight:"1.7",marginBottom:"1rem",color:"#94a3b8"}}>
          MCP stands for <strong style={{color:"#f8fafc"}}>Model Context Protocol</strong>. It is a standard made by Anthropic for how AI models should talk to external tools and data sources.
        </p>
        <div style={{background:"#1e293b",borderRadius:"8px",padding:"1rem",marginBottom:"1rem",border:"1px solid #f59e0b"}}>
          <div style={{color:"#fbbf24",fontWeight:"700",fontSize:"0.85rem",marginBottom:"0.75rem"}}>The analogy that makes it click:</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:"0.5rem",alignItems:"center",fontSize:"0.8rem"}}>
            <div style={{background:"#0f172a",borderRadius:"6px",padding:"0.75rem",textAlign:"center"}}>
              <div style={{fontSize:"1.5rem",marginBottom:"0.25rem"}}>🌐</div>
              <div style={{color:"#94a3b8"}}>HTTP is the standard for how browsers talk to servers</div>
            </div>
            <div style={{color:"#f59e0b",fontWeight:"700",textAlign:"center",padding:"0.5rem",fontSize:"0.75rem"}}>MCP is like HTTP but for AI tools</div>
            <div style={{background:"#0f172a",borderRadius:"6px",padding:"0.75rem",textAlign:"center"}}>
              <div style={{fontSize:"1.5rem",marginBottom:"0.25rem"}}>🤖</div>
              <div style={{color:"#94a3b8"}}>MCP is the standard for how AI models talk to tools</div>
            </div>
          </div>
        </div>
        <p style={{lineHeight:"1.7",marginBottom:"1rem",color:"#94a3b8"}}>
          Before MCP, every AI tool integration was custom glue code. MCP standardizes it so <strong style={{color:"#f8fafc"}}>any MCP-compatible AI can use any MCP-compatible tool</strong>.
        </p>
        <div style={{marginBottom:"1rem"}}>
          <div style={{color:"#f59e0b",fontWeight:"700",marginBottom:"0.75rem"}}>Three things an MCP server can expose:</div>
          <div style={{display:"grid",gap:"0.6rem"}}>
            {[
              {type:"@mcp.tool()", icon:"🔧", desc:"Functions the AI can call to DO things (search, query DB, call API). Your code uses these.", example:"mcp_search_corporate_records(), mcp_get_trade_history()"},
              {type:"@mcp.resource()", icon:"📦", desc:"Read-only data the AI can access (like a file or URL). Your code has one.", example:'market://cycles -> returns market cycle text'},
              {type:"@mcp.prompt()", icon:"💬", desc:"Reusable prompt templates the AI can use.", example:"market_analyst_persona(question)"},
            ].map(r=>(
              <div key={r.type} style={{background:"#1e293b",borderRadius:"8px",padding:"0.85rem",borderLeft:"3px solid #f59e0b"}}>
                <div style={{display:"flex",gap:"0.5rem",alignItems:"center",marginBottom:"0.35rem"}}>
                  <span>{r.icon}</span>
                  <code style={{color:"#fbbf24",fontFamily:"monospace",fontSize:"0.8rem"}}>{r.type}</code>
                </div>
                <div style={{color:"#94a3b8",fontSize:"0.75rem",lineHeight:"1.5",marginBottom:"0.35rem"}}>{r.desc}</div>
                <code style={{color:"#64748b",fontFamily:"monospace",fontSize:"0.68rem"}}>{r.example}</code>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  },
  {
    id: "mcp-custom",
    emoji: "🛠️",
    title: "Custom vs Pre-built MCP Tools — Where to Find Them",
    color: "#ec4899",
    content: (
      <div>
        <p style={{lineHeight:"1.7",marginBottom:"1rem",color:"#94a3b8"}}>
          Yes — the tools in your <code style={{color:"#f9a8d4",background:"#0f172a",padding:"2px 5px",borderRadius:"4px",fontSize:"0.8rem"}}>mcp_server.py</code> are <strong style={{color:"#f8fafc"}}>100% custom</strong> tools you wrote. But there is a whole registry of pre-built ones.
        </p>
        <div style={{background:"#0f172a",borderRadius:"8px",padding:"1rem",marginBottom:"1.25rem",border:"1px solid #ec4899"}}>
          <div style={{color:"#f9a8d4",fontSize:"0.8rem",marginBottom:"0.5rem",fontWeight:"700"}}>Your custom tools (mcp_server.py):</div>
          <pre style={{color:"#86efac",fontSize:"0.72rem",lineHeight:"1.7",margin:0}}>{`@mcp.tool()
def mcp_read_signals_csv(date: str) -> str:
    # YOUR business logic: reads YOUR signals.csv file

@mcp.tool()
def mcp_get_trade_history(date: str) -> str:
    # YOUR business logic: queries YOUR memory.db SQLite

@mcp.tool()
def mcp_search_corporate_records(query: str) -> str:
    # YOUR business logic: searches YOUR FAISS vector index

@mcp.tool()
def mcp_search_the_web(query: str) -> str:
    # Wraps Tavily — but YOU decide how to expose it`}</pre>
        </div>
        <div style={{color:"#ec4899",fontWeight:"700",marginBottom:"0.75rem"}}>Where to find pre-built MCP servers:</div>
        <div style={{display:"grid",gap:"0.5rem",marginBottom:"1rem"}}>
          {[
            {source:"github.com/modelcontextprotocol/servers", desc:"Official MCP repo — filesystem, git, postgres, sqlite, brave-search, fetch, memory", tag:"Official"},
            {source:"mcp.so", desc:"Community directory of 1000+ MCP servers. Like npm for AI tools.", tag:"Directory"},
            {source:"github.com/punkpeye/awesome-mcp-servers", desc:"Curated list: GitHub, Slack, Gmail, Notion, Linear, Jira, Stripe, Shopify...", tag:"Curated"},
            {source:"Cursor / Claude Desktop settings", desc:"One-click install of community servers from inside the app", tag:"GUI"},
          ].map(r=>(
            <div key={r.source} style={{background:"#1e293b",borderRadius:"6px",padding:"0.7rem 0.85rem",display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:"0.5rem",flexWrap:"wrap"}}>
              <div>
                <code style={{color:"#f9a8d4",fontSize:"0.75rem",fontFamily:"monospace"}}>{r.source}</code>
                <div style={{color:"#64748b",fontSize:"0.72rem",marginTop:"2px"}}>{r.desc}</div>
              </div>
              <span style={{background:"#1e293b",border:"1px solid #ec4899",color:"#f9a8d4",fontSize:"0.6rem",padding:"2px 7px",borderRadius:"4px",whiteSpace:"nowrap"}}>{r.tag}</span>
            </div>
          ))}
        </div>
        <div style={{color:"#ec4899",fontWeight:"700",marginBottom:"0.75rem"}}>Popular ready-made MCP servers you can plug in:</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.5rem"}}>
          {[
            {icon:"📁",what:"Filesystem — read/write local files"},
            {icon:"🗄️",what:"SQLite — query any SQLite DB"},
            {icon:"🐙",what:"GitHub — repos, issues, PRs"},
            {icon:"🐘",what:"Postgres — query PostgreSQL"},
            {icon:"🔍",what:"Brave Search — web search"},
            {icon:"📝",what:"Notion — read/write pages"},
            {icon:"💬",what:"Slack — send/read messages"},
            {icon:"📧",what:"Gmail — read/send email"},
          ].map(t=>(
            <div key={t.what} style={{background:"#1e293b",borderRadius:"6px",padding:"0.6rem 0.75rem",display:"flex",gap:"0.5rem",alignItems:"center"}}>
              <span style={{fontSize:"1.1rem",flexShrink:0}}>{t.icon}</span>
              <div style={{color:"#94a3b8",fontSize:"0.73rem"}}>{t.what}</div>
            </div>
          ))}
        </div>
      </div>
    )
  },
  {
    id: "mcp-architecture",
    emoji: "🏗️",
    title: "Why Client-Server Architecture for MCP?",
    color: "#06b6d4",
    content: (
      <div>
        <p style={{lineHeight:"1.7",marginBottom:"1rem",color:"#94a3b8"}}>
          This is the most important conceptual question. The answer is <strong style={{color:"#f8fafc"}}>isolation, security, and reusability</strong>.
        </p>
        <div style={{background:"#0f172a",borderRadius:"8px",padding:"1rem",marginBottom:"1.25rem",border:"1px solid #334155"}}>
          <div style={{color:"#94a3b8",fontSize:"0.75rem",marginBottom:"0.75rem"}}>YOUR EXACT SETUP:</div>
          <pre style={{color:"#94a3b8",fontSize:"0.72rem",lineHeight:"1.9",margin:0}}>{`+-----------------------------------------------------+
|                 YOUR MACHINE                        |
|                                                     |
|  +----------------------+  HTTP/SSE  +------------+ |
|  | main.py (port 8001)  | <--------- |            | |
|  |                      |            |  MCP       | |
|  | FastAPI + LangGraph  | ---------> | Server     | |
|  | + MultiServerMCP     | tool calls | (port 8000)| |
|  |   Client             |            |            | |
|  +----------------------+            +------------+ |
|         MCP CLIENT                   MCP SERVER     |
|                                                     |
|  React Frontend (port 3000)                         |
+-----------------------------------------------------+`}</pre>
        </div>
        <div style={{marginBottom:"1.25rem"}}>
          <div style={{color:"#06b6d4",fontWeight:"700",marginBottom:"0.75rem"}}>5 Reasons why it is client-server (not just a function import):</div>
          <div style={{display:"grid",gap:"0.6rem"}}>
            {[
              {
                reason:"1. Language independence",
                explain:"Your main app is Python. But an MCP server could be Node.js, Go, Rust — anything. The LLM does not care. It just sends HTTP calls.",
                code:`// MCP server in Node.js — works with your Python main.py
const server = new McpServer({ name: "mytools" });
server.tool("get_price", ..., () => fetchStockPrice());`
              },
              {
                reason:"2. Process isolation",
                explain:"If the MCP server crashes (e.g., FAISS blows up), your main FastAPI app keeps running. The tool just returns an error, your validator retries.",
                code:`# In your code — if MCP server is down:
try:
    mcp_tools = await mcp_client.get_tools()
except Exception as e:
    mcp_tools = []  # graceful fallback, app still works`
              },
              {
                reason:"3. Run tools remotely",
                explain:"The MCP server does not need to be on the same machine. Your main app on Render, MCP server on Railway — no problem.",
                code:`# MultiServerMCPClient supports remote URLs:
mcp_client = MultiServerMCPClient({
    "market_tools": {
        "transport": "sse",
        "url": "https://my-mcp-server.railway.app/sse"
    }
})`
              },
              {
                reason:"4. Reuse across multiple AI apps",
                explain:"Once you build your MCP server, ANY AI app (Claude Desktop, Cursor, your other projects) can connect to it. Build once, use everywhere.",
                code:`# Same MCP server used by different clients:
# Claude Desktop -> connects to your mcp_server.py
# Cursor IDE     -> connects to your mcp_server.py
# Your main.py   -> connects to your mcp_server.py`
              },
              {
                reason:"5. Security boundary",
                explain:"The MCP server controls exactly what the AI can access. The AI cannot directly import your DB or filesystem — it can ONLY call what you exposed via @mcp.tool().",
                code:`# AI can only do what you explicitly expose:
@mcp.tool()
def mcp_get_trade_history(date: str) -> str: ...
# AI CANNOT: directly import sqlite3 and run DROP TABLE
# AI CANNOT: read your .env file
# AI CANNOT: access anything not in an @mcp.tool()`
              },
            ].map(r=>(
              <div key={r.reason} style={{background:"#1e293b",borderRadius:"8px",overflow:"hidden",border:"1px solid #164e63"}}>
                <div style={{padding:"0.7rem 0.85rem",borderBottom:"1px solid #0c4a6e"}}>
                  <div style={{color:"#67e8f9",fontWeight:"600",fontSize:"0.82rem",marginBottom:"0.2rem"}}>{r.reason}</div>
                  <div style={{color:"#64748b",fontSize:"0.75rem",lineHeight:"1.5"}}>{r.explain}</div>
                </div>
                <pre style={{margin:0,padding:"0.7rem 0.85rem",color:"#86efac",fontSize:"0.68rem",lineHeight:"1.6",background:"#0c1a2e"}}>{r.code}</pre>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  },
  {
    id: "mcp-transports",
    emoji: "🚌",
    title: "SSE vs stdio — MCP Transport Types",
    color: "#a855f7",
    content: (
      <div>
        <p style={{lineHeight:"1.7",marginBottom:"1rem",color:"#94a3b8"}}>
          MCP servers can communicate two ways. Your code uses <strong style={{color:"#f8fafc"}}>SSE</strong>.
        </p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1rem",marginBottom:"1.25rem"}}>
          <div style={{background:"#1e293b",borderRadius:"10px",padding:"1.25rem",border:"1px solid #7c3aed"}}>
            <div style={{color:"#a78bfa",fontWeight:"700",marginBottom:"0.5rem"}}>SSE (Server-Sent Events)</div>
            <div style={{color:"#64748b",fontSize:"0.73rem",marginBottom:"0.75rem"}}>Used in your code</div>
            <div style={{color:"#94a3b8",fontSize:"0.78rem",lineHeight:"1.7"}}>
              MCP server runs as an HTTP server.<br/>
              Client connects over the network.<br/>
              Works across machines / Docker / cloud.<br/><br/>
              <span style={{color:"#86efac"}}>Remote-ready</span><br/>
              <span style={{color:"#86efac"}}>Multiple clients can connect</span><br/>
              <span style={{color:"#f87171"}}>Needs a running server process</span>
            </div>
            <div style={{marginTop:"0.75rem",background:"#0f172a",borderRadius:"6px",padding:"0.6rem"}}>
              <code style={{color:"#c4b5fd",fontSize:"0.68rem",fontFamily:"monospace"}}>url: 'http://127.0.0.1:8000/sse'</code>
            </div>
          </div>
          <div style={{background:"#1e293b",borderRadius:"10px",padding:"1.25rem",border:"1px solid #334155"}}>
            <div style={{color:"#f8fafc",fontWeight:"700",marginBottom:"0.5rem"}}>stdio (Standard I/O)</div>
            <div style={{color:"#64748b",fontSize:"0.73rem",marginBottom:"0.75rem"}}>Used by Claude Desktop, Cursor</div>
            <div style={{color:"#94a3b8",fontSize:"0.78rem",lineHeight:"1.7"}}>
              MCP server is a subprocess.<br/>
              Client spawns it and pipes stdin/stdout.<br/>
              No HTTP, no ports, just text in/out.<br/><br/>
              <span style={{color:"#86efac"}}>Simple, no network needed</span><br/>
              <span style={{color:"#86efac"}}>Used by Claude Desktop apps</span><br/>
              <span style={{color:"#f87171"}}>Local only, one client at a time</span>
            </div>
            <div style={{marginTop:"0.75rem",background:"#0f172a",borderRadius:"6px",padding:"0.6rem"}}>
              <code style={{color:"#94a3b8",fontSize:"0.68rem",fontFamily:"monospace"}}>command: 'python mcp_server.py'</code>
            </div>
          </div>
        </div>
        <div style={{background:"#0f172a",borderRadius:"8px",padding:"1rem",border:"1px solid #334155",marginBottom:"1rem"}}>
          <div style={{color:"#a855f7",fontSize:"0.78rem",fontWeight:"700",marginBottom:"0.5rem"}}>Claude Desktop uses stdio — this is how it connects to your MCP server:</div>
          <pre style={{color:"#86efac",fontSize:"0.7rem",lineHeight:"1.7",margin:0}}>{`// ~/.claude/claude_desktop_config.json
{
  "mcpServers": {
    "market-analyst": {
      "command": "python",
      "args": ["/path/to/your/mcp_server.py"],
      "transport": "stdio"
    }
  }
}`}</pre>
        </div>
        <div style={{background:"#1e293b",borderRadius:"8px",padding:"1rem",border:"1px solid #a855f7"}}>
          <div style={{color:"#a855f7",fontWeight:"700",fontSize:"0.8rem",marginBottom:"0.4rem"}}>Quick decision guide:</div>
          <div style={{color:"#94a3b8",fontSize:"0.8rem",lineHeight:"1.8"}}>
            Building a web app (like yours)? Use <strong style={{color:"#f8fafc"}}>SSE</strong><br/>
            Building a Claude Desktop or Cursor plugin? Use <strong style={{color:"#f8fafc"}}>stdio</strong><br/>
            Want both? FastMCP supports both from the same server
          </div>
        </div>
      </div>
    )
  },
  {
    id: "how-together",
    emoji: "🧩",
    title: "How LangChain + LangGraph + MCP Work Together",
    color: "#f97316",
    content: (
      <div>
        <p style={{lineHeight:"1.7",marginBottom:"1rem",color:"#94a3b8"}}>
          They each solve a different layer of the problem. Here is the complete picture:
        </p>
        <div style={{background:"#0f172a",borderRadius:"8px",padding:"1.25rem",marginBottom:"1.25rem",border:"1px solid #334155"}}>
          <pre style={{color:"#94a3b8",fontSize:"0.72rem",lineHeight:"2.0",margin:0,overflow:"auto"}}>{`USER: "What signal was there on April 17?"

+---------------------------------------------------------------+
|  LANGGRAPH (the brain / orchestrator)                         |
|                                                               |
|  1. router_node: "This is a local query"                      |
|  2. agent_node: LLM sees query + system prompt                |
|     +-- decides: "I should call mcp_read_signals_csv"         |
|  3. tools_node: -----> sends tool call to MCP SERVER          |
|                                                               |
|  +----------------------------------------------------------+  |
|  |  MCP SERVER (the hands / tool executor)                  |  |
|  |                                                          |  |
|  |  receives: mcp_read_signals_csv(date="17-04-2026")       |  |
|  |  runs:     opens signals.csv, finds row, returns result  |  |
|  |  returns:  "Candle Signal: Green, Bias: BULLISH"         |  |
|  +----------------------------------------------------------+  |
|                                                               |
|  4. validator_node: "Result looks good, proceed"              |
|  5. writer_node: LLM writes clean answer using result         |
+---------------------------------------------------------------+

LANGCHAIN (the connectors) used throughout:
  ChatGroq wrapper  -> calls Groq API for the LLM steps
  llm.bind_tools()  -> tells LLM about the MCP tools
  SystemMessage     -> formats prompts correctly
  FAISS wrapper     -> powers the vector search in MCP server

FINAL ANSWER: "On April 17, 2026, the signal was Green (Bullish).
               Recommended strategy: Sell Put / Buy Call."`}</pre>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"0.75rem",marginBottom:"1rem"}}>
          {[
            {lib:"LangChain",role:"Connectors & Wrappers",analogy:"The cables and adapters",color:"#22c55e"},
            {lib:"LangGraph",role:"Orchestrator & Flow",analogy:"The project manager",color:"#6366f1"},
            {lib:"MCP",role:"Tool Protocol & Executor",analogy:"The worker with tools",color:"#f59e0b"},
          ].map(l=>(
            <div key={l.lib} style={{background:"#1e293b",borderRadius:"8px",padding:"1rem",border:`1px solid ${l.color}`,textAlign:"center"}}>
              <div style={{color:l.color,fontWeight:"700",fontSize:"0.9rem",marginBottom:"0.3rem"}}>{l.lib}</div>
              <div style={{color:"#f8fafc",fontSize:"0.75rem",marginBottom:"0.4rem"}}>{l.role}</div>
              <div style={{color:"#64748b",fontSize:"0.7rem",fontStyle:"italic"}}>{l.analogy}</div>
            </div>
          ))}
        </div>
        <div style={{background:"#1e293b",borderRadius:"8px",padding:"1rem",border:"1px solid #f97316"}}>
          <div style={{color:"#fb923c",fontWeight:"700",fontSize:"0.8rem",marginBottom:"0.5rem"}}>Could you replace any of them?</div>
          <div style={{display:"grid",gap:"0.4rem",fontSize:"0.78rem",color:"#94a3b8",lineHeight:"1.6"}}>
            <div><strong style={{color:"#f8fafc"}}>Replace LangChain?</strong> Yes — use raw Groq SDK plus numpy. More code but doable.</div>
            <div><strong style={{color:"#f8fafc"}}>Replace LangGraph?</strong> Yes — use a while loop plus if/else. But you lose checkpointing, streaming, and clean state management.</div>
            <div><strong style={{color:"#f8fafc"}}>Replace MCP?</strong> Yes — just import the functions directly. But you lose isolation, reusability, and ability to connect Claude Desktop.</div>
          </div>
        </div>
      </div>
    )
  }
];

export default function Explainer() {
  const [active, setActive] = useState("langchain");
  const current = sections.find(s => s.id === active);

  return (
    <div style={{
      background:"#0a0f1a",
      minHeight:"100vh",
      fontFamily:"'Courier New', monospace",
      color:"#f8fafc",
      display:"flex",
      flexDirection:"column",
    }}>
      <div style={{
        padding:"1.25rem 2rem 1rem",
        borderBottom:"1px solid #1e293b",
        background:"#050a12"
      }}>
        <div style={{display:"flex",alignItems:"center",gap:"0.75rem",marginBottom:"0.2rem"}}>
          <span style={{fontSize:"1.4rem"}}>🧠</span>
          <h1 style={{margin:0,fontSize:"1.15rem",fontWeight:"700"}}>LangChain · LangGraph · MCP</h1>
          <span style={{background:"#1e293b",color:"#64748b",fontSize:"0.62rem",padding:"2px 8px",borderRadius:"4px"}}>deep dive</span>
        </div>
        <p style={{margin:0,color:"#475569",fontSize:"0.72rem"}}>What each library does, why client-server, custom vs pre-built tools</p>
      </div>

      <div style={{display:"flex",flex:1,minHeight:0}}>
        <div style={{
          width:"200px",
          flexShrink:0,
          borderRight:"1px solid #1e293b",
          padding:"0.75rem 0.6rem",
          overflowY:"auto",
          background:"#050a12"
        }}>
          {sections.map(s=>(
            <button
              key={s.id}
              onClick={()=>setActive(s.id)}
              style={{
                display:"flex",
                alignItems:"center",
                gap:"0.5rem",
                width:"100%",
                padding:"0.55rem 0.7rem",
                borderRadius:"6px",
                border:"none",
                cursor:"pointer",
                background:active===s.id?s.color+"18":"transparent",
                borderLeft:active===s.id?`3px solid ${s.color}`:"3px solid transparent",
                color:active===s.id?"#f8fafc":"#475569",
                textAlign:"left",
                fontSize:"0.72rem",
                marginBottom:"0.2rem",
                lineHeight:"1.3"
              }}
            >
              <span style={{flexShrink:0,fontSize:"1rem"}}>{s.emoji}</span>
              <span>{s.title.split(" — ")[0].split("–")[0].trim()}</span>
            </button>
          ))}
        </div>

        <div style={{flex:1,overflowY:"auto",padding:"1.5rem 2rem"}}>
          <div style={{display:"flex",alignItems:"center",gap:"0.75rem",marginBottom:"1.25rem"}}>
            <span style={{fontSize:"1.6rem"}}>{current.emoji}</span>
            <h2 style={{margin:0,fontSize:"1rem",fontWeight:"700",color:current.color,lineHeight:"1.4"}}>{current.title}</h2>
          </div>
          {current.content}
        </div>
      </div>
    </div>
  );
}
