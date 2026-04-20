// dashboard/src/App.jsx
//
// Root component. Fetches all blockchain data once via hooks and
// passes it down to the three display components. Handles loading
// and error states centrally.

import React, { useState } from "react";
import { useContracts }     from "./hooks/useContract";
import { useEvents }        from "./hooks/useEvents";
import IntegrityStatus      from "./components/IntegrityStatus";
import AuditTrail           from "./components/AuditTrail";
import HashDiffViewer       from "./components/HashDiffViewer";

// ─── Layout constants ─────────────────────────────────────────────────────────

const TABS = [
  { id: "status",   label: "Integrity status" },
  { id: "audit",    label: "Audit trail"       },
  { id: "diff",     label: "Hash diff viewer"  },
];

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [activeTab, setActiveTab] = useState("status");

  const contracts = useContracts();
  const { events, verifications, stats, loading, error, refetch } =
    useEvents(contracts);

  const pipelineId = import.meta.env.VITE_PIPELINE_ID || "1";

  // ── Error state ────────────────────────────────────────────────────────────
  if (contracts.error) {
    return (
      <div style={styles.errorPage}>
        <div style={styles.errorCard}>
          <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 8, color: "#A32D2D" }}>
            Configuration error
          </div>
          <div style={{ fontSize: 13, color: "#712B13" }}>
            {contracts.error}
          </div>
          <div style={{ marginTop: 16, fontSize: 12, color: "#5F5E5A" }}>
            Make sure <code>dashboard/.env</code> has all required variables set.
            See <code>.env.example</code> for reference.
          </div>
        </div>
      </div>
    );
  }

  // ── Main layout ────────────────────────────────────────────────────────────
  return (
    <div style={styles.page}>

      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div>
            <div style={styles.headerTitle}>
              Blockchain CI/CD Integrity System
            </div>
            <div style={styles.headerSubtitle}>
              Pipeline #{pipelineId} · Sepolia testnet · Real-time audit dashboard
            </div>
          </div>

          <button
            onClick={refetch}
            disabled={loading}
            style={styles.refreshButton}
          >
            {loading ? "Loading…" : "↻ Refresh"}
          </button>
        </div>

        {/* Tab bar */}
        <nav style={styles.tabBar}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                ...styles.tab,
                ...(activeTab === tab.id ? styles.tabActive : {}),
              }}
            >
              {tab.label}
              {tab.id === "diff" && !loading && verifications.filter(v => !v.passed).length > 0 && (
                <span style={styles.tamperBadge}>
                  {verifications.filter(v => !v.passed).length}
                </span>
              )}
            </button>
          ))}
        </nav>
      </header>

      {/* Content */}
      <main style={styles.main}>
        {error && (
          <div style={styles.errorBanner}>
            ⚠ {error}
          </div>
        )}

        {activeTab === "status" && (
          <IntegrityStatus
            stats={stats}
            verifications={verifications}
            loading={loading}
          />
        )}

        {activeTab === "audit" && (
          <AuditTrail
            events={events}
            loading={loading}
            error={error}
          />
        )}

        {activeTab === "diff" && (
          <HashDiffViewer
            verifications={verifications}
            loading={loading}
          />
        )}
      </main>

      {/* Footer */}
      <footer style={styles.footer}>
        Final Year Project · Blockchain-based CI/CD Pipeline Integrity System ·
        Ethereum Sepolia Testnet
      </footer>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  page: {
    minHeight: "100vh",
    background: "#F6F5F0",
    fontFamily: "system-ui, -apple-system, sans-serif",
    color: "#2C2C2A",
  },
  header: {
    background: "#fff",
    borderBottom: "1px solid #E8E6DF",
    position: "sticky",
    top: 0,
    zIndex: 10,
  },
  headerInner: {
    maxWidth: 960,
    margin: "0 auto",
    padding: "16px 24px 0",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: "#2C2C2A",
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#888780",
    marginTop: 2,
  },
  refreshButton: {
    fontSize: 12,
    padding: "7px 14px",
    borderRadius: 6,
    border: "1px solid #D3D1C7",
    background: "#fff",
    color: "#444441",
    cursor: "pointer",
    marginTop: 4,
  },
  tabBar: {
    maxWidth: 960,
    margin: "0 auto",
    padding: "0 24px",
    display: "flex",
    gap: 0,
    marginTop: 12,
  },
  tab: {
    fontSize: 13,
    padding: "10px 16px",
    background: "none",
    border: "none",
    borderBottom: "2px solid transparent",
    cursor: "pointer",
    color: "#888780",
    fontWeight: 400,
    display: "flex",
    alignItems: "center",
    gap: 6,
    transition: "color 0.15s",
  },
  tabActive: {
    color: "#2C2C2A",
    fontWeight: 500,
    borderBottom: "2px solid #2C2C2A",
  },
  tamperBadge: {
    fontSize: 10,
    padding: "1px 6px",
    borderRadius: 20,
    background: "#FCEBEB",
    color: "#A32D2D",
    fontWeight: 600,
  },
  main: {
    maxWidth: 960,
    margin: "0 auto",
    padding: "28px 24px",
  },
  errorBanner: {
    padding: "12px 16px",
    background: "#FCEBEB",
    border: "1px solid #F0997B",
    borderRadius: 8,
    color: "#A32D2D",
    fontSize: 13,
    marginBottom: 20,
  },
  footer: {
    textAlign: "center",
    padding: "24px",
    fontSize: 11,
    color: "#B4B2A9",
    borderTop: "1px solid #E8E6DF",
    marginTop: 40,
  },
  errorPage: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#F6F5F0",
  },
  errorCard: {
    background: "#fff",
    border: "1px solid #F0997B",
    borderRadius: 10,
    padding: "28px 32px",
    maxWidth: 480,
  },
};
