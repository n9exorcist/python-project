/**
 * Punctual trigger for the swing agent.
 *
 * GitHub's `schedule` event is queued and drained on GitHub's terms — measured
 * at +4h30m on this repo, and occasionally dropped outright. `workflow_dispatch`
 * is not queued, so a Worker cron that calls the dispatch API delivers the
 * 09:16 IST brief at 09:16 IST.
 *
 * The GitHub-side jobs are idempotent (job_runs in jobs.py claims a session once
 * its work is done), so this firing alongside a late `schedule` slot is a no-op
 * rather than a double-send. That is why the crons in swing.yml stay in place.
 */

const REPO = "n9exorcist/python-project";
const WORKFLOW = "swing.yml";

// UTC, matching the crons in wrangler.toml. IST is UTC+05:30.
const COMMAND_FOR = {
  "3:46": "brief", // 09:16 IST — last night's screen, today's fills, open book
  "10:10": "mark+scan", // 15:40 IST — mark positions, then screen the closed session
};

async function dispatch(env, command) {
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        // GitHub rejects API requests without one.
        "User-Agent": "swing-agent-cron",
      },
      body: JSON.stringify({ ref: "main", inputs: { command } }),
    }
  );

  // A successful dispatch is 204 with an empty body. Anything else is worth
  // seeing in `wrangler tail` — a silent failure here looks exactly like a
  // quiet market, which is the one thing this whole system must never do.
  if (res.status !== 204) {
    const body = await res.text();
    throw new Error(`dispatch ${command} -> ${res.status} ${body}`);
  }
  return `dispatched ${command}`;
}

export default {
  async scheduled(event, env, ctx) {
    const d = new Date(event.scheduledTime);
    const key = `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
    const command = COMMAND_FOR[key];
    if (!command) {
      console.log(`no command mapped for ${key} UTC`);
      return;
    }
    ctx.waitUntil(
      dispatch(env, command).then(console.log, (e) => console.error(String(e)))
    );
  },

  // Manual smoke test: `curl https://<worker>.workers.dev/?command=brief`
  async fetch(request, env) {
    const command = new URL(request.url).searchParams.get("command");
    if (!command) return new Response("pass ?command=brief\n", { status: 400 });
    try {
      return new Response((await dispatch(env, command)) + "\n");
    } catch (e) {
      return new Response(String(e) + "\n", { status: 502 });
    }
  },
};
