# Market Analyst Pro

Two systems in one repository, sharing a Python environment, a React shell and a
Telegram bot, and almost nothing else.

| | **Swing agent** | **Chat app** |
| --- | --- | --- |
| Question it answers | Which NSE stock is worth a swing trade, and what did that decision earn? | What do our records, the web and our trade history say about a question? |
| Shape | A scheduled pipeline. No conversation, one LLM judgement per day | A LangGraph supervisor delegating to specialists over MCP tools |
| Entry points | `jobs.py` (CLI + scheduler), GitHub Actions | `main.py` (FastAPI), `mcp_server.py` |
| State | `app/db/swing.db` | `app/db/memory.db` + LangGraph checkpointer |
| UI | Swing tab | Chat tab |

Both are **notification-only**. Nothing here places a live order. The one path
that can — the options job in `trading.py` — is gated behind a Telegram
Approve/Reject prompt that times out to *skip*.

---

# Part 1 — The swing agent

## The method, in the order it runs

The design follows one documented idea: **pick the sector first, then the stock
inside it.** A screen run over an index is a screen with no thesis; the sector
choice is the thesis, and the screen only decides which name expresses it.

```
rules.py         the screen's thresholds, and the constitution governing changes
sectors.py       Moneycontrol sector board -> rank sectors over N sessions
universe.py      the best sector's constituents -> the day's universe
scanner.py       deterministic technical screen -> candidates (no LLM)
events.py        NSE corporate calendar -> event veto
analyst.py       ONE LLM call over all candidates -> take / watch / skip
paper_broker.py  fills at the NEXT session's open, two rule sets in parallel
jobs.py          schedules the above and reports to Telegram
eval.py          weekly: Observe, Eval, Plan, Act -> adjusts rules.py
```

### 1. The sector board — `sectors.py`

Moneycontrol renders its sector analysis into a Next.js `__NEXT_DATA__` payload
(`allSectors`, `allStocks`), so the board is read server-side rather than
scraped from rendered HTML. Boards are stored per day in `sector_board`, and
`ranked(lookback)` ranks over the sessions collected so far. The dashboard says
`ranked on N sessions` and calls it *too thin to call a trend* under five,
because a one-day leader is a headline, not a trend.

Company names map to NSE tickers through the official `EQUITY_L.csv` /
`SME_EQUITY_L.csv` listings. The matcher carries a guard worth knowing about:

```python
_MIN_REV_KEY = 8   # "sonam" (Sonam Ltd) must not swallow "sonamachinery"
```

Prefix matching on short company names silently mis-tickers stocks, and a
mis-tickered stock screens on the wrong price series.

### 2. The universe — `universe.py`

`resolve_detailed()` returns `(symbols, report)`. Modes: `sector` (default),
`sector:N`, an index name (`nifty200`), or an explicit list. Resolving costs two
HTTP requests, so it happens lazily and never at import — the dashboard, the
analyst and the tests all import `jobs`, and none of them need a sector board.

### 3. The screen — `scanner.py`

Deterministic, no LLM. The five tunable thresholds live in `rules.py` as a
database overlay on a hand-authored floor, and every `signals` row records the
rule version that produced it — `v1.0` at baseline, `v1.0+<digest>` once the
agent loop has moved something — so an outcome always attributes to the numbers
in force when it was written.

| Filter | Threshold |
| --- | --- |
| Trend | close above EMA20/50/200, stacked 20 > 50 > 200, 20 and 50 rising |
| Momentum | RSI(14) between 55 and 72 |
| Participation | volume >= 2.0x the 20-day average |
| Extension | <= 8% above EMA20 (beyond that the stop is too far) |
| Liquidity | >= Rs 2 crore daily turnover |
| Exclusions | circuit-locked bars, fewer than 220 bars of history |

Every rejection is recorded twice. `scan_stats` keeps the aggregate count by
reason, which is what makes the funnel legible: without it, "no setups today"
reads identically whether the screen swept 200 names or quietly shrank to 13
because the universe failed to load. **The size is the tell.**

`scan_rejects` keeps one row per rejected symbol with what it actually measured.
That is what the agent loop learns from, and the two are written together so
they can never disagree about a day.

### 4. The event veto — `events.py`

Board meetings and corporate actions from NSE's public JSON API, cached 12
hours. A candidate with an event inside 21 days is not taken.

Two things make it trustworthy. `event_within_21d` is **computed, never taken
from the model** — an LLM guessing at a calendar is not a veto. And when the
fetch fails the verdict is downgraded from `take` to `watch` rather than assumed
clear: unknown event risk is not the same as no event risk.

