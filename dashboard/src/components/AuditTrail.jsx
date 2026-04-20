// dashboard/src/components/AuditTrail.jsx
//
// Renders the full chronological list of every CI/CD event recorded
// on-chain, grouped by GitHub Actions run ID. Each entry shows the
// stage, actor, commit, config hash, and a link to Etherscan.

import React, { useState, useMemo } from "react";
import { STAGE_LABELS } from "../hooks/useEvents";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STAGE_COLORS = {
  green:  { bg: "#EAF3DE", text: "#27500A", dot: "#639922" },
  red:    { bg: "#FCEBEB", text: "#791F1F", dot: "#E24B4A" },
  blue:   { bg: "#E6F1FB", text: "#0C447C", dot: "#378ADD" },
  gray:   { bg: "#F1EFE8", text: "#444441", dot: "#888780" },
};

function StageBadge({ stage }) {
  const info   = STAGE_LABELS[stage] ?? { label: "Unknown", color: "gray" };
  const colors = STAGE_COLORS[info.color] ?? STAGE_COLORS.gray;

  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      fontSize: 11,
      fontWeight: 500,
      padding: "3px 9px",
      borderRadius: 20,
      background: colors.bg,
      color: colors.text,
      whiteSpace: "nowrap",
    }}>
      <span style={{
        width: 6, height: 6,
        borderRadius: "50%",
        background: colors.dot,
        display: "inline-block",
        flexShrink: 0,
      }} />
      {info.label}
    </span>
  );
}

function formatTs(ts) {
  return new Date(ts * 1000).toLocaleString();
}

function shortHash(h) {
  return h ? h.slice(0, 8) + "…" + h.slice(-6) : "—";
}

// ─── Single event row ─────────────────────────────────────────────────────────

