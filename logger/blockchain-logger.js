// logger/blockchain-logger.js
//
// The bridge between GitHub Actions and the Ethereum blockchain.
//
// Called by .github/workflows/pipeline.yml at each pipeline stage.
// Sends a signed transaction to the appropriate smart contract and
// exits with code 0 (success) or 1 (failure / tamper detected).
//
// Commands:
//   node logger/blockchain-logger.js log     <stage> <runId> <commitHash> <actor> [notes]
//   node logger/blockchain-logger.js verify  <runId> <commitHash> <actor>
//
// Stage values (must match EventLogger.sol Stage enum indices):
//   0  PIPELINE_TRIGGERED      5  TESTS_PASSED
//   1  BUILD_STARTED           6  TESTS_FAILED
//   2  BUILD_SUCCESS           7  INTEGRITY_VERIFIED  (set automatically by verify)
//   3  BUILD_FAILED            8  INTEGRITY_FAILED    (set automatically by verify)
//   4  TESTS_STARTED           9  DEPLOY_STARTED
//                             10  DEPLOY_SUCCESS
//                             11  DEPLOY_FAILED
//
// Example calls from pipeline.yml:
//   node logger/blockchain-logger.js log 1 ${{ github.run_id }} ${{ github.sha }} ${{ github.actor }}
//   node logger/blockchain-logger.js verify ${{ github.run_id }} ${{ github.sha }} ${{ github.actor }}

"use strict";

const { ethers }                   = require("ethers");
const path                         = require("path");
const CONFIG                       = require("./config");
const { hashFile, isValidBytes32 } = require("./hash-generator");

// ─── Constants ────────────────────────────────────────────────────────────────

/** Path to the workflow file that gets hashed on every run. */
const WORKFLOW_FILE = path.resolve(
  __dirname,
  "../.github/workflows/pipeline.yml"
);

/**
 * Stage enum — mirrors EventLogger.sol Stage exactly.
 * Used to convert named stages to their uint8 index.
 */
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

// ─── Blockchain setup ─────────────────────────────────────────────────────────

/**
 * Create an Ethers.js provider and signer from config.
 * The signer is the bot wallet — it pays gas for every transaction.
 */
function createSigner() {
  const provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);
  const signer   = new ethers.Wallet(CONFIG.botPrivateKey, provider);
  return { provider, signer };
}

/**
 * Instantiate all three contracts, connected to the bot wallet signer.
 */
function getContracts(signer) {
  const registry = new ethers.Contract(
    CONFIG.addresses.pipelineRegistry,
    CONFIG.abis.pipelineRegistry,
    signer
  );

  const logger = new ethers.Contract(
    CONFIG.addresses.eventLogger,
    CONFIG.abis.eventLogger,
    signer
  );

  const verifier = new ethers.Contract(
    CONFIG.addresses.verifier,
    CONFIG.abis.verifier,
    signer
  );

  return { registry, logger, verifier };
}

// ─── Shared utility ───────────────────────────────────────────────────────────

/**
 * Compute the live SHA-256 hash of the workflow YAML file.
 * This is what gets compared against the on-chain approved hash.
 *
 * @returns {string}  0x-prefixed bytes32 hex string.
 */
function getLiveConfigHash() {
  const hash = hashFile(WORKFLOW_FILE);

  if (!isValidBytes32(hash)) {
    throw new Error(`Invalid hash produced: ${hash}`);
  }

  return hash;
}

/**
 * Wait for a transaction to be mined and log the tx hash.
 *
 * @param   {ethers.TransactionResponse} tx
 * @returns {ethers.TransactionReceipt}
 */
async function waitForTx(tx) {
  console.log(`  📡 Tx sent   : ${tx.hash}`);
  const receipt = await tx.wait(1);
  console.log(`  ✅ Confirmed : block ${receipt.blockNumber}`);
  return receipt;
}

// ─── Command: log ─────────────────────────────────────────────────────────────

/**
 * Log a CI/CD event to the EventLogger contract.
 *
 * Called at every pipeline stage except the integrity check step,
 * which uses the `verify` command instead.
 *
 * @param {number} stageIndex   Numeric index from the Stage enum.
 * @param {string} runId        GitHub Actions run ID (numeric string).
 * @param {string} commitHash   Git commit SHA.
 * @param {string} actor        GitHub username.
 * @param {string} [notes=""]   Optional context string.
 */
async function cmdLog(stageIndex, runId, commitHash, actor, notes = "") {
  console.log("\n──────────────────────────────────────────────────────────");
  console.log("  blockchain-logger  →  log");
  console.log("──────────────────────────────────────────────────────────");

  // Validate stage index
  const validStages = Object.values(Stage);
  if (!validStages.includes(stageIndex)) {
    throw new Error(`Invalid stage index: ${stageIndex}. Valid range: 0–11`);
  }

  const stageName = Object.keys(Stage).find(k => Stage[k] === stageIndex);
  const configHash = getLiveConfigHash();

  console.log(`  Pipeline ID  : ${CONFIG.pipelineId}`);
  console.log(`  Run ID       : ${runId}`);
  console.log(`  Stage        : ${stageIndex} (${stageName})`);
  console.log(`  Commit       : ${commitHash}`);
  console.log(`  Actor        : ${actor}`);
  console.log(`  Config hash  : ${configHash}`);
  if (notes) console.log(`  Notes        : ${notes}`);

  const { signer } = createSigner();
  const { logger } = getContracts(signer);

  console.log("\n  Sending transaction to EventLogger...");

  const tx = await logger.logEvent(
    CONFIG.pipelineId,
    BigInt(runId),
    stageIndex,
    configHash,
    commitHash,
    actor,
    notes
  );

  const receipt = await waitForTx(tx);

  // Extract the logId from the emitted CiCdEventLogged event
  const iface  = logger.interface;
  const loggedEvent = receipt.logs
    .map(log => { try { return iface.parseLog(log); } catch { return null; } })
    .find(e => e && e.name === "CiCdEventLogged");

  if (loggedEvent) {
    console.log(`  📋 Log ID    : ${loggedEvent.args.logId.toString()}`);
  }

  console.log("\n  ✅ Event logged successfully.\n");
}

