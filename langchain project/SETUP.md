# Setup — swing agent path

Everything you need to do on your end. Roughly 30 minutes, most of it waiting
on signup emails.

---

## 1. Files

Drop all six into your MarketAnalystPro project root, alongside the existing
`mcp_server.py`. None of them overwrite anything you already have.

| File              | What it does                                 | Touches your existing code?                    |
| ----------------- | -------------------------------------------- | ---------------------------------------------- |
| `scanner.py`      | Deterministic screen. No LLM.                | Writes `signals` + `scan_stats` to `memory.db` |
| `paper_broker.py` | Two paper books, stop/target/time-stop logic | Writes `paper_positions` to `memory.db`        |
| `llm_router.py`   | LiteLLM routing + daily token budget guard   | Writes `token_ledger` to `memory.db`           |
| `analyst.py`      | The one LLM node, with cache and batching    | Writes `analyst_cache` to `memory.db`          |
| `jobs.py`         | APScheduler wiring + Telegram push           | Standalone process                             |
| `.env`            | Your keys (create from the template below)   | —                                              |

All new tables use `CREATE TABLE IF NOT EXISTS`, so pointing at your existing
`memory.db` is safe. Your options-selling scheduler and its Telegram gate are
untouched — this runs as a separate process.

**One edit you must make.** In `analyst.py`, `default_retriever` returns an
empty list. Wire it to your existing FAISS tool:

```python
def default_retriever(symbol: str, k: int = RAG_TOP_K) -> list[dict]:
    hits = mcp_search_corporate_records(query=symbol, top_k=k)   # your tool
    return [{"id": h["id"], "text": h["text"]} for h in hits][:k]
```

The `[:k]` matters. Capping retrieval at 3 is where most of the token saving
comes from — if your tool ignores `top_k` and returns 10, you lose it.

---

## 2. Install

```
uv pip install litellm apscheduler pandas numpy yfinance requests
```

---

## 3. API registrations

### Required

**Google AI Studio** — `aistudio.google.com/apikey`
Free, no card. This carries the analyst and the weekly report.

You already have four keys, but **create a new project for this system** —
do not reuse `gen-lang-client-...` or `mcp project`. Gemini quotas apply per
project, so an isolated project means this cannot starve anything else no
matter how it misbehaves. That is the direct answer to your concern about
burning tokens you need for work.

**Telegram bot** — message `@BotFather` in Telegram, send `/newbot`, follow the
prompts. It returns a token. For the chat ID, message your new bot once, then
open:

```
https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates
```

and read `result[0].message.chat.id`.

You may already have both from the options job — reuse them. Use a **separate
chat or group** for this path so swing notifications don't interleave with
your live options approvals.

### Optional

**Groq** — you already have this. Nothing to do. It powers the `fast` node and
its budget is pinned at 40,000 tokens, leaving the rest of your 100,000 for the
options job.

**Mistral** — `console.mistral.ai` returns "You don't have access to this
application" on your machine. Skip it. The router drops any provider whose key
is unset and the fallback chains close over the gap, so nothing breaks. If you
later get access, just add `MISTRAL_API_KEY` and it rejoins automatically.

**Cerebras** — `cloud.cerebras.ai`. Fallback for the `fast` node. Skip on the
first pass; add it if Groq starts refusing.

### Later, before results mean anything

**Angel One SmartAPI** — `smartapi.angelbroking.com`, free with an Angel One
account. Or **Dhan**. yfinance is fine to start but quietly revises historical
bars, which silently corrupts a backtest. Swap before you trust any numbers.

---

## 4. `.env`

```
SWING_GEMINI_API_KEY=
GEMINI_API_KEY=
GROQ_API_KEY=
MISTRAL_API_KEY=
CEREBRAS_API_KEY=

TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

AGENT_DB="C:/Users/narayanan.selvaraj/python project/langchain project/app/db/memory.db"
UNIVERSE=DYCL,PRECWIRE,UNIVCABLES,POLYCAB,KEI,RRKABEL,APARINDS,FINCABLES,VGUARD,HAVELLS,CROMPTON,BAJAJELEC,VOLTAMP,TRIL,SHILCTECH
```

Use **`SWING_GEMINI_API_KEY`** for the isolated project's key, not
`GEMINI_API_KEY`. This machine defines `GEMINI_API_KEY` at the OS level
(a different key ending `...v38oSU`), and python-dotenv does not override the
real environment — so a key written into `GEMINI_API_KEY` in this file is
silently ignored and every call bills the old project. `python llm_router.py`
prints which key is actually in use.

`AGENT_DB` is the existing book at `app/db/memory.db`, which is what `main.py`
and `app/db/database.py` use. A bare `memory.db` would open a second, empty
database in the working directory.

Only a Gemini key and the two Telegram values are needed to start.
Missing keys are dropped at startup and the fallback chains close over the
gap — nothing crashes. `python llm_router.py` prints exactly which
deployments are live.

---

## 5. Verify, in this order

Each step is independently checkable. Do not skip ahead — if step 2 is wrong,
step 5 will look like an LLM problem.

```
# 1. Screen runs, no LLM involved
python -c "from scanner import scan, YFinanceSource; \
           print(scan(['DYCL','PRECWIRE'], YFinanceSource()))"

# 2. Budgets read clean, ledger is empty
python llm_router.py

# 3. Paper books open and close a trade correctly
python paper_broker.py

# 4. Telegram delivers
python -c "import jobs; jobs.notify('setup check')"

# 5. Full scan, one LLM call
python jobs.py scan

# 6. Token spend after that scan
python -c "from llm_router import daily_summary; print(daily_summary())"

# 7. Schedule shape
python jobs.py
```

Step 6 should read a few thousand tokens and 1 request on Gemini. If it reads
tens of thousands, your retriever is ignoring `k=3`.

---

## 6. Expected consumption

| Job                                         | Requests/day | Tokens/day |
| ------------------------------------------- | ------------ | ---------- |
| Scan                                        | 0            | 0          |
| Analyst (1 batched call, cache-misses only) | 0–1          | ~4,500     |
| Fill, mark-to-market, paper exits           | 0            | 0          |
| Weekly report (amortised)                   | ~0.15        | ~700       |

**Around 5,000 tokens and 1 request per trading day**, against a 150-request
daily budget.

The router guards tokens _and_ requests, because the two providers fail
differently: Gemini's free tier is request-capped with generous token limits,
Groq's is token-capped. Guarding only tokens would let a runaway loop burn a
request quota while the token counter still looked healthy. Either guard
refuses the call before it fires.

Model IDs are pinned to explicit versions (`gemini-3.6-flash`,
`gemini-3.5-flash-lite`) rather than `-latest` aliases. Google repointed those
aliases in January 2026 and retired the whole 2.0 line in June — an alias means
your analyst can silently change model overnight.

---

## 7. First fortnight

Run steps 1–4 only. Let the paper books fill with no agent involvement at all —
that costs zero tokens and tells you whether the screen has an edge. If it
doesn't, you have saved yourself the work of wiring agents that write good
prose about bad signals.

Add the analyst node in week three.
