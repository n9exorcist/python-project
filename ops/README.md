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

`workflow_dispatch` does **not** go through that queue. Dispatched runs start
within seconds. So the fix is to call the dispatch API from something that
keeps time, and leave the `schedule` blocks in place as a backstop.

Both jobs are idempotent — `job_runs` in `jobs.py` claims a session once its
work is done — so a punctual trigger and a late GitHub slot firing the same day
is a no-op, not a double-send.

---

## 1. Make a dedicated token

Do **not** reuse the existing `GITHUB_PAT`. It has `contents: write`, and this
token is going to live on a third-party server.

GitHub → Settings → Developer settings → Personal access tokens →
**Fine-grained tokens** → Generate new token:

- **Name**: `swing-dispatch`
- **Expiration**: 90 days (put a reminder in your calendar — dispatch fails
  silently with a 401 when it lapses)
- **Repository access**: Only select repositories → `n9exorcist/python-project`
- **Repository permissions**: `Actions` → **Read and write**.
  Leave everything else alone. (`Metadata: Read` is added automatically and is
  required.)

Blast radius if that token leaks: someone can start workflows in this one repo.
It cannot read or write code.

## 2. Point a clock at it

### cron-job.org — no code, ~5 minutes

Create a free account, then **Create cronjob** twice.

**Job A — the morning brief**

| Field | Value |
| --- | --- |
| Title | `swing brief` |
| URL | `https://api.github.com/repos/n9exorcist/python-project/actions/workflows/swing.yml/dispatches` |
| Schedule | Custom: minute `16`, hour `9`, days `Mon–Fri` |
| Timezone | `Asia/Kolkata` |
| Method | `POST` |
| Request body | `{"ref":"main","inputs":{"command":"brief"}}` |

Headers:

```
Accept: application/vnd.github+json
Authorization: Bearer <the swing-dispatch token>
X-GitHub-Api-Version: 2022-11-28
Content-Type: application/json
```

**Job B — the evening screen.** Same URL, headers and method. Schedule
`15:40 Mon–Fri Asia/Kolkata`, body:

```json
{"ref":"main","inputs":{"command":"mark+scan"}}
```

A successful dispatch returns **HTTP 204 No Content** with an empty body. Set
"Treat as success" to 2xx and enable failure notifications — cron-job.org will
email you if GitHub starts rejecting the token.

### Cloudflare Worker — if you would rather not paste the token into a form

`cron-worker/` in this directory is ready to deploy. The token lives in
Cloudflare's secret store instead of a web form.

```
npm install -g wrangler
cd ops/cron-worker
wrangler login
wrangler secret put GITHUB_TOKEN     # paste the swing-dispatch token
wrangler deploy
```

Cron triggers are declared in `wrangler.toml` in **UTC**, already set to
03:46 and 10:10 UTC (09:16 and 15:40 IST).

## 3. Check it worked

The morning after, either:

- the Telegram brief arrives at ~09:16 instead of ~14:00, or
- Actions shows a run with event `workflow_dispatch` rather than `schedule`.

If nothing fires, the usual causes are a lapsed token (401), the token missing
`Actions: write` (403 `Resource not accessible by personal access token`), or
`command` not matching one of the `workflow_dispatch` options in `swing.yml`
(422).