### 5. The analyst — `analyst.py`

One LLM call per day, over all candidates at once. Gemini via `llm_router.py`,
a LiteLLM Router with per-deployment budgets and fallback chains.

Two details that cost real debugging:

- **Gemini's reasoning tokens count against `max_tokens`.** A call needing ~15
  tokens of JSON was spending 396, of which 228 were reasoning, and truncating
  mid-object. Fixed with `reasoning_effort="low"` plus an explicit
  `REASONING_HEADROOM`.
- A truncated response is now reported as **truncation, by name** — not as a
  generic "unparseable response". The two have different causes and different
  fixes, and conflating them hides which one you have.

### 6. The paper books — `paper_broker.py`

Every signal opens a position in **two** books: same entry, same timing, same
Rs 1,00,000 notional.

| | FIXED | STRUCTURAL |
| --- | --- | --- |
| Stop | -7.5% | entry - 2.5 x ATR(14) |
| Target | +17.5% | 2.5 x risk (2.5R) |

Why two. A flat 7.5% stop is inside one day's range for many Indian smallcaps.
When a stop sits inside the noise you get stopped out of trades that later work,
and the log then tells you *the screen is bad* when in fact the *stop* was. You
cannot tell those apart from one portfolio's results, because you never see what
the trade would have done with more room. After roughly 30 closed trades the
difference between the books is attributable to the exit rule alone.

The dashboard shows **only FIXED** (`SHOWN_BOOK` in `SwingDashboard.js`).
STRUCTURAL still records everything — hidden, not switched off, because the
comparison cannot be reconstructed later if the data was never collected.

Shared by both: max 8 open positions, 30-session time stop. Fills happen at the
**next session's open**, never at the signal bar's close — filling at the close
of the bar that produced the signal is the most common way a paper log flatters
itself, because that price was not available when the signal appeared.

---

## Time — the part that took longest to get right

### The trading day comes from the tape, not the clock

Everything used to key off `date.today()`, which is only correct if the process
happens to wake between the close and midnight. On GitHub Actions it does not.

`scanner.session_date()` and `scanner.last_complete()` read the date off the bar
itself. Two bugs disappear at once:

- A 15:40 IST scan landing at 02:40 the next morning no longer stamps tomorrow's
  date onto today's bar.
- A run before 15:30 no longer screens a **forming** bar. A partial bar's volume
  is whatever has traded so far, so `vol_ratio` reads low and names fail
  `volume_thin` for no reason beyond the hour the runner woke up.

It is holiday-aware for free, which no weekday arithmetic ever is.

### GitHub's scheduler cannot keep time

Measured drift on this repository, cron time vs actual start:

| Window | Drift |
| --- | --- |
| 20-26 Aug | +38 min |
| 27-28 Aug | +11h 01m, +11h 55m |
| 31 Aug - 1 Sep | +6h 20m, +5h 10m |
| 2-7 Sep | steady +4h 30m |

On 7 Sep the swing fill (cron 03:46 UTC) and the options trade (03:45 UTC) both
started at 08:38 UTC. GitHub drains the batch when it chooses, so moving a cron
earlier only moves the input to a queue that ignores it. Slots can also be
dropped with no record at all.

`workflow_dispatch` does **not** go through that queue — dispatched runs start
within seconds. `ops/README.md` sets up a punctual external trigger; the
`schedule` blocks stay as a backstop.

### Which makes idempotence mandatory

Spare slots are only safe if a repeat is a no-op. `job_runs` claims a session
once its work is actually done:

```
$ python jobs.py scan
[scan] session 2026-09-04 already screened; nothing to do
```

Three deliberate exceptions:

- A **degraded** scan is not recorded. When the price source rate-limits the
  runner, the honest response to "40% of the universe would not fetch" is to let
  a later slot retry.
- The **skip path records nothing**, so idle slots leave `swing.db` untouched
  and do not produce a commit each.
- The brief refuses to send **before 09:15 IST**. A brief sent at 02:00 because
  a slot drifted past midnight is not a morning brief, and it would claim the
  day and suppress the real one.

`--force` / `FORCE_RUN=1` overrides.

## The schedule

`.github/workflows/swing.yml`, all UTC (IST = UTC+05:30):

| Job | Slots | IST |
| --- | --- | --- |
| `brief` | `46 3`, `30 4`, `30 5`, `30 7` | 09:16 / 10:00 / 11:00 / 13:00 |
| `mark scan` | `10 10`, `10 12`, `10 14` | 15:40 / 17:40 / 19:40, all post-close |
| `eval report` | `30 3 * * 6`, `30 7 * * 6` | Sat 09:00 / 13:00 |

