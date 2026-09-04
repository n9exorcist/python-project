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

export default function SwingDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [marks, setMarks] = useState(null);
  const [marksLoading, setMarksLoading] = useState(false);
  const [marksError, setMarksError] = useState(null);

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

  useEffect(() => {
    load(true);
    const id = setInterval(() => load(false), POLL_MS);
    return () => clearInterval(id);
  }, [load]);

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

  const { scan, funnel, positions, closed, books, tokens, today } = data;
  const markBySym = new Map((marks || []).map((m) => [`${m.book}:${m.id}`, m]));

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
      </Card>

      {/* ---------------- Open positions ---------------- */}
      <Card
        title="Open positions"
        subtitle="The same signal is opened in both books at the same fill, so the difference between them is the risk framing and nothing else."
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
        {positions.length === 0 ? (
          <Empty>
            No open positions. Entries are filled at the next session's open by{" "}
            <code>job_fill</code>, never at the signal bar's close.
          </Empty>
        ) : (
          <>
            <div className="sw-table-scroll">
              <table className="sw-table">
                <thead>
                  <tr>
                    <th>Book</th>
                    <th>Symbol</th>
                    <th className="num">Entry</th>
                    <th className="num">Stop</th>
                    <th className="num">Target</th>
                    <th className="num">Qty</th>
                    <th className="num">Planned R:R</th>
                    <th className="num">Held</th>
                    <th className="num">Last</th>
                    <th className="num">Unrealised</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => {
                    const m = markBySym.get(`${p.book}:${p.id}`);
                    return (
                      <tr key={`${p.book}-${p.id}`}>
                        <td>
                          <span className={`sw-book ${p.book.toLowerCase()}`}>
                            {p.book}
                          </span>
                        </td>
                        <td className="sym">{p.symbol}</td>
                        <td className="num">{fmtNum(p.entry)}</td>
                        <td className="num">{fmtNum(p.stop)}</td>
                        <td className="num">{fmtNum(p.target)}</td>
                        <td className="num">{fmtInt(p.qty)}</td>
                        <td className="num">{fmtNum(p.rr_planned)}</td>
                        <td className="num">
                          {p.days_held ?? "—"}
                          <span className="sw-muted">/{p.time_stop_days}</span>
                        </td>
                        <td className="num">{m ? fmtNum(m.last) : "—"}</td>
                        <td
                          className={`num strong ${m ? signClass(m.unrealised_R) : ""}`}
                        >
                          {m ? fmtR(m.unrealised_R) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {marksError ? (
              <p className="sw-note err">Live marks failed: {marksError}</p>
            ) : (
              <p className="sw-note">
                Marks are a read-only view of where a position stands. Only the
                scheduler closes trades — this page never books an exit.
              </p>
            )}
          </>
        )}
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

        {closed.length > 0 ? (
          <div className="sw-table-scroll tight">
            <table className="sw-table">
              <thead>
                <tr>
                  <th>Book</th>
                  <th>Symbol</th>
                  <th>Exited</th>
                  <th>Reason</th>
                  <th className="num">Entry</th>
                  <th className="num">Exit</th>
                  <th className="num">R</th>
                  <th className="num">P&L ₹</th>
                </tr>
              </thead>
              <tbody>
                {closed.map((c, i) => (
                  <tr key={i}>
                    <td>
                      <span className={`sw-book ${c.book.toLowerCase()}`}>
                        {c.book}
                      </span>
                    </td>
                    <td className="sym">{c.symbol}</td>
                    <td>{c.exit_date}</td>
                    <td>
                      <span className={`sw-exit ${c.exit_reason}`}>
                        {c.exit_reason}
                      </span>
                    </td>
                    <td className="num">{fmtNum(c.entry)}</td>
                    <td className="num">{fmtNum(c.exit_price)}</td>
                    <td className={`num strong ${signClass(c.r_multiple)}`}>
                      {fmtR(c.r_multiple)}
                    </td>
                    <td className={`num ${signClass(c.pnl)}`}>
                      {fmtInt(c.pnl)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
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

      <p className="sw-foot">
        Reading <code>{data.db_path}</code>. This page only reads — the scheduler
        in <code>jobs.py</code> is the sole writer.
      </p>
    </div>
  );
}
