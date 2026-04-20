// dashboard/src/components/HashDiffViewer.jsx
//
// Shows a side-by-side comparison of the expected (approved) hash
// versus the actual (candidate) hash for every failed verification.
// Makes it immediately obvious that tampering occurred and exactly
// what the discrepancy is.

import React, { useState } from "react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Render a hash string with mismatched characters highlighted in red. */
function DiffHash({ expected, actual, isExpected }) {
  if (!expected || !actual) {
    return (
      <span style={{ fontFamily: "monospace", fontSize: 12, wordBreak: "break-all" }}>
        {isExpected ? expected : actual}
      </span>
    );
  }

  // Strip 0x prefix for character-level comparison
  const exp = expected.replace(/^0x/, "");
  const act = actual.replace(/^0x/, "");
  const src = isExpected ? exp : act;

  return (
    <span style={{ fontFamily: "monospace", fontSize: 12, wordBreak: "break-all", lineHeight: 1.7 }}>
      <span style={{ color: "#5F5E5A" }}>0x</span>
      {src.split("").map((char, i) => {
        const matches = exp[i] === act[i];
        return (
          <span
            key={i}
            style={{
              color:      matches ? "#3B6D11"  : (isExpected ? "#A32D2D" : "#A32D2D"),
              background: matches ? "transparent" : (isExpected ? "#F7C1C1" : "#FCEBEB"),
              borderRadius: 2,
            }}
          >
            {char}
          </span>
        );
      })}
    </span>
  );
}

// ─── Single diff card ─────────────────────────────────────────────────────────

function DiffCard({ verification }) {
  const [expanded, setExpanded] = useState(false);
  const formatTs = ts => new Date(ts * 1000).toLocaleString();

  const headerStyle = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "14px 16px",
    background: "#FCEBEB",
    borderRadius: expanded ? "8px 8px 0 0" : 8,
    border: "1px solid #F0997B",
    cursor: "pointer",
    userSelect: "none",
  };

  const bodyStyle = {
    border: "1px solid #F0997B",
    borderTop: "none",
    borderRadius: "0 0 8px 8px",
    padding: 16,
    background: "#fff",
  };

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={headerStyle} onClick={() => setExpanded(e => !e)}>
        <div>
          <span style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#A32D2D",
            marginRight: 10,
          }}>
            ❌ Tamper detected
          </span>
          <span style={{ fontSize: 12, color: "#712B13" }}>
            Run #{verification.runId} · {formatTs(verification.timestamp)} · by {verification.actor}
          </span>
        </div>
        <span style={{ fontSize: 12, color: "#993C1D" }}>
          {expanded ? "▲ hide" : "▼ show diff"}
        </span>
      </div>

      {expanded && (
        <div style={bodyStyle}>
          {/* Metadata row */}
          <div style={{
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
            marginBottom: 16,
            fontSize: 12,
            color: "#5F5E5A",
          }}>
            <span>Pipeline <strong>#{verification.pipelineId}</strong></span>
            <span>Verification <strong>#{verification.verificationId}</strong></span>
            <span>Block <strong>#{verification.blockNumber}</strong></span>
            <a
              href={`https://sepolia.etherscan.io/tx/${verification.txHash}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: "#185FA5", textDecoration: "none" }}
            >
              View on Etherscan ↗
            </a>
          </div>

          {/* Hash comparison */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{
              background: "#EAF3DE",
              border: "1px solid #97C459",
              borderRadius: 8,
              padding: 12,
            }}>
              <div style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#3B6D11",
                marginBottom: 8,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}>
                Expected (approved)
              </div>
              <DiffHash
                expected={verification.approvedHash}
                actual={verification.candidateHash}
                isExpected={true}
              />
            </div>

            <div style={{
              background: "#FCEBEB",
              border: "1px solid #F09595",
              borderRadius: 8,
              padding: 12,
            }}>
              <div style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#A32D2D",
                marginBottom: 8,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}>
                Actual (live)
              </div>
              <DiffHash
                expected={verification.approvedHash}
                actual={verification.candidateHash}
                isExpected={false}
              />
            </div>
          </div>

          <div style={{ marginTop: 10, fontSize: 11, color: "#888780" }}>
            Green characters match · Red characters differ
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function HashDiffViewer({ verifications, loading }) {
  const failures = verifications?.filter(v => !v.passed) ?? [];

  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>
          Hash diff viewer
        </h2>
        {!loading && (
          <span style={{
            fontSize: 11,
            padding: "2px 10px",
            borderRadius: 20,
            background: failures.length > 0 ? "#FCEBEB" : "#F1EFE8",
            color:      failures.length > 0 ? "#791F1F" : "#444441",
            fontWeight: 500,
          }}>
            {failures.length} tamper{failures.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {loading ? (
        <div style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>
          Loading…
        </div>
      ) : failures.length === 0 ? (
        <div style={{
          padding: "20px 16px",
          background: "#EAF3DE",
          border: "1px solid #97C459",
          borderRadius: 8,
          fontSize: 13,
          color: "#3B6D11",
        }}>
          ✅ No tampered runs detected. All pipeline configs have matched their approved hashes.
        </div>
      ) : (
        <div>
          {failures.map(v => (
            <DiffCard key={v.verificationId} verification={v} />
          ))}
        </div>
      )}
    </section>
  );
}
