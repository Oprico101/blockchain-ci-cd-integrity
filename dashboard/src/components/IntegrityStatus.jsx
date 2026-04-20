// dashboard/src/components/IntegrityStatus.jsx
//
// Displays the overall pipeline integrity status at the top of the
// dashboard — total verifications, passes, failures, and the most
// recent verification outcome as a large pass/fail indicator.

import React from "react";

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, accent }) {
  const accents = {
    green:  { bg: "#EAF3DE", text: "#3B6D11", border: "#639922" },
    red:    { bg: "#FCEBEB", text: "#A32D2D", border: "#E24B4A" },
    blue:   { bg: "#E6F1FB", text: "#185FA5", border: "#378ADD" },
    neutral:{ bg: "#F1EFE8", text: "#444441", border: "#888780" },
  };
  const c = accents[accent] || accents.neutral;

  return (
    <div style={{
      flex: "1 1 140px",
      background: c.bg,
      border: `1px solid ${c.border}`,
      borderRadius: 10,
      padding: "18px 20px",
      minWidth: 120,
    }}>
      <div style={{ fontSize: 28, fontWeight: 600, color: c.text, lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: c.text, marginTop: 6, opacity: 0.85 }}>
        {label}
      </div>
    </div>
  );
}

function LatestVerification({ verification }) {
  if (!verification) {
    return (
      <div style={{
        padding: "18px 20px",
        background: "#F1EFE8",
        borderRadius: 10,
        border: "1px solid #B4B2A9",
        color: "#5F5E5A",
        fontSize: 13,
      }}>
        No verifications recorded yet.
      </div>
    );
  }

  const passed = verification.passed;
  const styles = {
    wrapper: {
      padding: "18px 20px",
      background: passed ? "#EAF3DE" : "#FCEBEB",
      borderRadius: 10,
      border: `1px solid ${passed ? "#639922" : "#E24B4A"}`,
    },
    badge: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      fontSize: 14,
      fontWeight: 600,
      color: passed ? "#3B6D11" : "#A32D2D",
      marginBottom: 10,
    },
    row: {
      display: "flex",
      gap: 8,
      flexWrap: "wrap",
      marginTop: 8,
    },
    chip: {
      fontSize: 11,
      padding: "3px 8px",
      borderRadius: 20,
      background: passed ? "#C0DD97" : "#F7C1C1",
      color: passed ? "#27500A" : "#791F1F",
      fontFamily: "monospace",
    },
    label: {
      fontSize: 11,
      color: passed ? "#3B6D11" : "#A32D2D",
      opacity: 0.75,
      marginTop: 2,
    },
  };

  const shortHash = h => h ? `${h.slice(0, 10)}…` : "—";
  const formatTs  = ts => new Date(ts * 1000).toLocaleString();

  return (
    <div style={styles.wrapper}>
      <div style={styles.badge}>
        {passed ? "✅ Last verification: PASSED" : "❌ Last verification: TAMPER DETECTED"}
      </div>
      <div style={{ fontSize: 12, color: passed ? "#3B6D11" : "#A32D2D", opacity: 0.8 }}>
        Run #{verification.runId} · {formatTs(verification.timestamp)} · by {verification.actor}
      </div>
      {!passed && (
        <div style={styles.row}>
          <div>
            <div style={styles.label}>Expected hash</div>
            <span style={styles.chip}>{shortHash(verification.approvedHash)}</span>
          </div>
          <div>
            <div style={styles.label}>Actual hash</div>
            <span style={{ ...styles.chip, background: "#F09595", color: "#501313" }}>
              {shortHash(verification.candidateHash)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function IntegrityStatus({ stats, verifications, loading }) {
  const latest = verifications?.[0] ?? null;
  const allClean = stats.total > 0 && stats.failures === 0;

  return (
    <section>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 16,
      }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>
          Pipeline integrity status
        </h2>
        {!loading && stats.total > 0 && (
          <span style={{
            fontSize: 11,
            padding: "2px 10px",
            borderRadius: 20,
            background: allClean ? "#EAF3DE" : "#FCEBEB",
            color:      allClean ? "#27500A" : "#791F1F",
            fontWeight: 500,
          }}>
            {allClean ? "All clean" : `${stats.failures} tamper${stats.failures !== 1 ? "s" : ""} detected`}
          </span>
        )}
      </div>

      {loading ? (
        <div style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>
          Loading blockchain data…
        </div>
      ) : (
        <>
          {/* Stat cards row */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <StatCard label="Total verifications" value={stats.total}    accent="neutral" />
            <StatCard label="Passed"               value={stats.passes}   accent="green"   />
            <StatCard label="Failed (tampers)"     value={stats.failures} accent={stats.failures > 0 ? "red" : "neutral"} />
          </div>

          {/* Latest verification detail */}
          <LatestVerification verification={latest} />
        </>
      )}
    </section>
  );
}
