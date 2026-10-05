import { useState, useEffect, useMemo } from "react";

// ── Q12: Encrypt API payload ──
async function generateKey() {
  return await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

async function encryptPayload(data, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded,
  );
  return {
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(encrypted)),
  };
}

export default function ReactPractise() {
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [records, setRecords] = useState([]);
  const [encryptedResult, setEncryptedResult] = useState(null);

  const url = "https://jsonplaceholder.typicode.com/todos/1";

  // ── useEffect / useMemo (your existing code) ──
  const stableObj = useMemo(() => ({ url }), [url]);
  useEffect(() => {
    console.log("Fix 2 — stableObj reference:", stableObj);
    fetch(stableObj.url)
      .then((res) => res.json())
      .then((data) => console.log("Fix 2 result:", data));
  }, [stableObj]);

  // ── Q12: Encrypt on button click ──
  async function handleEncrypt() {
    const sensitiveData = {
      cardNumber: "4111111111111111",
      cvv: "123",
      name: "Narayanan Selvaraj",
    };

    console.log("Original data:", sensitiveData);

    const key = await generateKey();
    const result = await encryptPayload(sensitiveData, key);

    console.log("Encrypted iv:", result.iv);
    console.log("Encrypted data:", result.data);

    setEncryptedResult(result);
  }

  // ── Q13: Mask sensitive data ──
  function maskCard(cardNumber) {
    return "4*** **** **** " + cardNumber.slice(-4);
  }

  // ── Q14: Pagination — fetch page from API ──
  useEffect(() => {
    console.log("Fetching page:", page);
    fetch(`https://jsonplaceholder.typicode.com/todos?_page=${page}&_limit=5`)
      .then((res) => res.json())
      .then((data) => {
        console.log("Page data:", data);
        setRecords(data);
      });
  }, [page]);

  return (
    <div style={{ padding: "20px", fontFamily: "monospace" }}>
      {/* ── Re-render test ── */}
      <section style={{ marginBottom: "30px" }}>
        <h3>useEffect / useMemo test</h3>
        <button onClick={() => setCount((c) => c + 1)}>
          Re-render ({count})
        </button>
        <p style={{ color: "gray", fontSize: "12px" }}>
          Click and watch console — Fix 2 does NOT re-fetch
        </p>
      </section>

      {/* ── Q12: Encryption ── */}
      <section style={{ marginBottom: "30px" }}>
        <h3>Q12 — Encrypt API payload</h3>
        <button onClick={handleEncrypt}>Encrypt sensitive data</button>
        {encryptedResult && (
          <div style={{ marginTop: "10px" }}>
            <p style={{ color: "green" }}>
              Encrypted! Check console for iv and data.
            </p>
            <p style={{ fontSize: "12px", color: "gray" }}>
              iv (first 5): [{encryptedResult.iv.slice(0, 5).join(", ")}...]
            </p>
          </div>
        )}
      </section>

      {/* ── Q13: Masking ── */}
      <section style={{ marginBottom: "30px" }}>
        <h3>Q13 — Mask sensitive data</h3>
        <p>Raw card: 4111111111111111</p>
        <p>Masked: {maskCard("4111111111111111")}</p>
        <p style={{ fontSize: "12px", color: "gray" }}>
          Never show full card number in UI
        </p>
      </section>

      {/* ── Q14: Pagination ── */}
      <section>
        <h3>Q14 — Pagination (3 lakh records strategy)</h3>
        <p style={{ fontSize: "12px", color: "gray" }}>
          Fetching only 5 records per page — not all at once
        </p>
        <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Previous
          </button>
          <span>Page {page}</span>
          <button onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
        <table
          border="1"
          cellPadding="8"
          style={{ borderCollapse: "collapse" }}
        >
          <thead>
            <tr>
              <th>ID</th>
              <th>Title</th>
              <th>Completed</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td>
                <td>{r.title.slice(0, 30)}...</td>
                <td>{r.completed ? "✅" : "❌"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
