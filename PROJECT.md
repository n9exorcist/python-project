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
crossover.py     the 5/13 EMA trigger: is the entry live, and at what levels
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


### 3b. The trigger — `crossover.py`

The screen describes a **state**: a name can sit in it for weeks. The 5/13 EMA
crossover is an **event**, dated to one bar, and the whole method hangs off it —
entry, stop and all three targets are computed from the crossover bar's close.

Ported from the TradingView Pine indicator, and faithful to it: `ta.crossover`
semantics (the previous bar must not already be on the new side, so a series
that stays above never re-fires), Wilder ATR, stop at 1.5 × ATR, targets at
1R/2R/3R.

A candidate must have a **live** trigger — `TRIGGER_MAX_BARS`, default 3 — or
it is rejected as `no_live_trigger` and appears in the funnel like any other
rejection. Why it matters:

```
JKPAPER  cross 2026-08-21  entry 391.80  TP1 410.85
         cleared the screen 2026-09-07 at 420.05
```

Entering there is buying *past the first target*, on a stop the price left
behind two weeks earlier. A candidate whose trigger has expired is not a trade.

### The price feed must be RAW

`yfinance` defaults to `auto_adjust=True`, which back-adjusts every bar before
an ex-dividend date. JK Paper paid ₹4.00 on 2026-08-19 and the adjustment moved
the cross a day earlier:

```
adjusted     20 Aug   ema5 383.488   ema13 382.749   <- cross
unadjusted   20 Aug   ema5 385.264   ema13 385.693      still below
             21 Aug   ema5 387.443   ema13 386.565   <- cross
```

The chart's own readout says 387.44 / 386.57 — the unadjusted pair. TradingView
plots raw; the scanner did not, and so disagreed with the chart it was meant to
reproduce.

This reaches past the trigger. Adjustment shifts EMA stacking, RSI and ATR, so a
dividend can move a name in or out of the screen entirely — and a stop at
1.5 × ATR off an adjusted close is not a price the market will ever print.

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

| | FIXED | STRUCTURAL | TRIGGER |
| --- | --- | --- | --- |
| Stop | −7.5% | entry − 2.5 × ATR(14) | the indicator's stop, 1.5 × ATR |
| Target | +17.5% | 2.5 × risk (2.5R) | TP1/TP2/TP3 at 1R/2R/3R |
| Shape | one position | one position | three tranches, scaled out |

FIXED and STRUCTURAL are **rules** applied to whatever price a fill happens at.
TRIGGER is different: it trades the levels the indicator actually drew. Each
tranche is its own row, with the tranche number in the book name — the table
carries `UNIQUE(book, symbol, signal_date)`, and changing a UNIQUE in SQLite
means rebuilding it, which is not something to do to a live paper book for
cosmetics. `mark_to_market` then needs no changes: the tranches share a stop,
each has its own target, each closes on its own terms. The notional is split
three ways so the book risks the same capital per signal as the other two.

The drawn levels are kept rather than recomputed from the fill. They were set
off the crossover close and the fill lands at the next open — but they are the
orders that would actually have been resting in the market. R is measured from
the real fill, so TITAGARH's gap from 871.85 to 878.75 reports as
+0.70/+1.55/+2.41R instead of a tidy 1/2/3R. The cost of the gap is visible
rather than hidden by re-anchoring the stop.

**Scaling against a fixed stop has unkind arithmetic.** Bank a third at +0.7R,
then lose a full −1R on each of the other two, and taking TP1 has made the trade
worse than never scaling:

```
breakeven OFF   TP1 +0.70R, stop -1.00R, stop -1.00R   net -1.297R
breakeven ON    TP1 +0.70R, stop  0.00R, stop  0.00R   net +0.703R
```

`TRIGGER_BREAKEVEN_AFTER_TP1` is OFF by default, because the Pine never touches
its stop and this book exists to trade what the indicator draws. Turning it on
is a change to the strategy, not a correction of it. The stop moves *after* the
marking loop, so it applies from the next bar: within one daily bar there is no
knowing whether TP1 printed before or after the low.

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

`workflow_dispatch` does **not** go through that queue. Verified on this
repository:

