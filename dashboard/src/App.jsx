// dashboard/src/App.jsx
//
// Blockchain CI/CD Integrity System — Premium Dashboard UI
// Dark cyberpunk aesthetic with animated elements and
// professional data visualization.

import React, { useState, useEffect } from "react";
import { useContracts }  from "./hooks/useContract";
import { useEvents }     from "./hooks/useEvents";
import IntegrityStatus   from "./components/IntegrityStatus";
import AuditTrail        from "./components/AuditTrail";
import HashDiffViewer    from "./components/HashDiffViewer";

// ─── Inject global styles ────────────────────────────────────────────────────

const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400&family=Syne:wght@400;600;700;800&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:         #080C14;
    --bg2:        #0D1220;
    --bg3:        #111827;
    --border:     rgba(0, 240, 180, 0.15);
    --border2:    rgba(0, 240, 180, 0.08);
    --accent:     #00F0B4;
    --accent2:    #0EA5E9;
    --accent3:    #F59E0B;
    --danger:     #EF4444;
    --success:    #10B981;
    --text:       #E2E8F0;
    --text2:      #94A3B8;
    --text3:      #475569;
    --font-head:  'Syne', sans-serif;
    --font-mono:  'Space Mono', monospace;
  }

  html { font-size: 16px; -webkit-font-smoothing: antialiased; }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-head);
    min-height: 100vh;
    overflow-x: hidden;
  }

  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: var(--bg); }
  ::-webkit-scrollbar-thumb { background: var(--accent); border-radius: 2px; }

  /* Animated grid background */
  body::before {
    content: '';
    position: fixed;
    inset: 0;
    background-image:
      linear-gradient(rgba(0,240,180,0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0,240,180,0.03) 1px, transparent 1px);
    background-size: 40px 40px;
    pointer-events: none;
    z-index: 0;
  }

  /* Glow orbs */
  body::after {
    content: '';
    position: fixed;
    top: -20%;
    left: -10%;
    width: 60%;
    height: 60%;
    background: radial-gradient(ellipse, rgba(0,240,180,0.04) 0%, transparent 70%);
    pointer-events: none;
    z-index: 0;
  }

  @keyframes pulse-glow {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  @keyframes slide-up {
    from { opacity: 0; transform: translateY(20px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @keyframes fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  @keyframes scan {
    0% { transform: translateY(-100%); }
    100% { transform: translateY(100vh); }
  }

  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }

  .animate-up { animation: slide-up 0.6s ease both; }
  .animate-up-2 { animation: slide-up 0.6s 0.1s ease both; }
  .animate-up-3 { animation: slide-up 0.6s 0.2s ease both; }
  .animate-up-4 { animation: slide-up 0.6s 0.3s ease both; }

  .scanline {
    position: fixed;
    top: 0; left: 0; right: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, rgba(0,240,180,0.3), transparent);
    animation: scan 8s linear infinite;
    pointer-events: none;
    z-index: 9999;
  }

  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  button { font-family: var(--font-head); cursor: pointer; }
  code, pre { font-family: var(--font-mono); }
`;

// ─── Components ───────────────────────────────────────────────────────────────

function Logo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      {/* Animated hex icon */}
      <div style={{ position: "relative", width: 36, height: 36 }}>
        <svg viewBox="0 0 36 36" width="36" height="36">
          <polygon
            points="18,2 33,10 33,26 18,34 3,26 3,10"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="1.5"
            style={{ animation: "pulse-glow 2s ease infinite" }}
          />
          <polygon
            points="18,8 27,13 27,23 18,28 9,23 9,13"
            fill="rgba(0,240,180,0.1)"
            stroke="var(--accent)"
            strokeWidth="0.8"
            opacity="0.6"
          />
          <circle cx="18" cy="18" r="3" fill="var(--accent)" />
        </svg>
      </div>
      <div>
        <div style={{
          fontSize: 15,
          fontWeight: 800,
          letterSpacing: "0.08em",
          color: "#fff",
          textTransform: "uppercase",
          lineHeight: 1.1,
        }}>
          <span style={{ color: "var(--accent)" }}>OPRICO </span>Chain<span style={{ color: "var(--accent)" }}>Guard</span>
        </div>
        <div style={{
          fontSize: 9,
          color: "var(--text3)",
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          fontFamily: "var(--font-mono)",
          marginTop: 1,
        }}>
          CI/CD INTEGRITY SYSTEM
        </div>
      </div>
    </div>
  );
}

function LiveIndicator({ loading }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 6,
      fontFamily: "var(--font-mono)",
      fontSize: 10,
      color: loading ? "var(--text3)" : "var(--accent)",
      letterSpacing: "0.1em",
    }}>
      <div style={{
        width: 6, height: 6,
        borderRadius: "50%",
        background: loading ? "var(--text3)" : "var(--accent)",
        boxShadow: loading ? "none" : "0 0 8px var(--accent)",
        animation: loading ? "none" : "pulse-glow 1.5s ease infinite",
      }} />
      {loading ? "SYNCING..." : "LIVE"}
    </div>
  );
}

function StatPill({ label, value, color = "var(--accent)" }) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "10px 20px",
      background: "rgba(255,255,255,0.02)",
      border: "1px solid var(--border2)",
      borderRadius: 8,
      minWidth: 80,
    }}>
      <div style={{
        fontSize: 22,
        fontWeight: 800,
        color,
        fontFamily: "var(--font-mono)",
        lineHeight: 1,
      }}>
        {value}
      </div>
      <div style={{
        fontSize: 9,
        color: "var(--text3)",
        letterSpacing: "0.15em",
        textTransform: "uppercase",
        marginTop: 4,
      }}>
        {label}
      </div>
    </div>
  );
}

function TabBar({ active, onChange, failures }) {
  const tabs = [
    { id: "status",  label: "Status",     icon: "◈" },
    { id: "audit",   label: "Audit Trail", icon: "≡" },
    { id: "diff",    label: "Hash Diff",   icon: "⊕", badge: failures },
  ];

  return (
    <div style={{
      display: "flex",
      gap: 2,
      padding: "4px",
      background: "rgba(255,255,255,0.02)",
      border: "1px solid var(--border2)",
      borderRadius: 10,
    }}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 18px",
            borderRadius: 7,
            border: "none",
            background: active === tab.id
              ? "rgba(0,240,180,0.1)"
              : "transparent",
            color: active === tab.id ? "var(--accent)" : "var(--text3)",
            fontSize: 12,
            fontWeight: active === tab.id ? 700 : 400,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            transition: "all 0.2s",
            boxShadow: active === tab.id
              ? "inset 0 0 0 1px rgba(0,240,180,0.2)"
              : "none",
          }}
        >
          <span style={{ fontSize: 14 }}>{tab.icon}</span>
          {tab.label}
          {tab.badge > 0 && (
            <span style={{
              fontSize: 9,
              padding: "1px 5px",
              borderRadius: 10,
              background: "var(--danger)",
              color: "#fff",
              fontWeight: 700,
              lineHeight: 1.6,
            }}>
              {tab.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function NetworkBadge() {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 6,
      padding: "5px 10px",
      background: "rgba(14,165,233,0.08)",
      border: "1px solid rgba(14,165,233,0.2)",
      borderRadius: 6,
      fontFamily: "var(--font-mono)",
      fontSize: 10,
      color: "var(--accent2)",
      letterSpacing: "0.1em",
    }}>
      <div style={{
        width: 5, height: 5,
        borderRadius: "50%",
        background: "var(--accent2)",
        boxShadow: "0 0 6px var(--accent2)",
      }} />
      SEPOLIA TESTNET
    </div>
  );
}

function ErrorPage({ message }) {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--bg)",
      padding: 24,
    }}>
      <div style={{
        maxWidth: 480,
        padding: "40px",
        background: "var(--bg2)",
        border: "1px solid rgba(239,68,68,0.3)",
        borderRadius: 16,
        boxShadow: "0 0 40px rgba(239,68,68,0.08)",
      }}>
        <div style={{
          fontSize: 11,
          color: "var(--danger)",
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          fontFamily: "var(--font-mono)",
          marginBottom: 12,
        }}>
          ⚠ CONFIGURATION ERROR
        </div>
        <div style={{ fontSize: 14, color: "var(--text2)", lineHeight: 1.6 }}>
          {message}
        </div>
        <div style={{
          marginTop: 20,
          padding: "12px 16px",
          background: "rgba(255,255,255,0.02)",
          borderRadius: 8,
          fontSize: 12,
          color: "var(--text3)",
          fontFamily: "var(--font-mono)",
        }}>
          Make sure <span style={{ color: "var(--accent)" }}>dashboard/.env</span> has all required variables set.
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [activeTab, setActiveTab] = useState("status");
  const [time, setTime]           = useState(new Date());

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Inject styles
  useEffect(() => {
    const el = document.createElement("style");
    el.textContent = GLOBAL_CSS;
    document.head.appendChild(el);
    return () => document.head.removeChild(el);
  }, []);

  const contracts = useContracts();
  const { events, verifications, stats, loading, error, refetch } =
    useEvents(contracts);

  const pipelineId = import.meta.env.VITE_PIPELINE_ID || "1";
  const failures   = verifications.filter(v => !v.passed).length;

  if (contracts.error) return <ErrorPage message={contracts.error} />;

  return (
    <>
      {/* Scanline effect */}
      <div className="scanline" />

      <div style={{ position: "relative", zIndex: 1, minHeight: "100vh" }}>

        {/* ── Header ────────────────────────────────────────────────────── */}
        <header style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          background: "rgba(8,12,20,0.92)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--border)",
          boxShadow: "0 0 30px rgba(0,240,180,0.04)",
        }}>
          {/* Top bar */}
          <div style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "14px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}>
            <Logo />

            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <NetworkBadge />

              {/* Clock */}
              <div style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--text3)",
                letterSpacing: "0.08em",
              }}>
                {time.toUTCString().slice(17, 25)} UTC
              </div>

              <LiveIndicator loading={loading} />

              {/* Refresh button */}
              <button
                onClick={refetch}
                disabled={loading}
                style={{
                  padding: "7px 14px",
                  background: "transparent",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  color: loading ? "var(--text3)" : "var(--accent)",
                  fontSize: 11,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  transition: "all 0.2s",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {loading ? "Syncing..." : "↻ Refresh"}
              </button>
            </div>
          </div>

          {/* Stats bar */}
          {!loading && (
            <div style={{
              maxWidth: 1100,
              margin: "0 auto",
              padding: "0 24px 14px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}>
              <StatPill label="Total"    value={stats.total}    color="var(--text)" />
              <StatPill label="Passed"   value={stats.passes}   color="var(--success)" />
              <StatPill label="Failed"   value={stats.failures} color={stats.failures > 0 ? "var(--danger)" : "var(--text3)"} />
              <div style={{ flex: 1 }} />
              <div style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--text3)",
                letterSpacing: "0.1em",
              }}>
                PIPELINE #{pipelineId}
              </div>
            </div>
          )}

          {/* Tab bar */}
          <div style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "0 24px 14px",
          }}>
            <TabBar
              active={activeTab}
              onChange={setActiveTab}
              failures={failures}
            />
          </div>
        </header>

        {/* ── Main content ──────────────────────────────────────────────── */}
        <main style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "32px 24px 60px",
        }}>

          {/* Error banner */}
          {error && (
            <div style={{
              padding: "12px 16px",
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: 8,
              color: "var(--danger)",
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              marginBottom: 24,
              letterSpacing: "0.05em",
            }}>
              ⚠ {error}
            </div>
          )}

          <div className="animate-up">
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
          </div>
        </main>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <footer style={{
          borderTop: "1px solid var(--border2)",
          padding: "20px 24px",
          textAlign: "center",
        }}>
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--text3)",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
          }}>
            Blockchain CI/CD Integrity System &nbsp;·&nbsp;
            Ethereum Sepolia Testnet &nbsp;·&nbsp;
            Final Year Project &nbsp;·&nbsp;
            <span style={{ color: "var(--accent)" }}>ChainGuard v1.0</span>
          </div>
        </footer>

      </div>
    </>
  );
}
