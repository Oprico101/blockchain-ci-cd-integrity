// dashboard/src/hooks/useEvents.js
//
// Fetches CiCdEventLogged and VerificationResult events from the
// blockchain and returns them in a normalized format ready for
// the dashboard components to render.
//
// Usage:
//   const { events, verifications, stats, loading, error, refetch } = useEvents(contracts);

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";

/**
 * Stage enum — mirrors EventLogger.sol exactly.
 * Used to convert numeric stage values to readable labels.
 */
export const STAGE_LABELS = {
  0:  { label: "Pipeline triggered", color: "blue"   },
  1:  { label: "Build started",      color: "blue"   },
  2:  { label: "Build success",      color: "green"  },
  3:  { label: "Build failed",       color: "red"    },
  4:  { label: "Tests started",      color: "blue"   },
  5:  { label: "Tests passed",       color: "green"  },
  6:  { label: "Tests failed",       color: "red"    },
  7:  { label: "Integrity verified", color: "green"  },
  8:  { label: "Integrity failed",   color: "red"    },
  9:  { label: "Deploy started",     color: "blue"   },
  10: { label: "Deploy success",     color: "green"  },
  11: { label: "Deploy failed",      color: "red"    },
};

/**
 * Normalise a raw CiCdEventLogged event into a plain object.
 */
function normaliseLogEvent(event) {
  const a = event.args;
  return {
    type:        "log",
    logId:       a.logId.toString(),
    pipelineId:  a.pipelineId.toString(),
    runId:       a.runId.toString(),
    stage:       Number(a.stage),
    stageLabel:  STAGE_LABELS[Number(a.stage)]?.label ?? "Unknown",
    stageColor:  STAGE_LABELS[Number(a.stage)]?.color ?? "gray",
    configHash:  a.configHash,
    commitHash:  a.commitHash,
    actor:       a.actor,
    loggedBy:    a.loggedBy,
    timestamp:   Number(a.timestamp),
    blockNumber: event.blockNumber,
    txHash:      event.transactionHash,
  };
}

/**
 * Normalise a raw VerificationResult event into a plain object.
 */
function normaliseVerification(event) {
  const a = event.args;
  return {
    type:             "verification",
    verificationId:   a.verificationId.toString(),
    pipelineId:       a.pipelineId.toString(),
    runId:            a.runId.toString(),
    candidateHash:    a.candidateHash,
    approvedHash:     a.approvedHash,
    passed:           a.passed,
    actor:            a.actor,
    timestamp:        Number(a.timestamp),
    blockNumber:      event.blockNumber,
    txHash:           event.transactionHash,
  };
}

/**
 * Main hook — fetches all events from both EventLogger and Verifier.
 *
 * @param {object} contracts  Result of useContracts() hook.
 * @param {number} pipelineId Optional — filter to one pipeline. 0 = all.
 */
export function useEvents(contracts, pipelineId = 0) {
  const [events,        setEvents]        = useState([]);
  const [verifications, setVerifications] = useState([]);
  const [stats,         setStats]         = useState({ total: 0, failures: 0, passes: 0 });
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);

  const fetchAll = useCallback(async () => {
    const { logger, verifier } = contracts;
    if (!logger || !verifier) return;

    setLoading(true);
    setError(null);

    try {
      // ── Fetch CiCdEventLogged events ──────────────────────────────────────
      const logFilter = pipelineId > 0
        ? logger.filters.CiCdEventLogged(null, pipelineId)
        : logger.filters.CiCdEventLogged();

      const rawLogEvents = await logger.queryFilter(logFilter, 0, "latest");
      const normalisedLogs = rawLogEvents
        .map(normaliseLogEvent)
        .sort((a, b) => b.timestamp - a.timestamp); // newest first

      setEvents(normalisedLogs);

      // ── Fetch VerificationResult events ───────────────────────────────────
      const verifyFilter = pipelineId > 0
        ? verifier.filters.VerificationResult(null, pipelineId)
        : verifier.filters.VerificationResult();

      const rawVerifyEvents = await verifier.queryFilter(verifyFilter, 0, "latest");
      const normalisedVerifications = rawVerifyEvents
        .map(normaliseVerification)
        .sort((a, b) => b.timestamp - a.timestamp);

      setVerifications(normalisedVerifications);

      // ── Fetch summary stats ───────────────────────────────────────────────
      const [total, failures, passes] = await verifier.getStats();
      setStats({
        total:    Number(total),
        failures: Number(failures),
        passes:   Number(passes),
      });

    } catch (err) {
      setError(err.message || "Failed to fetch blockchain events");
    } finally {
      setLoading(false);
    }
  }, [contracts, pipelineId]);

  useEffect(() => {
    if (contracts.logger && contracts.verifier) {
      fetchAll();
    }
  }, [fetchAll, contracts]);

  return { events, verifications, stats, loading, error, refetch: fetchAll };
}