function EventRow({ event, index }) {
  const [expanded, setExpanded] = useState(false);

  const rowStyle = {
    borderBottom: "1px solid #E8E6DF",
    padding: "12px 16px",
    cursor: "pointer",
    background: expanded ? "#FAFAF8" : (index % 2 === 0 ? "#fff" : "#FAFAF8"),
    transition: "background 0.1s",
  };

  return (
    <>
      <tr style={rowStyle} onClick={() => setExpanded(e => !e)}>
        <td style={{ width: 28, color: "#B4B2A9", fontSize: 11, paddingRight: 8 }}>
          #{event.logId}
        </td>
        <td style={{ paddingRight: 12 }}>
          <StageBadge stage={event.stage} />
        </td>
        <td style={{ fontSize: 12, color: "#5F5E5A", paddingRight: 12 }}>
          Run <strong style={{ color: "#2C2C2A" }}>#{event.runId}</strong>
        </td>
        <td style={{ fontSize: 12, color: "#5F5E5A", paddingRight: 12 }}>
          {event.actor}
        </td>
        <td style={{ fontSize: 11, fontFamily: "monospace", color: "#888780", paddingRight: 12 }}>
          {event.commitHash?.slice(0, 10)}
        </td>
        <td style={{ fontSize: 11, color: "#B4B2A9", textAlign: "right" }}>
          {formatTs(event.timestamp)}
        </td>
        <td style={{ fontSize: 11, color: "#B4B2A9", paddingLeft: 8 }}>
          {expanded ? "▲" : "▼"}
        </td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={7} style={{
            background: "#F6F5F0",
            padding: "12px 24px 16px",
            borderBottom: "1px solid #E8E6DF",
          }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 12,
              fontSize: 12,
            }}>
              <Detail label="Log ID"        value={`#${event.logId}`} />
              <Detail label="Pipeline ID"   value={`#${event.pipelineId}`} />
              <Detail label="Run ID"        value={`#${event.runId}`} />
              <Detail label="Actor"         value={event.actor} />
              <Detail label="Commit"        value={event.commitHash} mono />
              <Detail label="Config hash"   value={event.configHash} mono />
              <Detail label="Logged by"     value={event.loggedBy} mono />
              <Detail label="Block"         value={`#${event.blockNumber}`} />
              <Detail label="Timestamp"     value={formatTs(event.timestamp)} />
              {event.txHash && (
                <div>
                  <div style={{ color: "#888780", marginBottom: 2 }}>Transaction</div>
                  <a
                    href={`https://sepolia.etherscan.io/tx/${event.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#185FA5", fontFamily: "monospace", fontSize: 11 }}
                    onClick={e => e.stopPropagation()}
                  >
                    {shortHash(event.txHash)} ↗
                  </a>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Detail({ label, value, mono }) {
  return (
    <div>
      <div style={{ color: "#888780", marginBottom: 2, fontSize: 11 }}>{label}</div>
      <div style={{
        fontFamily: mono ? "monospace" : "inherit",
        fontSize: mono ? 11 : 12,
        color: "#2C2C2A",
        wordBreak: "break-all",
      }}>
        {value || "—"}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AuditTrail({ events, loading, error }) {
  const [filterStage,  setFilterStage]  = useState("all");
  const [filterActor,  setFilterActor]  = useState("");
  const [filterRunId,  setFilterRunId]  = useState("");

  // Unique actors for filter dropdown
  const actors = useMemo(() => {
    const seen = new Set(events.map(e => e.actor));
    return [...seen].sort();
  }, [events]);

  // Apply filters
  const filtered = useMemo(() => {
    return events.filter(e => {
      if (filterStage !== "all" && e.stage !== Number(filterStage)) return false;
      if (filterActor && e.actor !== filterActor) return false;
      if (filterRunId && !e.runId.includes(filterRunId)) return false;
      return true;
    });
  }, [events, filterStage, filterActor, filterRunId]);

  const inputStyle = {
    fontSize: 12,
    padding: "6px 10px",
    borderRadius: 6,
    border: "1px solid #D3D1C7",
    background: "#fff",
    color: "#2C2C2A",
    outline: "none",
  };

  return (
    <section>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 14,
        flexWrap: "wrap",
      }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>
          Audit trail
        </h2>
        {!loading && (
          <span style={{
            fontSize: 11,
            padding: "2px 10px",
            borderRadius: 20,
            background: "#F1EFE8",
            color: "#444441",
            fontWeight: 500,
          }}>
            {filtered.length} / {events.length} events
          </span>
        )}
      </div>

      {/* Filters */}
      {!loading && events.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          <select
            value={filterStage}
            onChange={e => setFilterStage(e.target.value)}
            style={inputStyle}
          >
            <option value="all">All stages</option>
            {Object.entries(STAGE_LABELS).map(([idx, { label }]) => (
              <option key={idx} value={idx}>{label}</option>
            ))}
          </select>

          <select
            value={filterActor}
            onChange={e => setFilterActor(e.target.value)}
            style={inputStyle}
          >
            <option value="">All actors</option>
            {actors.map(a => <option key={a} value={a}>{a}</option>)}
          </select>

          <input
            type="text"
            placeholder="Filter by run ID…"
            value={filterRunId}
            onChange={e => setFilterRunId(e.target.value)}
            style={{ ...inputStyle, width: 140 }}
          />

          {(filterStage !== "all" || filterActor || filterRunId) && (
            <button
              onClick={() => {
                setFilterStage("all");
                setFilterActor("");
                setFilterRunId("");
              }}
              style={{
                ...inputStyle,
                cursor: "pointer",
                color: "#993C1D",
                borderColor: "#F0997B",
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div style={{ color: "#888780", fontSize: 13 }}>Loading blockchain events…</div>
      ) : error ? (
        <div style={{
          padding: "16px",
          background: "#FCEBEB",
          borderRadius: 8,
          color: "#A32D2D",
          fontSize: 13,
        }}>
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          padding: "20px 16px",
          background: "#F1EFE8",
          borderRadius: 8,
          fontSize: 13,
          color: "#5F5E5A",
        }}>
          {events.length === 0
            ? "No pipeline events recorded yet. Run your first GitHub Actions workflow to see events here."
            : "No events match the current filters."}
        </div>
      ) : (
        <div style={{
          border: "1px solid #E8E6DF",
          borderRadius: 8,
          overflow: "hidden",
        }}>
          <table style={{
            width: "100%",
            borderCollapse: "collapse",
            tableLayout: "auto",
          }}>
            <thead>
              <tr style={{
                background: "#F6F5F0",
                borderBottom: "1px solid #E8E6DF",
                fontSize: 11,
                color: "#888780",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}>
                <th style={{ padding: "10px 8px 10px 16px", textAlign: "left", fontWeight: 500 }}>#</th>
                <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 500 }}>Stage</th>
                <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 500 }}>Run</th>
                <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 500 }}>Actor</th>
                <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 500 }}>Commit</th>
                <th style={{ padding: "10px 8px", textAlign: "right", fontWeight: 500 }}>Time</th>
                <th style={{ width: 24 }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((event, i) => (
                <EventRow key={event.logId} event={event} index={i} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