`TZ: Asia/Kolkata` on the runner. `swing.db` is committed back after every run
that changes it.

### The morning brief

One message every weekday, sent whether or not anything happened:

```
MORNING BRIEF — 2026-09-07

LAST SCREEN — 2026-09-04 session
  Screened 8 symbols. Rejected by: illiquid 3, below ema 1, ema not rising 1, ema not stacked 1.
  TAKE      TITAGARH
            871.85 · RSI 59.7 · vol x7.86 · +3.9% vs 20EMA

AT TODAY'S OPEN
  nothing queued to fill.

OPEN POSITIONS (1)
  TITAGARH x113 @ 878.75 · SL 812.84 · TGT 1032.53 · 0/30 sessions

Next screen after today's 15:30 close.
```

It runs the fill itself, so the morning is one notification rather than two.

**Three separate notifications that each go quiet on an idle day are
indistinguishable from a dead agent.** That is the failure mode this system kept
rediscovering, and most of the reporting design exists to prevent it.

## The dashboard — `swing_routes.py` + `SwingDashboard.js`

Read-only over SQLite, except the watchlist, which is yours to edit. The page
never writes to the paper books; `jobs.py` is their sole writer.

`stale` means the screen is behind the **market**, not behind the calendar.
Comparing against `date.today()` flagged every morning before 15:30 as stale on
a system working perfectly — there is no completed bar for today before the
close, so a scan dated yesterday is current. The expected session is the later
of the cached tape value and the newest session actually screened, so it
self-corrects rather than trusting one cache to stay fresh.

The sector constituent chart shows the 5 strongest and 5 weakest names, **plus
any name that cleared the screen**, even mid-pack. A quiet day where the one
screened name moved +3.77% is exactly the case the caption warns about, so
hiding it to make room for a +13% name nothing selected would invert the
message.

---

## The agent loop

`eval.py`, weekly. Observe, Eval, Plan, Act. Two decisions define it.

### Plan is deterministic

Statistics decide, `rules.py` permits or refuses, and nothing asks a model what
to do. The system's credibility rests on the screen being versioned and
reproducible so an outcome attributes to a **rule**. An LLM choosing thresholds
each week reintroduces exactly the discretion the two-book design exists to
measure against: a rule change becomes indistinguishable from a mood, and the
system's own history stops being evidence about anything.

### Tighten or revert, never loosen past baseline

The risks are not symmetric. Tightening costs opportunity — fewer trades, and
you can see the ones you skipped. Loosening on a thin sample costs months of
worse trades and is invisible while it happens, because the losses look like
ordinary variance. **A screen dies by loosening, never by tightening.**

So `rules.BASELINE` is a floor the agent cannot cross, it may always undo its
own tightening, and a 40% drift cap stops a run of marginal evidence walking a
threshold somewhere no single proposal could have put it. Every change is
logged in `rule_history` with its evidence, and every `signals` row records the
rule version that produced it.

```
loosening below the floor        -> refused, "1.5 is below the baseline 2.0"
tightening beyond the drift cap  -> refused, "3.0 is 1.0 from the baseline..."
tightening inside the cap        -> allowed, "tighten"
reverting its own tightening     -> allowed, "revert"
```

### It does not learn from closed trades

The book closes roughly one position a week, so a 30-trade gate is most of a
year before the first finding — and by then the sector, the regime and the
universe have all moved.

It learns from **forward returns on everything the screen saw**. Each scan day
produces around forty observations, and ten sessions later the tape says what
each of them did. That measures the only thing the screen claims to do —
separate names that go up from names that do not — accumulates roughly two
hundred times faster than closed trades, and is the same question. Closed-trade
statistics still gate anything about **exits**, because forward return says
nothing about whether a stop or a target was right.

Edge is checked before calibration. If the names the screen passes do not
outperform the names it rejects, no threshold moves: tuning a screen with no
edge is fitting noise with extra steps.

### The record had to be rebuilt first

`scan_stats` holds aggregate counts by reason. A name that missed volume at
1.98× and one that missed at 0.30× are the same row, so no quantity of that
data could ever show a threshold sitting in the wrong place. `scan_rejects` now
records every rejected symbol with what it actually measured:

```
ORIENTPPR  below_ema        vol=8.69  ext=8.68   turnover=3.81
RELIANCE   below_ema        vol=0.97  ext=0.24   turnover=1336.93
SATIA      ema_not_stacked  vol=6.27  ext=13.53  turnover=5.4
```

