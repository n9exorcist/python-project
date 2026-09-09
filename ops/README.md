# Punctual triggers

GitHub's `schedule` event is best-effort and this repo is deep in the queue.
Measured drift on `n9exorcist/python-project`:

| Window | Drift from the cron time |
| --- | --- |
| 20–26 Aug | +38 min |
| 27–28 Aug | +11h 01m, +11h 55m |
| 31 Aug – 1 Sep | +6h 20m, +5h 10m |
| 2–7 Sep | steady +4h 30m |

On 7 Sep the swing fill (cron 03:46 UTC) and the options trade (cron 03:45 UTC)
both started at **08:38 UTC / 14:08 IST** — GitHub drains the batch when it
chooses, so moving a cron earlier just moves the input to a queue that ignores
it. Slots can also be dropped with no record at all.

`workflow_dispatch` does **not** go through that queue. Verified on this
repository, 2026-09-08:

```
dispatch -> 204
   #10  workflow_dispatch  in_progress  10:02:43Z   <- started the same second
   #9   schedule           completed    09:58:26Z
```

Run #10 completed successfully. So the fix is to call the dispatch API from
something that keeps time, and leave the `schedule` blocks in place as a
backstop.

Both jobs are idempotent — `job_runs` in `jobs.py` claims a session once its
work is done — so a punctual trigger and a late GitHub slot firing the same day
is a no-op, not a double-send.

---

## 1. The token

`workflow_dispatch` needs **Actions: Read and write**.

> ### The trap that cost an hour here
>
> GitHub's permission list has two entries whose descriptions both mention
> Actions:
>
> - **Secrets** — *"Manage Actions repository secrets."* This governs the
>   encrypted values a workflow reads. **Not this one.**
> - **Actions** — *"Work with GitHub Actions: workflows, workflow runs and
>   artifacts."* **This one.**
>
> Granting Secrets instead yields a token that can *read* workflows and runs —
> any token can, on a public repo — and still returns
> `403 Resource not accessible by personal access token` on dispatch. It looks
> exactly like a permission that failed to save, which sends you looking in the
> wrong place.

Settings → Developer settings → Personal access tokens → Fine-grained tokens →
the token → **Add permissions** → **Actions** → *Read and write* → Update.

A fine-grained token scoped to this repository alone is enough; no classic token
is needed. Two things worth doing while you are there:

- **Remove `Secrets` if present.** The workflow reads its own secrets at
  runtime; the token never touches them, and this credential is headed for a
  third-party server.
- **Set an expiration.** Dispatch fails with 401 when it lapses, and a cron
  service will email you rather than failing silently.

Verify:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  -H "Authorization: Bearer $GITHUB_PAT" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/n9exorcist/python-project/actions/workflows/swing.yml/dispatches \
  -d '{"ref":"main","inputs":{"command":"brief"}}'
```

`204` is success. `403` means the Actions permission is still missing.

## 2. The clock

### cron-job.org — no code, ~5 minutes, machine-independent

Free account, then **Create cronjob** for each row. The three swing jobs share
the same URL, method and headers; only the schedule and body differ. The options
trade is a fourth job pointing at a different workflow -- see below.

```
URL     https://api.github.com/repos/n9exorcist/python-project/actions/workflows/swing.yml/dispatches
Method  POST

Headers
  Authorization: Bearer <token>
  Accept: application/vnd.github+json
  X-GitHub-Api-Version: 2022-11-28
  Content-Type: application/json
```

| Job | Schedule (timezone `Asia/Kolkata`) | Request body |
| --- | --- | --- |
| `swing brief` | 09:16, Mon–Fri | `{"ref":"main","inputs":{"command":"brief"}}` |
| `swing scan` | 15:40, Mon–Fri | `{"ref":"main","inputs":{"command":"mark+scan"}}` |
| `swing weekly` | 09:00, Sat | `{"ref":"main","inputs":{"command":"report"}}` |

A successful dispatch returns **204 with an empty body**, so set "treat as
success" to 2xx and enable failure notifications — that is what tells you the
token has expired.

#### The fourth job: the options trade

This one is not the swing agent, and two fields differ.

```
URL     https://api.github.com/repos/n9exorcist/python-project/actions/workflows/trade.yml/dispatches
Body    {"ref":"main"}
```

| Job | Schedule (timezone `Asia/Kolkata`) | Request body |
| --- | --- | --- |
| `options trade` | 09:15, Mon-Fri | `{"ref":"main"}` |

`trade.yml` declares `workflow_dispatch:` with **no inputs**, so an `inputs`
object here is a 422. Everything else — headers, method, 2xx-is-success,
failure notifications — is identical to the swing jobs.

This is the job that most needs a real clock. On 2026-09-09 GitHub started it
4h38m after its cron time, so "Trade approval required / Signal: Green" arrived
at 13:53 IST worded exactly as it is worded when on time. Nothing was placed —
the 15-minute CI approval timeout expired — but the failure was one tap wide.
`daily_trade_job` now refuses to ask past `TRADE_MAX_LATENESS_MIN` (90), which
is a backstop, not a fix: the fix is dispatching it on time.

**Once this job is verified, remove the `schedule:` block from `trade.yml`.**
With the lateness guard in place a drifted GitHub slot no longer prompts — it
sends "Trade skipped, Nh late" instead, every weekday, on top of the punctual
09:15 prompt. And unlike the swing agent this job cannot dedupe: it never
commits state back, so each run starts blank with no way to know the day was
already handled. A slot that can only ever arrive too late to be useful is not
a backstop; it is a second message saying so.

### Cloudflare Worker — if you would rather not paste a token into a web form

`cron-worker/` is ready to deploy; the token lives in Cloudflare's secret store
instead.

```
npm install -g wrangler
cd ops/cron-worker
wrangler login
wrangler secret put GITHUB_TOKEN
wrangler deploy
```

Crons in `wrangler.toml` are UTC: 03:46 and 10:10 = 09:16 and 15:40 IST.

## 3. Windows Task Scheduler — the local fallback

`install-tasks.ps1` registers the same triggers on this machine, and
`punctual.ps1` tries the dispatch first, running the job locally only if that
fails. So once the token works these stop being a second *worker* and become a
second *dispatcher*:

```
15:33:08  === mark ===
15:33:09  using GITHUB_PAT
15:33:12  dispatched 'mark' to GitHub (runs in the cloud, starts within seconds)
```

Useful while the cloud cron is being set up, redundant afterwards, and dependent
on this machine being awake either way.

```
powershell -ExecutionPolicy Bypass -File ops\install-tasks.ps1            # install
powershell -ExecutionPolicy Bypass -File ops\install-tasks.ps1 -Uninstall # remove
```

## Why running two schedulers is safe

`job_runs` claims a session once its work is actually done, so whichever trigger
fires second prints `already screened; nothing to do` and exits. That is what
makes the GitHub `schedule` blocks safe to keep as a backstop, and why a
cron-job.org run colliding with a delayed GitHub run costs nothing.
