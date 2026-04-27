import { useState } from "react";

const sections = [
  {
    id: "why-llm",
    emoji: "🤔",
    title: "Why Not Just Read a File Directly?",
    color: "#f97316",
    content: (
      <div>
        <p style={{marginBottom:"1rem",lineHeight:"1.7"}}>
          Great question. You <em>can</em> read a key-value file directly — and for tiny datasets, you should! 
          But imagine your "file" is actually:
        </p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.75rem",marginBottom:"1rem"}}>
          {[
            {icon:"📄",label:"500-page PDF earnings report"},
            {icon:"🗄️",label:"10,000 rows of trade records"},
            {icon:"📰",label:"100 news articles from the web"},
            {icon:"📊",label:"Mixed PDFs, CSVs, Excel files"},
          ].map(i=>(
            <div key={i.label} style={{background:"#1e293b",padding:"0.75rem",borderRadius:"8px",display:"flex",alignItems:"center",gap:"0.5rem",fontSize:"0.85rem"}}>
              <span style={{fontSize:"1.5rem"}}>{i.icon}</span><span style={{color:"#94a3b8"}}>{i.label}</span>
            </div>
          ))}
        </div>
        <p style={{lineHeight:"1.7",color:"#94a3b8"}}>
          You <strong style={{color:"#f8fafc"}}>can't dump all of that into a prompt</strong> — LLMs have token limits (typically 8k–128k tokens). 
          RAG solves this by <strong style={{color:"#f97316"}}>fetching only the relevant parts</strong> before sending to the LLM.
        </p>
        <div style={{marginTop:"1rem",background:"#0f172a",border:"1px solid #334155",borderRadius:"8px",padding:"1rem"}}>
          <div style={{color:"#f97316",fontFamily:"monospace",fontSize:"0.85rem",marginBottom:"0.5rem"}}>// Key-Value (works fine when small)</div>
          <code style={{color:"#86efac",fontSize:"0.8rem",fontFamily:"monospace"}}>
            {"const data = {AAPL: 182.3, MSFT: 420.1};\nconsole.log(data['AAPL']); // ✅ instant, no AI needed"}
          </code>
          <div style={{color:"#f97316",fontFamily:"monospace",fontSize:"0.85rem",marginTop:"1rem",marginBottom:"0.5rem"}}>// RAG (needed when data is large & semantic)</div>
          <code style={{color:"#86efac",fontSize:"0.8rem",fontFamily:"monospace"}}>
            {"query = 'What was Accenture revenue last quarter?'\n// → searches 500 docs → finds 3 relevant chunks\n// → sends only those 3 chunks to the LLM 🎯"}
          </code>
        </div>
      </div>
    )
  },
  {
    id: "overview",
    emoji: "🗺️",
    title: "The Full RAG Pipeline — Bird's Eye View",
    color: "#6366f1",
    content: (
      <div>
        <p style={{marginBottom:"1.5rem",lineHeight:"1.7",color:"#94a3b8"}}>
          RAG has two completely separate phases. Most confusion comes from mixing them up.
        </p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1rem"}}>
          <div style={{background:"#1e293b",borderRadius:"10px",padding:"1.25rem",border:"1px solid #7c3aed"}}>
            <div style={{color:"#a78bfa",fontWeight:"700",marginBottom:"0.75rem",fontSize:"1rem"}}>📦 PHASE 1: Indexing</div>
            <div style={{color:"#64748b",fontSize:"0.75rem",marginBottom:"0.75rem"}}>(happens ONCE, offline)</div>
            {["1. Read your files (PDF, CSV, Excel)","2. Split into chunks","3. Convert chunks to numbers (embeddings)","4. Store numbers in Vector DB"].map((s,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"0.5rem",fontSize:"0.82rem",color:"#c4b5fd"}}>
                <span style={{background:"#7c3aed",borderRadius:"50%",width:"18px",height:"18px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.65rem",flexShrink:0}}>{i+1}</span>
                {s.replace(/^\d\. /,"")}
              </div>
            ))}
          </div>
          <div style={{background:"#1e293b",borderRadius:"10px",padding:"1.25rem",border:"1px solid #0891b2"}}>
            <div style={{color:"#67e8f9",fontWeight:"700",marginBottom:"0.75rem",fontSize:"1rem"}}>🔍 PHASE 2: Retrieval</div>
            <div style={{color:"#64748b",fontSize:"0.75rem",marginBottom:"0.75rem"}}>(happens on EVERY query)</div>
            {["1. User asks a question","2. Convert question to numbers too","3. Find closest numbers in DB","4. Send top-k chunks + question to LLM"].map((s,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"0.5rem",fontSize:"0.82rem",color:"#a5f3fc"}}>
                <span style={{background:"#0891b2",borderRadius:"50%",width:"18px",height:"18px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.65rem",flexShrink:0}}>{i+1}</span>
                {s.replace(/^\d\. /,"")}
              </div>
            ))}
          </div>
        </div>
        <div style={{marginTop:"1.25rem",background:"#0f172a",borderRadius:"8px",padding:"1rem",border:"1px solid #334155"}}>
          <div style={{color:"#64748b",fontSize:"0.75rem",marginBottom:"0.5rem"}}>MERMAID FLOW</div>
          <pre style={{color:"#86efac",fontSize:"0.72rem",lineHeight:"1.6",overflow:"auto"}}>{`Files (PDF/CSV/Excel)
      │
      ▼
  [Chunking] ─── Split into small pieces (500-1000 chars)
      │
      ▼
  [Embeddings] ── Each chunk → [0.12, -0.87, 0.45, ...] (vector)
      │
      ▼
  [FAISS/Pinecone] ── Store all vectors in Vector DB
      
  ════════════════ QUERY TIME ════════════════
  
  User: "What was Accenture Q2 revenue?"
      │
      ▼
  [Embed Query] ── Question → [0.11, -0.91, 0.42, ...]
      │
      ▼
  [Vector Search] ── Find top-k nearest vectors (k=5 in your code)
      │
      ▼
  [Retrieved Chunks] ── "$18.0B revenue, 8% increase..."
      │
      ▼
  [LLM Prompt] ── "Given this context: {chunks}, answer: {question}"
      │
      ▼
  [Answer] ── "Accenture's Q2 FY26 revenue was $18.0 billion"`}</pre>
        </div>
      </div>
    )
  },
  {
    id: "embeddings",
    emoji: "🔢",
    title: "What ARE Embeddings? (Simply Explained)",
    color: "#10b981",
    content: (
      <div>
        <p style={{lineHeight:"1.7",marginBottom:"1rem",color:"#94a3b8"}}>
          An embedding is just a <strong style={{color:"#f8fafc"}}>list of floating point numbers</strong> that captures the "meaning" of text.
          Similar meaning = similar numbers. This is the magic.
        </p>
        <div style={{background:"#0f172a",borderRadius:"8px",padding:"1rem",marginBottom:"1rem",border:"1px solid #334155"}}>
          <code style={{color:"#86efac",fontSize:"0.78rem",fontFamily:"monospace",lineHeight:"1.8"}}>
            {`"Accenture Q2 revenue $18 billion"
→ [0.12, -0.87, 0.45, 0.33, 0.91, -0.22, ...] (1536 numbers)

"What were Accenture's Q2 earnings?"  
→ [0.11, -0.91, 0.42, 0.35, 0.88, -0.19, ...] (very similar!)

"My cat likes fish"
→ [0.88, 0.22, -0.67, -0.11, 0.03, 0.55, ...] (very different!)`}
          </code>
        </div>
        <div style={{marginBottom:"1rem"}}>
          <div style={{color:"#10b981",fontWeight:"700",marginBottom:"0.75rem"}}>Available Embedding Models (your code uses Gemini):</div>
          <div style={{display:"grid",gap:"0.5rem"}}>
            {[
              {name:"Google Gemini gemini-embedding-001",dims:"3072",cost:"Paid",quality:"⭐⭐⭐⭐⭐",note:"Used in your code"},
              {name:"OpenAI text-embedding-3-small",dims:"1536",cost:"Paid",quality:"⭐⭐⭐⭐",note:"Most popular"},
              {name:"Sentence-Transformers (local)",dims:"384",cost:"Free",quality:"⭐⭐⭐",note:"all-MiniLM-L6-v2"},
              {name:"Ollama nomic-embed-text",dims:"768",cost:"Free",quality:"⭐⭐⭐⭐",note:"Fully offline"},
              {name:"HuggingFace BGE-large",dims:"1024",cost:"Free",quality:"⭐⭐⭐⭐",note:"Open source"},
            ].map(e=>(
              <div key={e.name} style={{background:"#1e293b",borderRadius:"6px",padding:"0.6rem 0.85rem",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"0.25rem"}}>
                <div>
                  <span style={{color:"#f8fafc",fontSize:"0.8rem"}}>{e.name}</span>
                  {e.note==="Used in your code" && <span style={{background:"#10b981",color:"#000",fontSize:"0.6rem",padding:"1px 5px",borderRadius:"3px",marginLeft:"6px"}}>YOUR CODE</span>}
                </div>
                <div style={{display:"flex",gap:"0.5rem",fontSize:"0.72rem"}}>
                  <span style={{color:"#64748b"}}>{e.dims}d</span>
                  <span style={{color:e.cost==="Free"?"#10b981":"#f97316"}}>{e.cost}</span>
                  <span>{e.quality}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{background:"#1e293b",borderRadius:"8px",padding:"1rem",border:"1px solid #10b981"}}>
          <div style={{color:"#10b981",fontSize:"0.8rem",fontWeight:"700",marginBottom:"0.5rem"}}>✅ Rule of thumb:</div>
          <div style={{color:"#94a3b8",fontSize:"0.8rem",lineHeight:"1.7"}}>
            More dimensions = better semantic understanding, but slower & more expensive.<br/>
            For small projects: use free Sentence-Transformers locally.<br/>
            For production: OpenAI or Gemini embeddings.
          </div>
        </div>
      </div>
    )
  },
  {
    id: "chunking",
    emoji: "✂️",
    title: "Chunking — Why Split Documents?",
    color: "#ec4899",
    content: (
      <div>
        <p style={{lineHeight:"1.7",marginBottom:"1rem",color:"#94a3b8"}}>
          You can't embed a 500-page PDF as one blob — it would be too big AND the embedding would lose specificity.
          Chunking breaks it into digestible pieces.
        </p>
        <div style={{marginBottom:"1rem"}}>
          <div style={{color:"#ec4899",fontWeight:"700",marginBottom:"0.75rem"}}>Types of Chunking:</div>
          <div style={{display:"grid",gap:"0.6rem"}}>
            {[
              {
                name:"Fixed Size (Character)",
                code:'RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)',
                pro:"Simple, predictable",
                con:"May cut mid-sentence",
                used:true
              },
              {
                name:"Sentence-aware",
                code:'SentenceTransformersTokenTextSplitter()',
                pro:"Never breaks sentences",
                con:"Variable chunk sizes",
                used:false
              },
              {
                name:"Semantic Chunking",
                code:'SemanticChunker(embeddings)',
                pro:"Groups related ideas",
                con:"Slower, more complex",
                used:false
              },
              {
                name:"Recursive (your code!)",
                code:'RecursiveCharacterTextSplitter()',
                pro:"Tries [\\n\\n, \\n, . , ] in order",
                con:"Still heuristic-based",
                used:true
              },
            ].map(c=>(
              <div key={c.name} style={{background:"#1e293b",borderRadius:"6px",padding:"0.75rem",border:c.used?"1px solid #ec4899":"1px solid transparent"}}>
                <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"0.35rem"}}>
                  <span style={{color:"#f8fafc",fontWeight:"600",fontSize:"0.82rem"}}>{c.name}</span>
                  {c.used && <span style={{background:"#ec4899",color:"#000",fontSize:"0.58rem",padding:"1px 5px",borderRadius:"3px"}}>USED</span>}
                </div>
                <code style={{color:"#86efac",fontSize:"0.7rem",fontFamily:"monospace",display:"block",marginBottom:"0.35rem"}}>{c.code}</code>
                <div style={{display:"flex",gap:"1rem",fontSize:"0.72rem"}}>
                  <span style={{color:"#10b981"}}>✓ {c.pro}</span>
                  <span style={{color:"#f87171"}}>✗ {c.con}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{background:"#0f172a",borderRadius:"8px",padding:"1rem",border:"1px solid #334155"}}>
          <div style={{color:"#ec4899",fontSize:"0.8rem",fontWeight:"700",marginBottom:"0.5rem"}}>chunk_overlap explained:</div>
          <pre style={{color:"#94a3b8",fontSize:"0.75rem",lineHeight:"1.7"}}>{`chunk_size=1000, chunk_overlap=100:

Chunk 1: "...Accenture reported record bookings of $22.1 billion for Q2 FY26. 
         The revenues reached $18.0 billion, an 8% increase..."  ← 1000 chars

Chunk 2: "...an 8% increase. CEO Julie Sweet noted AI-driven growth..."  
                ↑ these 100 chars repeat in both chunks

Why overlap? So context isn't lost at chunk boundaries!`}</pre>
        </div>
      </div>
    )
  },
  {
    id: "vectordb",
    emoji: "🗄️",
    title: "Vector Database — Why Not Just a Regular DB?",
    color: "#f59e0b",
    content: (
      <div>
        <p style={{lineHeight:"1.7",marginBottom:"1rem",color:"#94a3b8"}}>
          A regular SQL database does <strong style={{color:"#f8fafc"}}>exact match lookups</strong>. 
          A vector database does <strong style={{color:"#f8fafc"}}>similarity searches</strong> using math.
        </p>
        <div style={{background:"#0f172a",borderRadius:"8px",padding:"1rem",marginBottom:"1rem",border:"1px solid #334155"}}>
          <pre style={{color:"#86efac",fontSize:"0.75rem",lineHeight:"1.8"}}>{`-- SQL (exact match only):
SELECT * FROM docs WHERE text LIKE '%Accenture%';
-- ❌ Misses: "ACN", "the consulting firm", "Julie Sweet's company"

-- Vector DB (semantic similarity):
query_vector = embed("What is Accenture's revenue?")
results = faiss.search(query_vector, k=5)
-- ✅ Finds all semantically related chunks regardless of exact words`}</pre>
        </div>
        <div style={{marginBottom:"1rem"}}>
          <div style={{color:"#f59e0b",fontWeight:"700",marginBottom:"0.75rem"}}>Popular Vector Databases:</div>
          <div style={{display:"grid",gap:"0.5rem"}}>
            {[
              {name:"FAISS (Facebook)",type:"In-memory / File",cloud:"No",note:"Used in your code — fast, no server needed"},
              {name:"Chroma",type:"Local / Embedded",cloud:"No","note":"Great for dev, simple setup"},
              {name:"Pinecone",type:"Cloud",cloud:"Yes",note:"Production-grade, fully managed"},
              {name:"Weaviate",type:"Self-hosted / Cloud",cloud:"Both",note:"GraphQL interface"},
              {name:"Qdrant",type:"Self-hosted / Cloud",cloud:"Both",note:"Rust-based, very fast"},
            ].map(v=>(
              <div key={v.name} style={{background:"#1e293b",borderRadius:"6px",padding:"0.6rem 0.85rem",display:"flex",justifyContent:"space-between",alignItems:"center",gap:"0.5rem",flexWrap:"wrap"}}>
                <div>
                  <span style={{color:"#f8fafc",fontSize:"0.8rem"}}>{v.name}</span>
                  {v.note.includes("your code") && <span style={{background:"#f59e0b",color:"#000",fontSize:"0.6rem",padding:"1px 5px",borderRadius:"3px",marginLeft:"6px"}}>YOUR CODE</span>}
                </div>
                <span style={{color:"#64748b",fontSize:"0.72rem"}}>{v.note}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{background:"#1e293b",borderRadius:"8px",padding:"1rem",border:"1px solid #f59e0b"}}>
          <div style={{color:"#f59e0b",fontSize:"0.8rem",fontWeight:"700",marginBottom:"0.5rem"}}>Can you go Vector-DB-less?</div>
          <div style={{color:"#94a3b8",fontSize:"0.8rem",lineHeight:"1.7"}}>
            <strong style={{color:"#f8fafc"}}>Yes!</strong> If your data is small (&lt;200 chunks), you can compute similarity in pure Python with numpy 
            using cosine similarity. No FAISS needed. But it gets slow fast.
          </div>
          <div style={{background:"#0f172a",borderRadius:"6px",padding:"0.75rem",marginTop:"0.75rem"}}>
            <code style={{color:"#86efac",fontSize:"0.72rem",fontFamily:"monospace"}}>
              {`import numpy as np

def cosine_sim(a, b):
    return np.dot(a,b) / (np.linalg.norm(a) * np.linalg.norm(b))

# Find top-3 most similar chunks manually
scores = [(i, cosine_sim(query_vec, chunk_vec)) 
          for i, chunk_vec in enumerate(all_vecs)]
top3 = sorted(scores, key=lambda x: -x[1])[:3]`}
            </code>
          </div>
        </div>
      </div>
    )
  },
  {
    id: "topk",
    emoji: "🎯",
    title: "What is top-k? (k=5 in your code)",
    color: "#8b5cf6",
    content: (
      <div>
        <p style={{lineHeight:"1.7",marginBottom:"1rem",color:"#94a3b8"}}>
          When you search a vector DB, you get back the <strong style={{color:"#f8fafc"}}>k most similar chunks</strong> to your query. 
          In your code: <code style={{color:"#86efac",background:"#0f172a",padding:"2px 6px",borderRadius:"4px"}}>retriever = vector_db.as_retriever(search_kwargs={"{"}\"k\": 5{"}"})</code>
        </p>
        <div style={{background:"#0f172a",borderRadius:"8px",padding:"1rem",marginBottom:"1rem",border:"1px solid #334155"}}>
          <pre style={{color:"#94a3b8",fontSize:"0.75rem",lineHeight:"1.9"}}>{`Query: "What is Accenture's Q2 revenue?"
Query vector: [0.11, -0.91, 0.42, ...]

All chunks in DB (sorted by similarity):
┌────┬─────────────────────────────────────────────┬──────────┐
│ #  │ Chunk                                       │ Score    │
├────┼─────────────────────────────────────────────┼──────────┤
│ 1  │ "Accenture Q2 revenues reached $18.0B..."   │  0.97 ✅  │ ← k=1
│ 2  │ "CEO Julie Sweet noted AI-driven growth"    │  0.91 ✅  │ ← k=2
│ 3  │ "Record bookings of $22.1B for Q2 FY26"     │  0.89 ✅  │ ← k=3
│ 4  │ "Dividend of $1.63 per share..."            │  0.72 ✅  │ ← k=4
│ 5  │ "Defense sector robotics supply chains..."  │  0.68 ✅  │ ← k=5
│ 6  │ "Gold is a safe-haven asset..."             │  0.31 ❌  │
│ 7  │ "Copper is conductive metal..."             │  0.18 ❌  │
└────┴─────────────────────────────────────────────┴──────────┘
                              Only top 5 sent to LLM ↑`}</pre>
        </div>
        <div style={{background:"#1e293b",borderRadius:"8px",padding:"1rem",border:"1px solid #8b5cf6"}}>
          <div style={{color:"#a78bfa",fontWeight:"700",marginBottom:"0.5rem"}}>How to choose k?</div>
          <div style={{display:"grid",gap:"0.5rem"}}>
            {[
              {k:"k=1-3",use:"Quick factual lookups, when you trust your data is clean"},
              {k:"k=5",use:"Balanced (your code's choice) — good default"},
              {k:"k=10+",use:"Complex questions needing multiple sources"},
              {k:"Too high",use:"❌ Floods LLM with noise, reduces answer quality"},
            ].map(r=>(
              <div key={r.k} style={{display:"flex",gap:"1rem",alignItems:"flex-start",fontSize:"0.8rem"}}>
                <code style={{color:"#c4b5fd",background:"#0f172a",padding:"2px 8px",borderRadius:"4px",whiteSpace:"nowrap",fontFamily:"monospace"}}>{r.k}</code>
                <span style={{color:"#94a3b8"}}>{r.use}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  },
  {
    id: "code",
    emoji: "💻",
    title: "Step-by-Step Code Walkthrough",
    color: "#06b6d4",
    content: (
      <div>
        <p style={{lineHeight:"1.7",marginBottom:"1rem",color:"#94a3b8"}}>
          Here's your exact codebase explained line by line, with the simplest possible RAG you could write yourself.
        </p>
        <div style={{display:"grid",gap:"1rem"}}>
          {[
            {
              step:"STEP 1: ingest.py — Build the index (runs once)",
              code:`# 1. Load your files
loader = PyPDFLoader("accenture_report.pdf")
docs = loader.load()   # → list of Document objects

# 2. Split into chunks
splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000,    # max 1000 chars per chunk
    chunk_overlap=100   # 100 char overlap between chunks
)
chunks = splitter.split_documents(docs)
# → ["Accenture Q2 revenues reached $18B...", 
#    "...18B, an 8% increase. CEO Julie...", ...]

# 3. Create embeddings (convert text → vectors)
embeddings = GoogleGenerativeAIEmbeddings(
    model="models/gemini-embedding-001"
)

# 4. Store in FAISS (builds the searchable index)
vector_db = FAISS.from_documents(chunks, embeddings)
vector_db.save_local("faiss_index")  # saved to disk!`,
              color:"#7c3aed"
            },
            {
              step:"STEP 2: mcp_server.py — Load & Search",
              code:`# 1. Load the saved index at startup
vector_db = FAISS.load_local(
    "faiss_index",
    embeddings,
    allow_dangerous_deserialization=True
)

# 2. Create a retriever with k=5
retriever = vector_db.as_retriever(search_kwargs={"k": 5})

# 3. Search when tool is called
@mcp.tool()
def mcp_search_corporate_records(query: str) -> str:
    docs = retriever.invoke(query)
    # → retriever: embeds query, finds top-5 similar chunks
    return "\\n\\n".join([d.page_content for d in docs])`,
              color:"#0891b2"
            },
            {
              step:"STEP 3: main.py — LLM uses the retrieved context",
              code:`# LLM gets: system_prompt + retrieved_chunks + user_question
# The agent_node calls the MCP tool, which does the retrieval

system_prompt = """You are a Market Analyst.
Use your MCP tools when factual lookup is needed."""

# LangGraph flow:
# user question → router → agent → [calls mcp tool] 
#              → gets chunks → writer → final answer

# Simplified manually:
user_q = "What is Accenture Q2 revenue?"
chunks = mcp_search_corporate_records(user_q)
# chunks = "Accenture Q2 revenues reached $18.0 billion..."

prompt = f"Context: {chunks}\\nQuestion: {user_q}"
answer = llm.invoke(prompt)
# → "Based on the Q2 FY26 report, Accenture's revenue was $18.0B"`,
              color:"#10b981"
            },
          ].map(s=>(
            <div key={s.step} style={{background:"#0f172a",borderRadius:"8px",border:`1px solid ${s.color}`,overflow:"hidden"}}>
              <div style={{background:s.color,padding:"0.5rem 1rem",fontSize:"0.78rem",fontWeight:"700",color:"#fff"}}>{s.step}</div>
              <pre style={{padding:"1rem",color:"#86efac",fontSize:"0.72rem",lineHeight:"1.7",overflow:"auto",margin:0}}>{s.code}</pre>
            </div>
          ))}
        </div>
      </div>
    )
  },
  {
    id: "rag-types",
    emoji: "📚",
    title: "Types of RAG — Which One Are You Using?",
    color: "#14b8a6",
    content: (
      <div>
        <p style={{lineHeight:"1.7",marginBottom:"1rem",color:"#94a3b8"}}>Your code uses a hybrid of multiple RAG patterns.</p>
        <div style={{display:"grid",gap:"0.75rem"}}>
          {[
            {
              name:"Naive RAG",
              desc:"Simple: embed → store → query → retrieve → LLM",
              yours:false,
              badge:"Basic"
            },
            {
              name:"Agentic RAG",
              desc:"LLM decides WHICH tool to call (local vs web vs CSV). Your router_node + agent_node does this.",
              yours:true,
              badge:"Your code ✅"
            },
            {
              name:"Hybrid RAG",
              desc:"Combines keyword search (BM25) + vector search. Better recall. Not in your code but easy to add.",
              yours:false,
              badge:"Upgrade option"
            },
            {
              name:"Self-RAG",
              desc:"LLM checks its own answer quality and re-retrieves if unsure. Your validator_node does this!",
              yours:true,
              badge:"Your code ✅"
            },
            {
              name:"Graph RAG",
              desc:"Builds knowledge graphs instead of flat chunks. Great for highly interconnected data.",
              yours:false,
              badge:"Advanced"
            },
          ].map(r=>(
            <div key={r.name} style={{background:"#1e293b",borderRadius:"8px",padding:"0.85rem",border:r.yours?"1px solid #14b8a6":"1px solid #1e293b",display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:"0.5rem"}}>
              <div>
                <div style={{color:"#f8fafc",fontWeight:"600",fontSize:"0.85rem",marginBottom:"0.25rem"}}>{r.name}</div>
                <div style={{color:"#64748b",fontSize:"0.78rem",lineHeight:"1.5"}}>{r.desc}</div>
              </div>
              <span style={{background:r.yours?"#14b8a6":"#334155",color:r.yours?"#000":"#94a3b8",fontSize:"0.6rem",padding:"2px 8px",borderRadius:"4px",whiteSpace:"nowrap",flexShrink:0}}>{r.badge}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }
];

export default function RAGExplainer() {
  const [active, setActive] = useState("why-llm");
  const current = sections.find(s => s.id === active);

  return (
    <div style={{
      background:"#0f172a",
      minHeight:"100vh",
      fontFamily:"'Courier New', monospace",
      color:"#f8fafc",
      display:"flex",
      flexDirection:"column",
    }}>
      {/* Header */}
      <div style={{
        padding:"1.5rem 2rem 1rem",
        borderBottom:"1px solid #1e293b",
        background:"#080f1a"
      }}>
        <div style={{display:"flex",alignItems:"center",gap:"0.75rem",marginBottom:"0.25rem"}}>
          <span style={{fontSize:"1.5rem"}}>🧠</span>
          <h1 style={{margin:0,fontSize:"1.25rem",fontWeight:"700",letterSpacing:"-0.02em"}}>
            RAG Deep Dive
          </h1>
          <span style={{background:"#1e293b",color:"#64748b",fontSize:"0.65rem",padding:"2px 8px",borderRadius:"4px",fontFamily:"monospace"}}>for novice devs</span>
        </div>
        <p style={{margin:0,color:"#475569",fontSize:"0.75rem"}}>
          How your Market Analyst AI actually works — embeddings, chunking, vector DBs & more
        </p>
      </div>

      <div style={{display:"flex",flex:1,minHeight:0}}>
        {/* Sidebar */}
        <div style={{
          width:"220px",
          flexShrink:0,
          borderRight:"1px solid #1e293b",
          padding:"0.75rem",
          overflowY:"auto",
          background:"#080f1a"
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
                padding:"0.6rem 0.75rem",
                borderRadius:"6px",
                border:"none",
                cursor:"pointer",
                background:active===s.id?s.color+"22":"transparent",
                borderLeft:active===s.id?`3px solid ${s.color}`:"3px solid transparent",
                color:active===s.id?"#f8fafc":"#64748b",
                textAlign:"left",
                fontSize:"0.75rem",
                marginBottom:"0.25rem",
                transition:"all 0.15s",
                lineHeight:"1.3"
              }}
            >
              <span style={{flexShrink:0}}>{s.emoji}</span>
              <span>{s.title.split(" — ")[0].replace(/[🤔🗺️🔢✂️🗄️🎯💻📚]/g,"").trim()}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{flex:1,overflowY:"auto",padding:"1.5rem 2rem"}}>
          <div style={{display:"flex",alignItems:"center",gap:"0.75rem",marginBottom:"1.25rem"}}>
            <span style={{fontSize:"1.75rem"}}>{current.emoji}</span>
            <h2 style={{margin:0,fontSize:"1.1rem",fontWeight:"700",color:current.color}}>{current.title}</h2>
          </div>
          {current.content}
        </div>
      </div>
    </div>
  );
}