Only the first failing filter is recorded — SATIA would also have failed
`too_extended` — which is the same convention the funnel has always used.

### Proving it is not a stub

On the current record the loop reports waiting on all seven gates, which is
correct and also exactly what a do-nothing stub would print. `test_eval_loop.py`
builds synthetic records with known answers and checks both halves: that it
tightens when the evidence is there, and that it refuses to loosen, to exceed
the drift cap, and to tune a screen with no edge. 25 checks.

```bash
venv/Scripts/python.exe test_eval_loop.py    # 25 passed, 0 failed
venv/Scripts/python.exe eval.py --dry-run    # proposals without applying them
```

---

# Part 2 — The chat app

```
main.py           FastAPI, builds the graph at startup
chat_llm.py       the model and its fallback chain
agents.py         supervisor -> researcher / web / trading -> writer -> reflect
graph.py          the simpler single-agent graph
guardrails.py     input classification, output secret-scanning
mcp_server.py     MCP tools over SSE (FAISS records, Tavily web, trade history)
routes.py         SSE streaming to the browser
observability.py  token budget counter
```

A supervisor delegates to one specialist, which may call its tools up to
`MAX_TOOL_ROUNDS`; a writer then composes the answer and a reflection step may
send it back once for a rewrite.

Guards, each learned from a specific failure:

- `MAX_DELEGATIONS = 4` — supervisor loop guard.
- **A specialist that already ran this turn is never re-asked.** Without this
  the LLM re-delegated to the same specialist, which re-answered from the same
  tool result: four passes over one Tavily dump cost 37k tokens and 184s for a
  single question with one tool call.
- When the tool budget is spent the specialist **hands off to the writer rather
  than being re-asked with the tools removed**. `gpt-oss` emits a tool call
  regardless of instructions, and Groq rejects the request with `Tool choice is
  none, but model called a tool`. No prompt fixes that, because the model
  decides after the request is already formed. A call that is not made cannot
  fail, and the writer composes from the tool results already in state.

## Model configuration — `models.py`

Groq retired `llama-3.3-70b-versatile` without notice and the chat app handed
the raw 404 to the user. Six files hardcoded that string. Providers retiring
models is routine, so the id now lives in one place behind `GROQ_MODEL`.

Check what a key can actually reach before changing it — the list is per-account:

```bash
curl -H "Authorization: Bearer $GROQ_API_KEY" https://api.groq.com/openai/v1/models
```

## The fallback chain — `chat_llm.py`

Every chat model on this account shares **one 8,000 TPM limit**:

```
openai/gpt-oss-120b   8000 TPM      groq/compound        70000 TPM
openai/gpt-oss-20b    8000 TPM      groq/compound-mini   70000 TPM
qwen/qwen3.8-27b      8000 TPM
```

A request of 8,088 tokens returns 413 whichever of the first group receives it,
so **a fallback list of Groq models is theatre**. The two with real headroom
answer `tool calling is not supported with this model`, and the graph binds MCP
tools to every specialist. The fallback has to be a different provider: Gemini.

Two shapes had to be reconciled:

1. `build_supervisor_graph()` calls `bind_tools()` itself, and
   `RunnableWithFallbacks` has no `bind_tools`. So the fallback is applied per
   bound variant, after binding — not once at the top.
2. Gemini returns `content` as a list of blocks where Groq returns a `str`.
   Nothing crashes, because every call site guards with `isinstance` — but the
   supervisor routes on `content.strip().lower()`, and
   `"[{'type': 'text', 'text': 'web'...}]"` matches no agent name. That is a
   graph which silently stops delegating, **worse than the visible 413**.
   Gemini's output is flattened back to text before the graph sees it.

## Context budgeting — `agents.py`

The graph resends the whole conversation to every specialist turn and again to
the writer, so a thread grows until one request crosses 8,000 tokens.

`_fit()` caps each request. Oversized tool results are **truncated, not
dropped** — one Tavily dump outweighs the rest of the conversation, and
discarding it by message throws away the retrieval the answer rests on, while
truncating keeps the ranked top. Then `trim_messages(start_on="human")`, because
a boundary starting on a `ToolMessage` leaves a tool result whose originating
`tool_call` is gone, and providers reject that outright.

Measured on a thread shaped like the failing one: 25 messages / 34,368 tokens
becomes 13 messages / 4,908.

Tunable: `MAX_CONTEXT_TOKENS` (5000), `MAX_TOOL_CHARS` (4000).

## Streaming — `routes.py`

The draft-reset is **armed** on a writer restart and sent with the first
replacement token, never on its own.

