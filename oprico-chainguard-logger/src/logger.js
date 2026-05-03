// src/logger.js
//
// Sends a CI/CD event to the EventLogger smart contract.
// Called by the `chainguard log` CLI command.

"use strict";

const { ethers }              = require("ethers");
const { loadConfig }          = require("./config");
const { hashFile, isValidBytes32 } = require("./hasher");
const path                    = require("path");

// Stage enum — mirrors EventLogger.sol
const Stage = Object.freeze({
  PIPELINE_TRIGGERED: 0,
  BUILD_STARTED:      1,
  BUILD_SUCCESS:      2,
  BUILD_FAILED:       3,
  TESTS_STARTED:      4,
  TESTS_PASSED:       5,
  TESTS_FAILED:       6,
  INTEGRITY_VERIFIED: 7,
  INTEGRITY_FAILED:   8,
  DEPLOY_STARTED:     9,
  DEPLOY_SUCCESS:     10,
  DEPLOY_FAILED:      11,
});

/**
 * Log a CI/CD event to the blockchain.
 *
 * @param {object} options
 * @param {number} options.stage       Stage index (0-11)
 * @param {string} options.runId       GitHub Actions run ID
 * @param {string} options.commitHash  Git commit SHA
 * @param {string} options.actor       GitHub username
 * @param {string} options.workflowFile Path to the workflow YAML file
 * @param {string} [options.notes]     Optional notes
 */
async function logEvent(options) {
  const { stage, runId, commitHash, actor, workflowFile, notes = "" } = options;

  console.log("\n╔════════════════════════════════════════════════════════╗");
  console.log("║         OPRICO ChainGuard — Blockchain Logger          ║");
  console.log("╚════════════════════════════════════════════════════════╝\n");

  // Validate stage
  const validStages = Object.values(Stage);
  if (!validStages.includes(stage)) {
    throw new Error(`Invalid stage: ${stage}. Valid range: 0-11`);
  }

  const stageName = Object.keys(Stage).find(k => Stage[k] === stage);

  // Load config
  const CONFIG = loadConfig();

  // Hash the workflow file
  const wfPath     = workflowFile || path.resolve(process.cwd(), ".github/workflows/pipeline.yml");
  const configHash = hashFile(wfPath);

  if (!isValidBytes32(configHash)) {
    throw new Error(`Invalid config hash: ${configHash}`);
  }

  console.log(`  Pipeline ID  : ${CONFIG.pipelineId}`);
  console.log(`  Run ID       : ${runId}`);
  console.log(`  Stage        : ${stage} (${stageName})`);
  console.log(`  Commit       : ${commitHash}`);
  console.log(`  Actor        : ${actor}`);
  console.log(`  Config hash  : ${configHash}`);
  if (notes) console.log(`  Notes        : ${notes}`);

  // Connect to blockchain
  const provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);
  const signer   = new ethers.Wallet(CONFIG.botPrivateKey, provider);
  const logger   = new ethers.Contract(
    CONFIG.addresses.logger,
    CONFIG.abis.logger,
    signer
  );

  console.log("\n  Sending transaction to EventLogger...");

  const tx = await logger.logEvent(
    CONFIG.pipelineId,
    BigInt(runId),
    stage,
    configHash,
    commitHash,
    actor,
    notes
  );

  console.log(`  📡 Tx sent   : ${tx.hash}`);
  const receipt = await tx.wait(1);
  console.log(`  ✅ Confirmed : block ${receipt.blockNumber}`);
  console.log("\n  ✅ Event logged to blockchain successfully.\n");
}

module.exports = { logEvent, Stage };