// ─── Command: verify ─────────────────────────────────────────────────────────

/**
 * Perform an on-chain integrity verification.
 *
 * Calls Verifier.verify() which:
 *   1. Compares the live config hash against the approved hash in PipelineRegistry
 *   2. Stores a VerificationRecord on-chain
 *   3. Calls EventLogger to append INTEGRITY_VERIFIED or INTEGRITY_FAILED
 *   4. Returns a boolean result
 *
 * Exits with code 0 if verification passes (pipeline continues to deploy).
 * Exits with code 1 if verification fails (deploy is blocked).
 *
 * @param {string} runId       GitHub Actions run ID.
 * @param {string} commitHash  Git commit SHA.
 * @param {string} actor       GitHub username.
 */
async function cmdVerify(runId, commitHash, actor) {
  console.log("\n──────────────────────────────────────────────────────────");
  console.log("  blockchain-logger  →  verify");
  console.log("──────────────────────────────────────────────────────────");

  const configHash = getLiveConfigHash();

  console.log(`  Pipeline ID  : ${CONFIG.pipelineId}`);
  console.log(`  Run ID       : ${runId}`);
  console.log(`  Commit       : ${commitHash}`);
  console.log(`  Actor        : ${actor}`);
  console.log(`  Live hash    : ${configHash}`);

  const { signer }   = createSigner();
  const { verifier } = getContracts(signer);

  // Fetch the approved hash from PipelineRegistry for display purposes
  const { registry } = getContracts(signer);
  const pipeline     = await registry.getPipeline(CONFIG.pipelineId);
  const approvedHash = pipeline.configHash;

  console.log(`  Approved hash: ${approvedHash}`);
  console.log(
    `  Match?       : ${configHash.toLowerCase() === approvedHash.toLowerCase() ? "YES ✅" : "NO ❌"}`
  );

  console.log("\n  Sending verification transaction...");

  const tx = await verifier.verify(
    CONFIG.pipelineId,
    BigInt(runId),
    configHash,
    commitHash,
    actor
  );

  const receipt = await waitForTx(tx);

  // Parse the VerificationResult event to get the outcome
  const iface = verifier.interface;
  const resultEvent = receipt.logs
    .map(log => { try { return iface.parseLog(log); } catch { return null; } })
    .find(e => e && e.name === "VerificationResult");

  if (!resultEvent) {
    throw new Error("VerificationResult event not found in transaction receipt.");
  }

  const passed         = resultEvent.args.passed;
  const verificationId = resultEvent.args.verificationId.toString();

  console.log(`\n  Verification ID : ${verificationId}`);

  if (passed) {
    console.log("  ✅ INTEGRITY VERIFIED — pipeline config matches approved hash.");
    console.log("     Deployment is authorised to proceed.\n");
    process.exit(0);
  } else {
    // Check for TamperDetected event for extra detail
    const tamperEvent = receipt.logs
      .map(log => { try { return iface.parseLog(log); } catch { return null; } })
      .find(e => e && e.name === "TamperDetected");

    console.error("\n  ❌ INTEGRITY FAILED — TAMPER DETECTED!");
    console.error("     The live pipeline config does NOT match the approved hash.");
    console.error(`     Expected : ${approvedHash}`);
    console.error(`     Got      : ${configHash}`);

    if (tamperEvent) {
      console.error(`     Pipeline : ${tamperEvent.args.pipelineId.toString()}`);
      console.error(`     Run      : ${tamperEvent.args.runId.toString()}`);
      console.error(`     Actor    : ${tamperEvent.args.actor}`);
    }

    console.error("\n     🚫 Deployment BLOCKED. Review changes to pipeline.yml.\n");

    // Exit 1 causes the GitHub Actions step to fail,
    // which blocks the deploy job from running.
    process.exit(1);
  }
}

// ─── CLI entrypoint ───────────────────────────────────────────────────────────

async function main() {
  const [, , command, ...args] = process.argv;

  if (!command) {
    console.error(
      "Usage:\n" +
      "  node blockchain-logger.js log    <stageIndex> <runId> <commitHash> <actor> [notes]\n" +
      "  node blockchain-logger.js verify <runId> <commitHash> <actor>"
    );
    process.exit(1);
  }

  switch (command) {
    case "log": {
      const [stageStr, runId, commitHash, actor, ...notesParts] = args;

      if (!stageStr || !runId || !commitHash || !actor) {
        console.error("log requires: <stageIndex> <runId> <commitHash> <actor> [notes]");
        process.exit(1);
      }

      const stageIndex = parseInt(stageStr, 10);
      const notes      = notesParts.join(" ");

      await cmdLog(stageIndex, runId, commitHash, actor, notes);
      break;
    }

    case "verify": {
      const [runId, commitHash, actor] = args;

      if (!runId || !commitHash || !actor) {
        console.error("verify requires: <runId> <commitHash> <actor>");
        process.exit(1);
      }

      await cmdVerify(runId, commitHash, actor);
      break;
    }

    default:
      console.error(`Unknown command: ${command}. Use 'log' or 'verify'.`);
      process.exit(1);
  }
}

main().catch(err => {
  console.error("\n❌ Fatal error:", err.message || err);
  process.exit(1);
});