`node` comes from event metadata, which tags every nested runnable *inside* the
writer node — a fallback chain, a tools-bound model and the model each raise
`on_chain_start` with `node == "writer"`. Firing eagerly emitted several resets
per answer, and one landed *after* the text: the UI cleared a finished answer
and nothing refilled it. Deferring makes a stray chain start harmless by
construction — if no replacement text arrives, nothing is discarded.

The browser follows the stream with `behavior: "auto"`, not `"smooth"`. Every
token dispatches a new `scrollTo` and each restarts the animation, so across
~1,150 token events the view falls permanently behind. It stops following once
the reader scrolls up, and resumes when they return to the bottom.

---

# Operating it

## Local

```bash
cd "langchain project"
venv/Scripts/python.exe mcp_server.py                    # port 8000
venv/Scripts/uvicorn main:app --host 127.0.0.1 --port 8001 --reload
cd frontend/frontend && npm start                         # port 3000
```

Swing jobs, one-shot:

```bash
venv/Scripts/python.exe jobs.py brief          # morning digest, runs the fill
venv/Scripts/python.exe jobs.py scan           # screen the last closed session
venv/Scripts/python.exe jobs.py mark           # stops / targets / time stops
venv/Scripts/python.exe jobs.py report         # weekly
venv/Scripts/python.exe jobs.py --force scan   # ignore the idempotence guard
```

With no argument, `jobs.py` starts a blocking scheduler.

## Environment

`.env` lives one directory above the repo root and is gitignored.

| Key | Purpose |
| --- | --- |
| `SWING_GEMINI_API_KEY` | read before `GEMINI_API_KEY`. An OS-level `GEMINI_API_KEY` once shadowed `.env` with a different key, and the mismatch was invisible |
| `GEMINI_API_KEY`, `GROQ_API_KEY`, `TAVILY_API_KEY` | providers |
| `TELEGRAM_BOT_TOKEN`, `SWING_TELEGRAM_CHAT_ID` | swing notifications, kept separate from the options job's approval prompts |
| `AGENT_DB` | path to `swing.db` |
| `UNIVERSE` | `sector` (default), `sector:N`, or an index name |
| `GROQ_MODEL`, `GEMINI_CHAT_MODEL` | model ids |
| `MAX_CONTEXT_TOKENS`, `MAX_TOOL_CHARS` | chat request caps |

## Things that will bite

- **`.github/` is only read at the repository ROOT.** A nested
  `langchain project/.github/` was silently ignored, which is why the options
  workflow failed for three weeks while looking correctly configured.
- **The cloud runner owns `swing.db`.** It is a binary blob, so whoever pushes
  last wins outright. A local commit once overwrote the runner's copy and
  dropped a queued entry — the paper book's first trade was lost that way. The
  workflow protects itself with `-X theirs`; nothing protects the runner from a
  local push.
- **`getUpdates` allows one Telegram consumer at a time.** Two pollers means one
  silently receives nothing.
- **Only Groq calls belong on the Groq budget.** `observability.py` counts what
  is attached to it; the Gemini fallback deliberately is not.

## Where the money goes

`observability.py` warns at 80% of `DAILY_TOKEN_LIMIT`. Watch the per-request
line:

```
[OBS] <question> · 6 LLM · 0 tool · 18,712 tok · 118.1s · today 262,673/100,000
```

Six LLM calls for one question means the supervisor is over-delegating. The
swing agent, by contrast, spends about 3,000 tokens a day: one analyst call over
all candidates, with everything upstream of it deterministic.

---

# Status

Working and autonomous: sector selection, the screen, the NSE event veto, the
daily analyst call, both paper books, the Telegram brief, the dashboard, and the
weekly agent loop.

Verified running unattended: on 2026-09-07 the agent screened the 07-Sep session
at 15:46 IST, passed **JKPAPER**, took it, and queued it for the next open —
with no human in the loop.

Open:

- **Punctual delivery** needs the external trigger in `ops/README.md`. It
  requires a fine-grained PAT with `Actions: write`, scoped to this repository
  alone — not the existing token, which has `contents: write`.
- **The agent loop is waiting on evidence, not on code.** It runs every
  Saturday and currently reports which gate each finding is blocked by: 12 scan
  days (has 3), 120 forward-return observations (has 0), 25 near-misses per
  filter (has 0). The first forward returns land ten sessions after the first
  scan under `scan_rejects`, so the earliest a finding can clear is late
  September.
- **Expectancy needs roughly 30 closed trades** before it means anything. There
  are currently 2 open and 0 closed. This gates the exit rules only; the screen
  is judged on forward returns instead.