```
dispatch -> 204
   #10  workflow_dispatch  in_progress  10:02:43Z   <- started the same second
   #9   schedule           completed    09:58:26Z
```

End to end, from a clock rather than by hand — a trigger at 15:40:11 IST,
dispatched immediately, the runner finished 64 seconds later having sent the
message. Telegram had it by 15:41, against the ~20:00 the schedule queue would
have managed.

Three things stood in the way, none of them the code:

- **The permission is not the one it looks like.** Dispatch needs
  `Actions: Read and write`, and GitHub's fine-grained list has two entries
  whose descriptions both mention Actions — `Secrets` ("manage Actions
  repository secrets") and `Actions` ("workflows, workflow runs and
  artifacts"). Granting `Secrets` yields a token that reads workflows perfectly
  well, because any token can on a public repo, and still returns
  `403 Resource not accessible by personal access token`. It looks exactly like
  an update that failed to save.
- **The scheduler may strip `Authorization`.** cron-job.org has its own HTTP
  auth fields and drops the header on save. GitHub accepts a token as HTTP
  Basic auth with an empty username, which routes through those fields instead.
  `Accept` turns out not to be required at all, which matters because a stray
  space in its name was enough for cron-job.org to refuse the whole job as
  "non-wellformed".
- **A dispatch carries one value.** `workflow_dispatch` takes a single choice,
  so a Saturday cron could ask for `report` or `eval` but not both — quietly
  dropping the agent loop. The options now include `eval+report`, and the split
  is generalised from one hardcoded pair to replacing every `+`.

Three clocks now, and `job_runs` makes the redundancy free:

| Trigger | Fires | Depends on |
| --- | --- | --- |
| cron-job.org | to the second | nothing — the cloud clock |
| Windows Task Scheduler | to the minute | this machine being awake |
| GitHub `schedule` | +4 to +12 hours | GitHub's queue |

`ops/punctual.ps1` asks GitHub to run the job and only runs it locally if the
dispatch is refused, so the local trigger became a second *dispatcher* rather
than a second *worker* the moment the token worked.

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

### One question, fourteen checkpoints

The graph state for a single web question, read back from the running server:

| step | what ran | msgs |
| --- | --- | --- |
| 0–1 | input guard; `delegations` and `tool_rounds` zeroed | 1 |
| 2 | supervisor → `web` | 1 |
| 3–4 | specialist calls the tool; tools node returns result #1 | 3 |
| 5–6 | second round, still inside `MAX_TOOL_ROUNDS` | 5 |
| 7 | budget spent — handoff, no further model call | 6 |
| 8 | supervisor → `FINISH` | 6 |
| 9 | writer drafts, output scanned for secrets | 7 |
| 10–12 | reflect → pass | 7 |

The counters are per request, not per session, so a fresh question always starts
with its full allowance rather than inheriting the last one's.

### The reviewer was judging blind

`reflect_node` received only the question and the answer — never what the tools
returned. So it could not tell "nothing was found" from "something was found and
thrown away", which is the only distinction that matters. When an answer looked
thin, *say you do not have access* is a plausible-sounding fix that happens to be
false.

It was wrong twice in one session. The web specialist made two successful
searches and reflection then instructed the writer to claim it could not search
— which it did, answering from 2024 training data with the results sitting
unused in state. RAGAS had already scored that exact shape: **faithfulness 0.00
on a case whose context recall was 1.00**, meaning retrieval worked and the
answer ignored it.

The reviewer now receives the tool output, and is told that denying capability
while the context holds the answer is the worst failure available to it:

```
judging blind      PASS
with the context   REVISE: the answer does not use the retrieved context,
                   which already provides the current market reaction
```

On the same question, before and after:

| | LLM calls | tokens | time | verdict |
| --- | --- | --- | --- | --- |
| before | 7 | 21,843 | 141.8s | revise → answered from 2024 |
| after | 6 | 7,660 | 28.1s | pass → answered from the search |

65% fewer tokens and five times faster, because the old path spent 14,000 extra
tokens rewriting a good answer into a worse one.

### Each specialist is told which tools it holds

A comparison question needed records *and* the web. The model called
`mcp_search_the_web` from the researcher and the whole request died at the
provider — *"attempted to call tool which was not in request.tools"*. The prompt
never said which tools it had. Each specialist now names its own, is told that
any other belongs to a different specialist and calling it fails the request,
and is asked to answer the part it can reach while saying what is still missing.
Routing across sources is the supervisor's job.

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
| `REQUIRE_TRIGGER` | `0` disables the 5/13 gate entirely |
| `TRIGGER_MAX_BARS` | how stale a cross may be, default 3 |
| `TRIGGER_BREAKEVEN_AFTER_TP1` | `1` moves the stop up once TP1 fills |
| `RAGAS_JUDGE_MODEL` | quota is per model; rotate when one is spent |
| `GROQ_MODEL`, `GEMINI_CHAT_MODEL` | model ids |
| `MAX_CONTEXT_TOKENS`, `MAX_TOOL_CHARS` | chat request caps |

## Things that will bite

- **`actions/checkout` pins the commit at run *creation*, not at run start.**
  Two dispatches six seconds apart therefore check out the same commit — the one
  from before either of them wrote anything. On 2026-09-09 the concurrency group
  worked perfectly: run #27 held the runner 10:10:11–10:11:03 and pushed at
  10:11:01, and run #28's job started at 10:11:06, three seconds after #27
  finished. #28 still re-screened all 69 symbols and sent a second identical
  "no setups today", because it was reading a paper book written before #27 ran,
  so `already_ran` had nothing to see. **Serialising runs is not enough when the
  state ships inside the checkout — the second run has to re-read what the first
  one wrote.** Every run now resets to the branch tip after checkout. That is
  what makes the spare slots free, which is the assumption the whole multi-slot
  schedule rests on.
- **A table keyed on success cannot tell you about failure.** The morning brief
  read the last screen off `MAX(scan_date)` in `signals`, and a session only
  reaches `signals` when something *passes*. So a clean screen and a missing
  screen were indistinguishable, and on 2026-09-09 the brief reported the 09-07
  session and announced that 09-08 "has closed and was not screened" — a day it
  had in fact screened, examining 28 names and passing none. With the trigger
  gate on, most days pass nothing, so that note was about to fire nearly every
  morning. A warning that cries wolf daily is worse than no warning. The
  screen's own record is `job_runs`.
- **Replacing a SQLite file means deleting its `-wal` too.** `memory.db` failed
  `integrity_check` with btree damage confined to LangGraph's `checkpoints` and
  `writes`. The repair rebuilt it cleanly — and it still reported corruption,
  because the 16 MB write-ahead log from the old database was left beside the new
  64 KB one and SQLite dutifully replayed it. The tell was `integrity_check`
  naming pages 3000–5650 in a file that holds sixteen. A backup must include the
  `-wal`; a replacement must delete it. `ops/repair_memory_db.py` does both.
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

# Concepts implemented

An index of what is actually wired up, and where. The second table is the more
useful one: a list of capabilities is only trustworthy if it also says what is
absent.

## Frameworks

| | version | where it is used |
| --- | --- | --- |
| LangChain | 1.3.13 | tool binding, message handling, `with_fallbacks` |
| LangChain Core | 1.6.2 | `trim_messages`, runnables |
| LangGraph | 1.2.9 | the supervisor graph, `AsyncSqliteSaver` checkpointer |
| LangSmith | 0.10.5 | tracing, project `Market-Analyst-Pro` |
| LangGraph Studio | CLI | `langgraph.json` → `studio_graph.py` |
| MCP adapters | 0.3.0 | `mcp_server.py` serves four tools over SSE |
| LiteLLM | 1.99.0 | the swing router: budgets and fallback chains |
| FAISS | 1.14.3 | the internal-records vector store |
| RAGAS | 0.4.3 | retrieval-grounding evaluation |
| APScheduler | 3.11.3 | the local blocking scheduler in `jobs.py` |

## Agentic patterns

- **Multi-agent supervision** — a supervisor routes to `researcher` / `web` /
  `trading`, each holding different tools, then a writer composes. A specialist
  that already ran is never re-asked.
- **Reflection** — draft, critique, improve, final, with the reviewer seeing
  what the tools returned rather than the answer alone.
- **Tool use over MCP** — FAISS records, Tavily web, signals CSV, trade history.
- **Guardrails** — an input node classifying injection and exfiltration before
  anything runs; every answer scanned for secrets on the way out.
- **Human in the loop** — Telegram Approve/Reject on the one path that can place
  a live order, which *times out to skip*.
- **Observability** — a token budget and a per-request line, plus `llm_events`
  recording which model actually served.
- **Context budgeting** — tool results truncated rather than dropped, trimmed to
  a boundary that never orphans a tool call.
- **Model failover** — across providers on budget exhaustion, and on error.
- **Evaluation** — an LLM judge against written references, RAGAS against what
  was actually retrieved, and 25 regression checks on the agent loop.

## And what is not implemented

| Absent | What that means here |
| --- | --- |
| Persistent memory | the checkpointer holds one conversation; nothing carries between them |
| GraphRAG | retrieval is similarity over isolated chunks, not relationships |
| DeepAgents | no planning tool, sub-agents with their own context, or virtual filesystem |
| LangSmith datasets | zero uploaded; the evals run locally and write JSON |

The first two are the gap between this system and the "advanced agentic RAG"
tier it is often compared to — memory across steps, and retrieval that follows
relationships rather than similarity.

---

# Status

Working and autonomous: sector selection, the screen, the 5/13 trigger gate,
the NSE event veto, the daily analyst call, all three paper books, the Telegram
brief, the dashboard, cross-provider model failover, punctual cloud dispatch,
and the weekly agent loop.

Verified running unattended: on 2026-09-07 the agent screened the 07-Sep session
at 15:46 IST, passed **JKPAPER**, took it, and queued it for the next open —
with no human in the loop.

- **The live-order path is still on GitHub's `schedule`, and it drifts like
  everything else.** On 2026-09-09 the options workflow was cron'd for 03:45 UTC
  and started at 08:23 — 4h38m late — so "Trade approval required / Signal:
  Green" reached Telegram at 13:53 IST, worded exactly as it is worded when it
  is on time. Nothing was placed: the 15-minute CI approval timeout expired and
  the job skipped, which is the safe default working. But the failure was one
  tap wide, and the tap would have sold options sized on a signal priced for an
  open four and a half hours gone.

  `daily_trade_job` now knows what time it was meant to run. Past
  `TRADE_MAX_LATENESS_MIN` (90) it refuses to ask at all and says why; inside
  the window it still asks, but the prompt carries the delay, so lateness is
  part of what is being approved rather than something you have to notice. The
  remaining work is the same fix the swing agent already got: a fourth
  cron-job.org job dispatching `trade.yml` at 09:15 IST, so the guard is a
  backstop rather than the only line of defence.

Open:

- **Punctual delivery is solved.** Three cron-job.org jobs dispatch from the
  cloud — brief 09:16, mark+scan 15:40, eval+report Saturday — with the local
  task and the GitHub schedule behind them. The one maintenance date is the
  token's expiry on 8 October. It
  requires a fine-grained PAT with `Actions: write`, scoped to this repository
  alone — not the existing token, which has `contents: write`.
- **The agent loop is waiting on evidence, not on code.** It runs every
  Saturday and currently reports which gate each finding is blocked by: 12 scan
  days (has 3), 120 forward-return observations (has 0), 25 near-misses per
  filter (has 0). The first forward returns land ten sessions after the first
  scan under `scan_rejects`, so the earliest a finding can clear is late
  September.
- **JKPAPER is an accidental experiment.** It was filled on 2026-09-08 at 420.05
  under the pre-gate rules, with a trigger 11 sessions stale and price already
  past TP1. It is deliberately NOT being closed: it was a legitimate trade under
  the rules in force when it was taken, and deleting positions because the rules
  changed afterwards is exactly the retroactive edit that makes a paper log
  worthless. `screen_version` exists so outcomes attribute to the rules that
  produced them. It now sits alongside TITAGARH, which was taken on a same-day
  trigger — a live measurement of what a stale trigger is actually worth.
- **Expectancy needs roughly 30 closed trades** before it means anything. There
  are currently 2 open and 0 closed. This gates the exit rules only; the screen
  is judged on forward returns instead.
