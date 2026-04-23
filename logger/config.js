// logger/config.js
//
// Loads contract addresses and ABIs for use by blockchain-logger.js.
//
// Resolution order for contract addresses:
//   1. Environment variables (set as GitHub Actions Secrets in CI)
//   2. deployments/<network>.json written by deploy.js
//   3. Hard error — deployment info is required to proceed
//
// ABIs are loaded lazily (only when accessed) so that missing
// artifacts/ folder does not crash the module on import.
// The compile step in pipeline.yml runs before the logger so
// artifacts are always available by the time abis are accessed.

const fs   = require("fs");
const path = require("path");

// ─── Network ──────────────────────────────────────────────────────────────────

const NETWORK = process.env.NETWORK || "sepolia";

// ─── RPC endpoint ─────────────────────────────────────────────────────────────

const RPC_URL = process.env.SEPOLIA_RPC_URL || "";
if (!RPC_URL) {
  throw new Error(
    "config.js: SEPOLIA_RPC_URL is not set.\n" +
    "  Add it as a GitHub Actions Secret or in your .env file."
  );
}

// ─── Bot wallet private key ───────────────────────────────────────────────────

const BOT_PRIVATE_KEY = process.env.BOT_PRIVATE_KEY || "";
if (!BOT_PRIVATE_KEY) {
  throw new Error(
    "config.js: BOT_PRIVATE_KEY is not set.\n" +
    "  Add it as a GitHub Actions Secret."
  );
}

// ─── Pipeline ID ──────────────────────────────────────────────────────────────

const PIPELINE_ID = parseInt(process.env.PIPELINE_ID || "1", 10);

// ─── Contract addresses ───────────────────────────────────────────────────────

function loadAddresses() {
  // Try environment variables first (GitHub Actions Secrets)
  const fromEnv = {
    pipelineRegistry: process.env.PIPELINE_REGISTRY_ADDRESS,
    eventLogger:      process.env.EVENT_LOGGER_ADDRESS,
    verifier:         process.env.VERIFIER_ADDRESS,
  };

  if (
    fromEnv.pipelineRegistry &&
    fromEnv.eventLogger &&
    fromEnv.verifier
  ) {
    return fromEnv;
  }

  // Fall back to deployments/<network>.json
  const deploymentsPath = path.resolve(
    __dirname,
    `../deployments/${NETWORK}.json`
  );

  if (!fs.existsSync(deploymentsPath)) {
    throw new Error(
      `config.js: no deployment info found.\n` +
      `  Expected env vars: PIPELINE_REGISTRY_ADDRESS, EVENT_LOGGER_ADDRESS, VERIFIER_ADDRESS\n` +
      `  Or file: ${deploymentsPath}\n` +
      `  Run: npx hardhat run scripts/deploy.js --network ${NETWORK}`
    );
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));

  return {
    pipelineRegistry: deployment.pipelineRegistryAddress,
    eventLogger:      deployment.eventLoggerAddress,
    verifier:         deployment.verifierAddress,
  };
}

// ─── ABI loader ───────────────────────────────────────────────────────────────

function loadAbi(contractName) {
  const artifactPath = path.resolve(
    __dirname,
    `../artifacts/contracts/${contractName}.sol/${contractName}.json`
  );

  if (!fs.existsSync(artifactPath)) {
    throw new Error(
      `config.js: ABI not found for ${contractName}.\n` +
      `  Expected: ${artifactPath}\n` +
      `  Run: npx hardhat compile`
    );
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  return artifact.abi;
}

// ─── Assembled config ─────────────────────────────────────────────────────────

const _addresses = loadAddresses();

const CONFIG = {
  network:       NETWORK,
  rpcUrl:        RPC_URL,
  botPrivateKey: BOT_PRIVATE_KEY,
  pipelineId:    PIPELINE_ID,

  addresses: {
    pipelineRegistry: _addresses.pipelineRegistry,
    eventLogger:      _addresses.eventLogger,
    verifier:         _addresses.verifier,
  },

  // ABIs loaded lazily — only read from disk when first accessed.
  // This prevents a crash if artifacts/ does not exist at import time.
  get abis() {
    return {
      pipelineRegistry: loadAbi("PipelineRegistry"),
      eventLogger:      loadAbi("EventLogger"),
      verifier:         loadAbi("Verifier"),
    };
  },
};

module.exports = CONFIG;
