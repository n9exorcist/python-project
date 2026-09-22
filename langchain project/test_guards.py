"""test_guards.py -- regression tests for the three guardrail failures found in
production, each pinned so it cannot quietly come back.

  1. The reflect reviewer judged against stale evidence (the whole thread's tool
     output sliced from the FRONT), and deleted a correct answer.
  2. The fix for (1) scoped evidence to the current turn only -- and a follow-up
     question answered from an earlier turn's retrieval was judged blind again.
  3. A provider error was streamed to the user verbatim, organisation id and
     all, through an exception path that never passed the output guardrail.

Synthetic messages rather than stored checkpoints: a conversation can be asked
the same question twice with different search results, and memory.db has been
rebuilt once already. A regression test that depends on either is a test of
the fixture, not of the code.

Run:  venv/Scripts/python.exe test_guards.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

PASS_COUNT, FAIL_COUNT = 0, 0


def check(label: str, condition: bool, detail: str = "") -> None:
    global PASS_COUNT, FAIL_COUNT
    if condition:
        PASS_COUNT += 1
        print(f"  PASS  {label}")
    else:
        FAIL_COUNT += 1
        print(f"  FAIL  {label}" + (f"\n        {detail}" if detail else ""))


def tool(text: str, i: int) -> ToolMessage:
    return ToolMessage(content=text, tool_call_id=f"call_{i}")


NOISE = ("[1] source: accentures-second-quarter-fiscal-2026-earnings-press-release.pdf "
         "· p.7\nOPERATING INCOME  2,493,547  13.8 %  " * 60)          # ~5k chars


from agents import _reviewer_evidence, MAX_TOOL_CHARS

# --- 1. stale crowd-out ------------------------------------------------------
print("\n=== 1. the current turn can never be crowded out by history ===")
msgs = [HumanMessage(content="q1")]
for i in range(5):                           # 5 turns of big earlier retrieval
    msgs += [tool(NOISE, i), AIMessage(content="a"), HumanMessage(content=f"q{i + 2}")]
msgs += [tool("Accenture's share price is around US$127.98, down about 18% "
              "over the past day.", 99)]
ev, now, then = _reviewer_evidence(msgs)
check("this turn's result is in the evidence", "127.98" in ev)
check("it comes FIRST, ahead of any history",
      ev.find("127.98") < ev.find("OPERATING INCOME") if "OPERATING INCOME" in ev else True)
check("labelled as this turn's", ev.startswith("RETRIEVED THIS TURN"))
check("counted as 1 current result", now == 1, f"got {now}")

# --- 2. follow-up answered from an earlier turn ------------------------------
print("\n=== 2. a follow-up with no tools this turn still has evidence ===")
msgs = [
    HumanMessage(content="What do the local documents say about Accenture?"),
    tool("Revenues for the second quarter of fiscal 2026 were $18.04 billion.", 1),
    AIMessage(content="Revenue was $18.04bn."),
    HumanMessage(content="Tell me about Accenture Q2 2026."),   # no tool this turn
]
ev, now, then = _reviewer_evidence(msgs)
check("no current-turn results", now == 0, f"got {now}")
check("earlier retrieval is shown", "18.04 billion" in ev)
check("and labelled as earlier, not current", "RETRIEVED EARLIER" in ev
      and "RETRIEVED THIS TURN" not in ev)

# --- 3. genuinely nothing retrieved ------------------------------------------
print("\n=== 3. no retrieval anywhere -> no evidence, not an invented one ===")
ev, now, then = _reviewer_evidence([HumanMessage(content="what is 2+2")])
check("evidence is empty", ev == "" and now == 0 and then == 0)

# --- 4. history has its own budget, and it is bounded ------------------------
print("\n=== 4. history cannot grow the prompt without bound ===")
msgs = [HumanMessage(content="q")]
for i in range(40):
    msgs += [tool(NOISE, i), HumanMessage(content=f"q{i}")]
ev, now, then = _reviewer_evidence(msgs)
limit = 2 * MAX_TOOL_CHARS + 2_000            # two budgets + labels/truncation marks
check(f"40 earlier results stay under ~{limit:,} chars", len(ev) <= limit,
      f"got {len(ev):,}")

# --- 5. provider errors never reach the user --------------------------------
print("\n=== 5. a provider error is reported, not leaked ===")
import observability as obs
src = Path(__file__).with_name("routes.py").read_text(encoding="utf-8")
i, j = src.index("_ORG_RE = re.compile"), src.index("@router.post", src.index("_ORG_RE"))
ns = {"re": re, "obs": obs, "print": lambda *a, **k: None}
exec(src[i:j], ns)
leaky = Exception(
    "Error code: 429 - {'error': {'message': 'Rate limit reached for model "
    "`openai/gpt-oss-120b` in organization `org_01abcdefghijklmnop` service tier "
    "`on_demand` on tokens per day (TPD): Limit 200000, Used 199984, Requested 2329. "
    "Please try again in 16m39.216s. Need more tokens? Upgrade at "
    "https://console.groq.com/settings/billing'}}")
shown = ns["_user_facing_error"](leaky)
for secret in ("org_01abcdefghijklmnop", "console.groq.com", "on_demand", "199984"):
    check(f"does not leak {secret!r}", secret not in shown)
check("still tells the user when to retry", "16m39" in shown)
shown = ns["_user_facing_error"](RuntimeError("Traceback ... /home/app/secrets.env line 4"))
check("an unknown error reveals nothing", "secrets.env" not in shown and "Traceback" not in shown)

print(f"\n{'-' * 74}\n  {PASS_COUNT} passed, {FAIL_COUNT} failed\n")
sys.exit(1 if FAIL_COUNT else 0)
