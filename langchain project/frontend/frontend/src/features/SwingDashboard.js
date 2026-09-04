import React, { useCallback, useEffect, useState } from "react";
import "./SwingDashboard.css";

const API_BASE = "http://127.0.0.1:8001";

// The dashboard reads SQLite only, so polling is free — no tokens, no network
// beyond localhost. Live prices are a separate, explicit action.
const POLL_MS = 60000;

const fmtR = (v) =>
  v === null || v === undefined ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}R`;

const fmtNum = (v, d = 2) =>
  v === null || v === undefined ? "—" : Number(v).toFixed(d);

const fmtInt = (v) =>
  v === null || v === undefined ? "—" : Number(v).toLocaleString();

const signClass = (v) =>
  v === null || v === undefined ? "" : v > 0 ? "pos" : v < 0 ? "neg" : "";

/* Rejection reasons are snake_case in the DB. The screen's own vocabulary is
   what makes the funnel legible, so they are spelled out rather than shown raw. */
const REASON_LABEL = {
  below_ema: "Below an EMA",
  ema_not_stacked: "EMAs not stacked",
  ema_not_rising: "EMAs not rising",
  rsi_out_of_band: "RSI outside 55–72",
  volume_thin: "Volume under 2×",
  too_extended: "Too far above 20 EMA",
  illiquid: "Turnover too low",
  circuit_locked: "Circuit locked",
  insufficient_history: "Not enough history",
  fetch_error: "Price fetch failed",
};

function Card({ title, subtitle, right, children, className = "" }) {
  return (
    <section className={`sw-card ${className}`}>
      <div className="sw-card-head">
        <div>
          <h2 className="sw-card-title">{title}</h2>
          {subtitle ? <p className="sw-card-sub">{subtitle}</p> : null}
        </div>
        {right ? <div className="sw-card-right">{right}</div> : null}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }) {
  return <div className="sw-empty">{children}</div>;
}

function Bar({ pct, tone = "brand" }) {
  return (
    <div className="sw-bar-track">
      <div
        className={`sw-bar-fill ${tone}`}
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    </div>
  );
}

/* Diverging bars around a zero baseline.

   Colour carries the sign, but never alone: the bar sits left or right of the
   baseline and every bar is directly labelled with a signed value. That matters
   twice over — the up-colour (#1baf7a) sits just under 3:1 on white, and its
   pair with the down-colour clears colourblind separation (ΔE 9.9 deuteranopia)
   only because these secondary cues are present. Both were measured, not
   eyeballed; plain green/red failed at ΔE 4.1 and is not used. */
function DivergingRows({ rows, onHover, scaleMax }) {
  // Callers that render two panels side by side MUST pass a shared scaleMax.
  // Letting each panel scale to its own extreme makes a -3.02% laggard and a
  // +2.14% leader draw identical-length bars, so the reader compares two
  // different rulers laid next to each other and cannot see which move is
  // bigger — the one thing the chart exists to show.
  const max = scaleMax || Math.max(...rows.map((r) => Math.abs(r.value)), 0.01);
  return (
    <div className="sw-div">
      {rows.map((r) => {
        const up = r.value >= 0;
        const w = (Math.abs(r.value) / max) * 50; // half-width each side
        return (
          <div
            className={`sw-div-row${r.highlight ? " is-chosen" : ""}`}
            key={r.key}
            onMouseEnter={(e) => onHover && onHover(r, e)}
            onMouseLeave={() => onHover && onHover(null)}
          >
            <span className="sw-div-label" title={r.label}>
              {r.label}
            </span>
            <div className="sw-div-plot">
              <span className="sw-div-axis" />
              <span
                className={`sw-div-fill ${up ? "up" : "down"}`}
                style={up ? { left: "50%", width: `${w}%` }
                          : { right: "50%", width: `${w}%` }}
              />
            </div>
            {/* The label lives in its own column rather than floating at the
                bar's end. Anchored to the end, the longest bar in every group
                sits at exactly 100% of the plot, so its label always spilled
                outside — and the longest bar is the top sector, the one row
                that must be readable. */}
            <span className={`sw-div-value ${signClass(r.value)}`}>
              {up ? "+" : "−"}
              {Math.abs(r.value).toFixed(2)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* The price rail: one row that answers "where is this now, between the two
   prices that end the trade?".

   Domain runs from the lowest of stop/mark to the highest of target/mark, so a
   price that has run past the target or broken the stop still lands on the rail
   instead of being clipped to the end and silently misreporting. The risk band
   (stop -> entry) and reward band (entry -> target) are drawn to scale, which is
   what makes a poor reward:risk look wrong rather than merely read wrong. */
function PriceRail({ stop, entry, target, mark }) {
  const known = [stop, entry, target, mark].filter(
    (v) => v !== null && v !== undefined && !Number.isNaN(v),
  );
  if (known.length < 2 || stop == null || entry == null || target == null) {
    return <div className="sw-rail-empty">levels not set</div>;
  }
  const lo = Math.min(...known);
  const hi = Math.max(...known);
  const pad = (hi - lo) * 0.06 || 1;
  const d0 = lo - pad;
  const d1 = hi + pad;
  const at = (v) => ((v - d0) / (d1 - d0)) * 100;

  const ticks = [
    { v: stop, cls: "stop", label: "stop" },
    { v: entry, cls: "entry", label: "entry" },
    { v: target, cls: "target", label: "target" },
  ];

  return (
    <div className="sw-rail">
      <div className="sw-rail-track">
        <span
          className="sw-rail-band risk"
          style={{ left: `${at(stop)}%`, width: `${at(entry) - at(stop)}%` }}
        />
        <span
          className="sw-rail-band reward"
          style={{ left: `${at(entry)}%`, width: `${at(target) - at(entry)}%` }}
        />
        {ticks.map((t) => (
          <span
            key={t.label}
            className={`sw-rail-tick ${t.cls}`}
            style={{ left: `${at(t.v)}%` }}
          />
        ))}
        {mark != null ? (
          <span className="sw-rail-tick mark" style={{ left: `${at(mark)}%` }} />
        ) : null}
      </div>
      <div className="sw-rail-labels">
        {ticks.map((t) => (
          <span
            key={t.label}
            className={`sw-rail-lab ${t.cls}`}
            style={{ left: `${at(t.v)}%` }}
          >
            <b>{fmtNum(t.v, 0)}</b>
            <i>{t.label}</i>
          </span>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, cls = "" }) {
  return (
    <div className="sw-mini">
      <span>{label}</span>
      <b className={cls}>{value}</b>
    </div>
  );
}

/* One watchlist name. Mirrors an open position's layout deliberately: the same
   rail, the same four numbers, so a name you are watching and a name you took
   are read the same way and can be compared without re-reading the legend. */
function WatchCard({ item, rules, onPatch, onDelete }) {
  const [mark, setMark] = React.useState(
    item.mark === null || item.mark === undefined ? "" : String(item.mark),
  );
  const [shares, setShares] = React.useState(
    item.shares === null || item.shares === undefined ? "" : String(item.shares),
  );

  const commitMark = () => {
    const v = mark === "" ? null : Number(mark);
    if (v !== null && !Number.isNaN(v) && v !== item.mark) onPatch(item.id, { mark: v });
  };
  const commitShares = () => {
    const v = shares === "" ? null : parseInt(shares, 10);
    if (v !== null && !Number.isNaN(v) && v !== item.shares)
      onPatch(item.id, { shares: v });
  };

  // Deriving stop/target from an entry uses the book's own constants, sent
  // down with the payload — a second copy of 7.5/17.5 in here would quietly
  // disagree with paper_broker the first time those are tuned.
  const applyRules = () => {
    const e = Number(mark || item.mark || item.entry);
    if (!e || Number.isNaN(e) || !rules) return;
    onPatch(item.id, {
      entry: Number(e.toFixed(2)),
      stop: Number((e * (1 - rules.fixed_stop_pct / 100)).toFixed(2)),
      target: Number((e * (1 + rules.fixed_target_pct / 100)).toFixed(2)),
    });
  };

  const status = item.status || "watching";
  return (
    <div className={`sw-trade ${status}`}>
      <div className="sw-trade-head">
        <div>
          <h3>{item.symbol}</h3>
          <p className="sw-trade-sub">
            {item.pattern ? `${item.pattern} · ` : ""}flagged {item.flagged}
            {item.entry_date ? ` · taken ${item.entry_date}` : ""}
          </p>
        </div>
        <span className={`sw-status ${status}`}>{status.toUpperCase()}</span>
      </div>

      <PriceRail
        stop={item.stop}
        entry={item.entry}
        target={item.target}
        mark={item.mark}
      />

      <div className="sw-minis">
        <Stat
          label="Last mark"
          value={item.mark != null ? `₹${fmtNum(item.mark)}` : "—"}
        />
        <Stat
          label="R now"
          value={item.r_now != null ? fmtR(item.r_now) : "—"}
          cls={signClass(item.r_now)}
        />
        <Stat label="1R" value={item.risk != null ? `₹${fmtNum(item.risk)}` : "—"} />
        <Stat
          label="Planned R:R"
          value={item.rr_planned != null ? `${fmtNum(item.rr_planned)} : 1` : "—"}
        />
      </div>

      {item.note ? <p className="sw-trade-note">{item.note}</p> : null}

      <div className="sw-trade-actions levels">
        {["entry", "stop", "target"].map((k) => (
          <label key={k}>
            <span>{k}</span>
            <input
              type="number"
              step="any"
              defaultValue={item[k] ?? ""}
              onBlur={(e) => {
                const v = e.target.value === "" ? null : Number(e.target.value);
                if (v !== null && !Number.isNaN(v) && v !== item[k])
                  onPatch(item.id, { [k]: v });
              }}
            />
          </label>
        ))}
        {rules ? (
          <button className="sw-btn" onClick={applyRules} title="Derive stop and target from the FIXED book's rules">
            Levels from rules (−{rules.fixed_stop_pct}% / +{rules.fixed_target_pct}%)
          </button>
        ) : null}
      </div>

      <div className="sw-trade-actions">
        <label>
          <span>Mark price</span>
          <input
            type="number"
            step="any"
            value={mark}
            onChange={(e) => setMark(e.target.value)}
            onBlur={commitMark}
          />
        </label>
        <label>
          <span>Shares</span>
          <input
            type="number"
            value={shares}
            onChange={(e) => setShares(e.target.value)}
            onBlur={commitShares}
          />
        </label>
        {status !== "triggered" ? (
          <button
            className="sw-btn ok"
            onClick={() => onPatch(item.id, { status: "triggered" })}
          >
            Entry triggered
          </button>
        ) : null}
        {status !== "skipped" ? (
          <button
            className="sw-btn warn"
            onClick={() => onPatch(item.id, { status: "skipped" })}
          >
            Skip it
          </button>
        ) : (
          <button
            className="sw-btn"
            onClick={() => onPatch(item.id, { status: "watching" })}
          >
            Un-skip
          </button>
        )}
        <button className="sw-btn danger" onClick={() => onDelete(item.id)}>
          Delete
        </button>
      </div>
      {item.updated_at ? (
        <p className="sw-trade-stamp">marked {item.updated_at.slice(0, 10)}</p>
      ) : null}
    </div>
  );
}

/* What the verdict column means, next to the column itself. The words
   take/watch/reject carry a specific consequence in jobs.py — only a `take`
   with no event inside 21 days is ever queued — and a badge that does not say
   so reads like a rating rather than a decision. */
const VERDICT_LEGEND = [
  ["take", "Nothing found that should stop this trade", "Queued for a paper entry at the next open"],
  ["watch", "Structurally fine, but something gives pause", "Reported only — no entry"],
  ["reject", "Something disqualifies it", "Reported only — no entry"],
  ["none", "The analyst did not run for this name", "No entry"],
];

function VerdictLegend() {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="sw-legend">
      <button className="sw-legend-toggle" onClick={() => setOpen(!open)}>
        {open ? "▾" : "▸"} What do these verdicts mean?
      </button>
      {open ? (
        <>
          <div className="sw-legend-rows">
            {VERDICT_LEGEND.map(([v, meaning, effect]) => (
              <div className="sw-legend-row" key={v}>
                <span className={`sw-verdict ${v}`}>
                  {v === "none" ? "not analysed" : v}
                </span>
                <span className="sw-legend-mean">{meaning}</span>
                <span className="sw-legend-effect">{effect}</span>
              </div>
            ))}
          </div>
          <p className="sw-note">
            An earnings date, board meeting or EGM inside the next 21 days
            vetoes the entry <b>even when the verdict is take</b> — such a name
            shows an <code>EVENT&lt;21d</code> flag. Nothing here places a real
            order: a queued name becomes a paper position in both books at the
            next session's open.
          </p>
        </>
      ) : null}
    </div>
  );
}

export default function SwingDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [marks, setMarks] = useState(null);
  const [marksLoading, setMarksLoading] = useState(false);
  const [marksError, setMarksError] = useState(null);
  const [tip, setTip] = useState(null);
  const [wl, setWl] = useState({ rows: [], counts: {} });
  const [tab, setTab] = useState("watchlist");
  const [form, setForm] = useState({
    symbol: "", pattern: "", entry: "", stop: "", target: "",
    flagged: new Date().toISOString().slice(0, 10), note: "",
  });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/swing/dashboard`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadWatchlist = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/swing/watchlist`);
      if (res.ok) setWl(await res.json());
    } catch {
      /* the dashboard itself already reports an unreachable API */
    }
  }, []);

  useEffect(() => {
    load(true);
    loadWatchlist();
    const id = setInterval(() => {
      load(false);
      loadWatchlist();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [load, loadWatchlist]);

  const addWatch = async (e) => {
    e.preventDefault();
    if (!form.symbol.trim() || busy) return;
    setBusy(true);
    try {
      const body = { ...form };
      // Empty inputs must arrive as null, not "" — a blank price is "unknown",
      // and 0 would draw a rail anchored at zero.
      ["entry", "stop", "target"].forEach((k) => {
        body[k] = body[k] === "" ? null : Number(body[k]);
      });
      const res = await fetch(`${API_BASE}/swing/watchlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setForm({
          symbol: "", pattern: "", entry: "", stop: "", target: "",
          flagged: new Date().toISOString().slice(0, 10), note: "",
        });
        await loadWatchlist();
        setTab("watchlist");
      }
    } finally {
      setBusy(false);
    }
  };

  const patchWatch = async (id, patch) => {
    await fetch(`${API_BASE}/swing/watchlist/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    loadWatchlist();
  };

  const removeWatch = async (id) => {
    await fetch(`${API_BASE}/swing/watchlist/${id}`, { method: "DELETE" });
    loadWatchlist();
  };

  const fetchMarks = async () => {
    setMarksLoading(true);
    setMarksError(null);
    try {
      const res = await fetch(`${API_BASE}/swing/marks`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      setMarks(j.marks || []);
    } catch (e) {
      setMarksError(e.message);
    } finally {
      setMarksLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="sw-wrap">
        <Empty>Loading…</Empty>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sw-wrap">
        <Card title="Cannot reach the API">
          <Empty>
            <p>
              <code>{API_BASE}/swing/dashboard</code> returned <b>{error}</b>.
            </p>
            <p>
              Start the backend with <code>python main.py</code> from the project
              root, then this page reloads on its own within a minute.
            </p>
          </Empty>
        </Card>
      </div>
    );
  }

  const { scan, funnel, positions, closed, books, tokens, today, sectors, rules } = data;
  const markBySym = new Map((marks || []).map((m) => [`${m.book}:${m.id}`, m]));

  // One ruler across both sector panels.
  const sectorScale = sectors
    ? Math.max(
        ...[...(sectors.leaders || []), ...(sectors.laggards || [])].map((r) =>
          Math.abs(r.chg_pct || 0),
        ),
        0.01,
      )
    : 0.01;

  // Three disjoint buckets. The earlier filter was `!== "skipped"`, which
  // left a name you had marked as taken sitting in Watchlist while Open
  // stayed empty — the status changed and nothing moved.
  const watching = (wl.rows || []).filter((r) => r.status === "watching");
  const taken = (wl.rows || []).filter((r) => r.status === "triggered");
  const skipped = (wl.rows || []).filter((r) => r.status === "skipped");

  const fixed = books.FIXED || {};
  const structural = books.STRUCTURAL || {};
  const bothHaveTrades = (fixed.closed || 0) > 0 || (structural.closed || 0) > 0;

  return (
    <div className="sw-wrap">
      <header className="sw-head">
        <div>
          <h1 className="sw-title">Swing paper book</h1>
          <p className="sw-sub">
            Deterministic screen, two parallel rule sets, notification-only.
            Nothing here places a live order.
          </p>
        </div>
        <div className="sw-head-right">
          {scan.scan_date ? (
            <span className={`sw-pill ${scan.stale ? "warn" : "ok"}`}>
              {scan.stale ? `last scan ${scan.scan_date}` : `scanned today`}
            </span>
          ) : (
            <span className="sw-pill">no scan yet</span>
          )}
          <button className="sw-btn" onClick={() => load(true)}>
            Refresh
          </button>
        </div>
      </header>

      {/* ---------------- Step 1: the sector ---------------- */}
      {sectors && sectors.day ? (
        <Card
          title="Sector board"
          subtitle={
            sectors.sessions < 5
              ? `${sectors.day} · ranked on ${sectors.sessions} session${sectors.sessions === 1 ? "" : "s"} — too thin to call a trend yet`
              : `${sectors.day} · ranked over ${sectors.sessions} sessions`
          }
          right={
            sectors.chosen ? (
              <span className="sw-count">screening {sectors.chosen.sector}</span>
            ) : null
          }
        >
          <div className="sw-grid-2 tight">
            <div>
              <div className="sw-div-head up">↑ Top performing</div>
              <DivergingRows
                onHover={setTip}
                scaleMax={sectorScale}
                rows={sectors.leaders.map((r) => ({
                  key: r.slug,
                  label: r.sector,
                  value: r.chg_pct ?? 0,
                  highlight: sectors.chosen && r.slug === sectors.chosen.slug,
                  meta: r,
                }))}
              />
            </div>
            <div>
              <div className="sw-div-head down">↓ Under performing</div>
              <DivergingRows
                onHover={setTip}
                scaleMax={sectorScale}
                rows={sectors.laggards.map((r) => ({
                  key: r.slug,
                  label: r.sector,
                  value: r.chg_pct ?? 0,
                  meta: r,
                }))}
              />
            </div>
          </div>

          {sectors.chosen ? (
            <div className="sw-chosen">
              <div className="sw-chosen-stats">
                <div>
                  <span>Breadth</span>
                  <b
                    className={
                      sectors.chosen.advance > sectors.chosen.decline ? "pos" : "neg"
                    }
                  >
                    {sectors.chosen.advance} / {sectors.chosen.decline}
                  </b>
                </div>
                <div>
                  <span>Sector PE</span>
                  <b>{fmtNum(sectors.chosen.sector_pe, 1)}</b>
                </div>
                <div>
                  <span>Earnings YoY</span>
                  <b className={signClass(sectors.chosen.np_yoy_pct)}>
                    {fmtNum(sectors.chosen.np_yoy_pct, 1)}%
                  </b>
                </div>
                <div>
                  <span>Constituents</span>
                  <b>{sectors.chosen.stock_cnt}</b>
                </div>
              </div>
              {sectors.chosen.advance <= sectors.chosen.decline ? (
                <p className="sw-note warnbox">
                  Breadth is negative — more constituents fell than rose. A sector
                  leading on one day without breadth behind it is a headline, not
                  participation.
                </p>
              ) : null}
            </div>
          ) : null}

          {sectors.stocks.length > 0 ? (
            <>
              <div className="sw-div-head plain">
                {sectors.chosen.sector} constituents — day move
              </div>
              <DivergingRows
                onHover={setTip}
                rows={sectors.stocks.map((s) => ({
                  key: s.symbol,
                  label: `${s.symbol}${s.passed_screen ? "  ✔" : ""}`,
                  value: s.chg_pct ?? 0,
                  highlight: s.passed_screen,
                  meta: s,
                }))}
              />
              <p className="sw-note">
                ✔ marks the names that cleared the technical screen. A big day move
                is not the signal — the screen is.
              </p>
            </>
          ) : null}
        </Card>
      ) : null}

      {/* ---------------- Today's scan + verdicts ---------------- */}
      <Card
        title="Latest scan"
        subtitle={
          scan.scan_date
            ? `${scan.scan_date}${scan.stale ? ` · today is ${today}` : ""}`
            : "the screen has not run yet"
        }
        right={
          <span className="sw-count">
            {scan.candidates.length} passed
          </span>
        }
      >
        {scan.candidates.length === 0 ? (
          <Empty>
            {scan.note || "No candidates."}
            {funnel.screened > 0 ? (
              <>
                {" "}
                The screen examined <b>{funnel.screened}</b> symbols and rejected
                every one. That is a normal result, not a failure — see the
                funnel below for which filter did the work.
              </>
            ) : null}
          </Empty>
        ) : (
          <div className="sw-table-scroll">
            <table className="sw-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th className="num">Close</th>
                  <th className="num">RSI</th>
                  <th className="num">Vol ×</th>
                  <th className="num">Ext %</th>
                  <th className="num">ATR %</th>
                  <th className="num">Turnover ₹cr</th>
                  <th>Verdict</th>
                </tr>
              </thead>
              <tbody>
                {scan.candidates.map((c) => (
                  <tr key={c.symbol}>
                    <td className="sym">{c.symbol}</td>
                    <td className="num">{fmtNum(c.close)}</td>
                    <td className="num">{fmtNum(c.rsi14, 1)}</td>
                    <td className="num">{fmtNum(c.vol_ratio, 1)}</td>
                    <td className="num">{fmtNum(c.ext_pct)}</td>
                    <td className="num">{fmtNum(c.atr_pct, 1)}</td>
                    <td className="num">{fmtNum(c.turnover_cr, 1)}</td>
                    <td>
                      {c.llm_verdict ? (
                        <span className={`sw-verdict ${c.llm_verdict}`}>
                          {c.llm_verdict}
                        </span>
                      ) : (
                        <span className="sw-verdict none">not analysed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <VerdictLegend />
      </Card>

      {/* ---------------- Tracker: watchlist / open / closed / skipped ------ */}
      <Card
        title="Tracker"
        subtitle="The watchlist is yours to edit. Open and closed trades belong to the scheduler's paper books — this page never writes to them."
        right={
          <button
            className="sw-btn"
            onClick={fetchMarks}
            disabled={marksLoading || positions.length === 0}
          >
            {marksLoading ? "Fetching…" : "Fetch live marks"}
          </button>
        }
      >
        <div className="sw-tabs">
          {[
            ["watchlist", "Watchlist", watching.length],
            ["open", "Open", positions.length + taken.length],
            ["closed", "Closed", closed.length],
            ["skipped", "Skipped", skipped.length],
          ].map(([key, label, n]) => (
            <button
              key={key}
              className={`sw-tab${tab === key ? " active" : ""}`}
              onClick={() => setTab(key)}
            >
              {label} <em>{n}</em>
            </button>
          ))}
        </div>

        {tab === "watchlist" ? (
          <>
            <form className="sw-logform" onSubmit={addWatch}>
              <div className="sw-logform-title">Log a name</div>
              <div className="sw-logform-grid">
                {[
                  ["symbol", "Symbol", "DYCL", "text"],
                  ["pattern", "Pattern", "Cup & handle", "text"],
                  ["entry", "Entry", "", "number"],
                  ["stop", "Stop", "", "number"],
                  ["target", "Target", "", "number"],
                  ["flagged", "Flagged", "", "date"],
                ].map(([k, label, ph, type]) => (
                  <label key={k}>
                    <span>{label}</span>
                    <input
                      type={type}
                      step="any"
                      placeholder={ph}
                      value={form[k]}
                      onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                    />
                  </label>
                ))}
                <label className="wide">
                  <span>Note</span>
                  <input
                    type="text"
                    placeholder="Why this one, and what would change your mind"
                    value={form.note}
                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                  />
                </label>
              </div>
              <button
                className="sw-btn primary"
                type="submit"
                disabled={busy || !form.symbol.trim()}
              >
                Add to watchlist
              </button>
            </form>

            {watching.length === 0 ? (
              <Empty>
                Nothing on the watchlist. Log the names you are considering —
                including the ones you decide against. The Skipped tab is the
                point: if what you skip outperforms what you take, the problem is
                your trigger, not the screen.
              </Empty>
            ) : (
              watching.map((w) => (
                <WatchCard
                  key={w.id}
                  item={w}
                  rules={rules}
                  onPatch={patchWatch}
                  onDelete={removeWatch}
                />
              ))
            )}
          </>
        ) : null}

        {tab === "open" ? (
          <>
            {taken.map((w) => (
              <WatchCard
                key={`w${w.id}`}
                item={w}
                rules={rules}
                onPatch={patchWatch}
                onDelete={removeWatch}
              />
            ))}
            {positions.length === 0 && taken.length === 0 ? (
              <Empty>
                Nothing open. Names you mark as triggered appear here, and the
                scheduler's paper entries are filled at the next session's open
                by <code>job_fill</code> — never at the signal bar's close.
              </Empty>
            ) : null}
            {positions.length === 0 && taken.length > 0 ? (
              <p className="sw-note">
                These are names you marked as taken. The scheduler's paper books
                have no open position yet — it fills at the next session's open,
                and it only acts on names the screen passed.
              </p>
            ) : null}
            {positions.map((p) => {
              const m = markBySym.get(`${p.book}:${p.id}`);
              return (
                <div className="sw-trade" key={`${p.book}-${p.id}`}>
                  <div className="sw-trade-head">
                    <div>
                      <h3>{p.symbol}</h3>
                      <p className="sw-trade-sub">
                        <span className={`sw-book ${p.book.toLowerCase()}`}>
                          {p.book}
                        </span>{" "}
                        · entered {p.entry_date} · held {p.days_held ?? "—"}/
                        {p.time_stop_days} sessions
                      </p>
                    </div>
                    <span className="sw-status open">OPEN</span>
                  </div>
                  <PriceRail
                    stop={p.stop}
                    entry={p.entry}
                    target={p.target}
                    mark={m ? m.last : null}
                  />
                  <div className="sw-minis">
                    <Stat label="Last mark" value={m ? `₹${fmtNum(m.last)}` : "—"} />
                    <Stat
                      label="R now"
                      value={m ? fmtR(m.unrealised_R) : "—"}
                      cls={m ? signClass(m.unrealised_R) : ""}
                    />
                    <Stat label="1R" value={`₹${fmtNum(p.risk_per_share)}`} />
                    <Stat label="Planned R:R" value={`${fmtNum(p.rr_planned)} : 1`} />
                    <Stat label="Shares" value={fmtInt(p.qty)} />
                  </div>
                </div>
              );
            })}
          </>
        ) : null}

        {tab === "closed" ? (
          closed.length === 0 ? (
            <Empty>No closed paper trades yet.</Empty>
          ) : (
            closed.map((c, i) => (
              <div className="sw-trade closed" key={i}>
                <div className="sw-trade-head">
                  <div>
                    <h3>{c.symbol}</h3>
                    <p className="sw-trade-sub">
                      <span className={`sw-book ${c.book.toLowerCase()}`}>
                        {c.book}
                      </span>{" "}
                      · {c.entry_date} → {c.exit_date}
                    </p>
                  </div>
                  <span className={`sw-exit ${c.exit_reason}`}>{c.exit_reason}</span>
                </div>
                <div className="sw-minis">
                  <Stat label="Entry" value={`₹${fmtNum(c.entry)}`} />
                  <Stat label="Exit" value={`₹${fmtNum(c.exit_price)}`} />
                  <Stat
                    label="Result"
                    value={fmtR(c.r_multiple)}
                    cls={signClass(c.r_multiple)}
                  />
                  <Stat
                    label="P&L"
                    value={`₹${fmtInt(c.pnl)}`}
                    cls={signClass(c.pnl)}
                  />
                </div>
              </div>
            ))
          )
        ) : null}

        {tab === "skipped" ? (
          skipped.length === 0 ? (
            <Empty>
              Nothing skipped yet. Names you pass on are worth keeping — a skip
              log is the only way to find out whether your entry trigger is
              costing you.
            </Empty>
          ) : (
            skipped.map((w) => (
              <WatchCard
                key={w.id}
                item={w}
                rules={rules}
                onPatch={patchWatch}
                onDelete={removeWatch}
              />
            ))
          )
        ) : null}

        {marksError ? (
          <p className="sw-note err">Live marks failed: {marksError}</p>
        ) : null}
      </Card>

      {/* ---------------- Books comparison ---------------- */}
      <Card
        title="Closed-trade performance"
        subtitle="The question the two-book design exists to answer: is the edge in the screen, or in how the risk is framed?"
      >
        {!bothHaveTrades ? (
          <Empty>
            No closed trades yet. Expectancy needs roughly 30 before it means
            anything, and the two books cannot be compared under 10 each.
          </Empty>
        ) : (
          <>
            <div className="sw-books">
              {[fixed, structural].map((b) => (
                <div className="sw-book-card" key={b.book}>
                  <div className={`sw-book ${String(b.book).toLowerCase()}`}>
                    {b.book}
                  </div>
                  {b.closed ? (
                    <>
                      <div className="sw-stat-row">
                        <span>Closed</span>
                        <b>{b.closed}</b>
                      </div>
                      <div className="sw-stat-row">
                        <span>Win rate</span>
                        <b>{b.win_rate}%</b>
                      </div>
                      <div className="sw-stat-row">
                        <span>Total</span>
                        <b className={signClass(b.total_R)}>{fmtR(b.total_R)}</b>
                      </div>
                      <div className="sw-stat-row">
                        <span>Expectancy</span>
                        <b className={signClass(b.expectancy_R)}>
                          {fmtR(b.expectancy_R)}
                        </b>
                      </div>
                      <div className="sw-stat-row">
                        <span>Avg win / loss</span>
                        <b>
                          {fmtR(b.avg_win_R)} / {fmtR(b.avg_loss_R)}
                        </b>
                      </div>
                      <div className="sw-stat-row">
                        <span>Open</span>
                        <b>{b.open}</b>
                      </div>
                      <div className="sw-exits">
                        {Object.entries(b.exit_reasons || {}).map(([k, v]) => (
                          <span className="sw-tag" key={k}>
                            {k} {v}
                          </span>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="sw-stat-row">
                      <span>No closed trades</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <p className={`sw-note ${books.verdict ? "verdict" : ""}`}>
              {books.verdict
                ? `After ${books.verdict.n} closed trades each, the ${
                    books.verdict.leader === "FIXED"
                      ? "fixed-percent"
                      : "volatility-based"
                  } rules lead by ${books.verdict.gap_R}R per trade.`
                : "Fewer than 10 closed trades per book — too early to compare."}
            </p>
          </>
        )}

      </Card>

      {/* ---------------- Funnel + tokens ---------------- */}
      <div className="sw-grid-2">
        <Card
          title="Screen funnel"
          subtitle={
            funnel.scan_date
              ? `${funnel.screened} screened on ${funnel.scan_date}`
              : "no scan recorded"
          }
        >
          {funnel.rejections.length === 0 ? (
            <Empty>Nothing recorded yet.</Empty>
          ) : (
            <div className="sw-funnel">
              <div className="sw-funnel-row passed">
                <span className="sw-funnel-label">Passed</span>
                <Bar
                  pct={
                    funnel.screened ? (funnel.passed / funnel.screened) * 100 : 0
                  }
                  tone="ok"
                />
                <span className="sw-funnel-n">{funnel.passed}</span>
              </div>
              {funnel.rejections.map((r) => (
                <div className="sw-funnel-row" key={r.reason}>
                  <span className="sw-funnel-label">
                    {REASON_LABEL[r.reason] || r.reason}
                  </span>
                  <Bar
                    pct={funnel.screened ? (r.n / funnel.screened) * 100 : 0}
                  />
                  <span className="sw-funnel-n">{r.n}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card
          title="LLM spend"
          subtitle={
            tokens.fallback
              ? `${tokens.day} — most recent day with activity; nothing spent yet today`
              : `${tokens.day} · the guard refuses a call before it breaches either budget`
          }
        >
          {tokens.providers.filter((p) => p.tokens_used || p.requests_used)
            .length === 0 ? (
            <Empty>No LLM calls on {tokens.day}.</Empty>
          ) : (
            <div className="sw-budgets">
              {tokens.providers
                .filter((p) => p.tokens_used || p.requests_used)
                .map((p) => (
                  <div className="sw-budget" key={p.provider}>
                    <div className="sw-budget-head">
                      <b>{p.provider}</b>
                      <span className="sw-muted">
                        {fmtInt(p.tokens_used)} / {fmtInt(p.token_budget)} tok ·{" "}
                        {p.requests_used} / {p.request_budget} req
                      </span>
                    </div>
                    <Bar pct={p.token_pct} />
                    <Bar pct={p.request_pct} tone="alt" />
                  </div>
                ))}
              <div className="sw-table-scroll tight">
                <table className="sw-table">
                  <thead>
                    <tr>
                      <th>Node</th>
                      <th className="num">Req</th>
                      <th className="num">In</th>
                      <th className="num">Out</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tokens.rows.map((r, i) => (
                      <tr key={i}>
                        <td className="sym">{r.node}</td>
                        <td className="num">{r.calls}</td>
                        <td className="num">{fmtInt(r.tokens_in)}</td>
                        <td className="num">{fmtInt(r.tokens_out)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>
      </div>

      {tip ? (
        <div className="sw-tip" role="status">
          <b>{tip.label.replace("  ✔", "")}</b>
          <span className={signClass(tip.value)}>
            {tip.value >= 0 ? "+" : "−"}
            {Math.abs(tip.value).toFixed(2)}%
          </span>
          {tip.meta && tip.meta.advance !== undefined ? (
            <span className="sw-muted">
              breadth {tip.meta.advance}/{tip.meta.decline} · PE{" "}
              {fmtNum(tip.meta.sector_pe, 1)} · {tip.meta.stock_cnt} stocks
            </span>
          ) : null}
          {tip.meta && tip.meta.tech_trend ? (
            <span className="sw-muted">
              {tip.meta.tech_trend}
              {tip.meta.pe ? ` · PE ${fmtNum(tip.meta.pe, 1)}` : ""}
              {tip.meta.passed_screen ? " · passed the screen" : ""}
            </span>
          ) : null}
        </div>
      ) : null}

      <p className="sw-foot">
        Reading <code>{data.db_path}</code>. This page only reads — the scheduler
        in <code>jobs.py</code> is the sole writer.
      </p>
    </div>
  );
}
