// src/config.js
//
// Loads all configuration from environment variables.
// When used as an npm package, users set these as GitHub Secrets
// or in their local .env file.
//
// Required environment variables:
//   CHAINGUARD_RPC_URL              — Sepolia RPC endpoint
//   CHAINGUARD_BOT_PRIVATE_KEY      — Bot wallet private key
//   CHAINGUARD_REGISTRY_ADDRESS     — PipelineRegistry contract address
//   CHAINGUARD_LOGGER_ADDRESS       — EventLogger contract address
//   CHAINGUARD_VERIFIER_ADDRESS     — Verifier contract address
//   CHAINGUARD_PIPELINE_ID          — Pipeline ID (default: 1)
//
// Optional: load from .env file if dotenv is available
try { require("dotenv").config(); } catch {}

"use strict";

// ─── ABIs (embedded so no artifacts folder needed) ────────────────────────────
// These are the minimal ABIs needed for the logger to function.
// Users do not need to compile contracts themselves.

const PIPELINE_REGISTRY_ABI = [
  "function verifyHash(uint256 pipelineId, bytes32 candidateHash) external view returns (bool)",
  "function getPipeline(uint256 pipelineId) external view returns (string memory name, bytes32 configHash, bool registered, bool revoked)",
  "function updateApprovedHash(uint256 pipelineId, bytes32 newHash) external",
];

const EVENT_LOGGER_ABI = [
  "function logEvent(uint256 pipelineId, uint256 runId, uint8 stage, bytes32 configHash, string calldata commitHash, string calldata actor, string calldata notes) external returns (uint256 logId)",
  "event CiCdEventLogged(uint256 indexed logId, uint256 indexed pipelineId, uint256 indexed runId, uint8 stage, bytes32 configHash, string commitHash, string actor, address loggedBy, uint256 timestamp)",
];

const VERIFIER_ABI = [
  "function verify(uint256 pipelineId, uint256 runId, bytes32 candidateHash, string calldata commitHash, string calldata actor) external returns (bool passed, uint256 verificationId)",
  "function checkOnly(uint256 pipelineId, bytes32 candidateHash) external view returns (bool)",
  "function getStats() external view returns (uint256 total, uint256 failures, uint256 passes)",
  "event VerificationResult(uint256 indexed verificationId, uint256 indexed pipelineId, uint256 indexed runId, bytes32 candidateHash, bytes32 approvedHash, bool passed, string actor, uint256 timestamp)",
  "event TamperDetected(uint256 indexed pipelineId, uint256 indexed runId, bytes32 candidateHash, bytes32 approvedHash, string actor, uint256 timestamp)",
];

// ─── Load and validate config ────────────────────────────────────────────────

function loadConfig() {
  const required = {
    rpcUrl:          process.env.CHAINGUARD_RPC_URL,
    botPrivateKey:   process.env.CHAINGUARD_BOT_PRIVATE_KEY,
    registryAddress: process.env.CHAINGUARD_REGISTRY_ADDRESS,
    loggerAddress:   process.env.CHAINGUARD_LOGGER_ADDRESS,
    verifierAddress: process.env.CHAINGUARD_VERIFIER_ADDRESS,
  };

  const missing = Object.entries(required)
    .filter(([, v]) => !v)
    .map(([k]) => {
      const envMap = {
        rpcUrl:          "CHAINGUARD_RPC_URL",
        botPrivateKey:   "CHAINGUARD_BOT_PRIVATE_KEY",
        registryAddress: "CHAINGUARD_REGISTRY_ADDRESS",
        loggerAddress:   "CHAINGUARD_LOGGER_ADDRESS",
        verifierAddress: "CHAINGUARD_VERIFIER_ADDRESS",
      };
      return envMap[k];
    });

  if (missing.length > 0) {
    throw new Error(
      `[chainguard] Missing required environment variables:\n` +
      missing.map(m => `  - ${m}`).join("\n") +
      `\n\nAdd these to your .env file or GitHub Secrets.\n` +
      `See: https://github.com/Oprico101/blockchain-ci-cd-integrity#configuration`
    );
  }

  return {
    rpcUrl:          required.rpcUrl,
    botPrivateKey:   required.botPrivateKey,
    pipelineId:      parseInt(process.env.CHAINGUARD_PIPELINE_ID || "1", 10),
    addresses: {
      registry: required.registryAddress,
      logger:   required.loggerAddress,
      verifier: required.verifierAddress,
    },
    abis: {
      registry: PIPELINE_REGISTRY_ABI,
      logger:   EVENT_LOGGER_ABI,
      verifier: VERIFIER_ABI,
    },
  };
}

module.exports = { loadConfig };
