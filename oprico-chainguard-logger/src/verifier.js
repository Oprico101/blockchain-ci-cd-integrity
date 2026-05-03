// src/verifier.js
//
// Performs on-chain integrity verification via the Verifier contract.
// Called by the `chainguard verify` CLI command.
// Exits with code 0 (pass) or 1 (tamper detected — deploy blocked).

"use strict";

const { ethers }                   = require("ethers");
const { loadConfig }               = require("./config");
const { hashFile, isValidBytes32 } = require("./hasher");
const path                         = require("path");

/**
 * Verify pipeline integrity on-chain.
 *
 * @param {object} options
 * @param {string} options.runId        GitHub Actions run ID
 * @param {string} options.commitHash   Git commit SHA
 * @param {string} options.actor        GitHub username
 * @param {string} options.workflowFile Path to the workflow YAML file
 */
async function verifyIntegrity(options) {
  const { runId, commitHash, actor, workflowFile } = options;

  console.log("\n╔════════════════════════════════════════════════════════╗");
  console.log("║      OPRICO ChainGuard — Integrity Verification        ║");
  console.log("╚════════════════════════════════════════════════════════╝\n");

  const CONFIG = loadConfig();

  // Hash the live workflow file
  const wfPath     = workflowFile || path.resolve(process.cwd(), ".github/workflows/pipeline.yml");
  const configHash = hashFile(wfPath);

  if (!isValidBytes32(configHash)) {
    throw new Error(`Invalid config hash: ${configHash}`);
  }

  // Connect to blockchain
  const provider  = new ethers.JsonRpcProvider(CONFIG.rpcUrl);
  const signer    = new ethers.Wallet(CONFIG.botPrivateKey, provider);

  const registry = new ethers.Contract(
    CONFIG.addresses.registry,
    CONFIG.abis.registry,
    signer
  );

  const verifier = new ethers.Contract(
    CONFIG.addresses.verifier,
    CONFIG.abis.verifier,
    signer
  );

  // Fetch approved hash for display
  const pipeline     = await registry.getPipeline(CONFIG.pipelineId);
  const approvedHash = pipeline.configHash;

  console.log(`  Pipeline ID   : ${CONFIG.pipelineId}`);
  console.log(`  Run ID        : ${runId}`);
  console.log(`  Commit        : ${commitHash}`);
  console.log(`  Actor         : ${actor}`);
  console.log(`  Live hash     : ${configHash}`);
  console.log(`  Approved hash : ${approvedHash}`);
  console.log(`  Match?        : ${configHash.toLowerCase() === approvedHash.toLowerCase() ? "YES ✅" : "NO ❌"}`);

  console.log("\n  Sending verification transaction...");

  const tx = await verifier.verify(
    CONFIG.pipelineId,
    BigInt(runId),
    configHash,
    commitHash,
    actor
  );

  console.log(`  📡 Tx sent   : ${tx.hash}`);
  const receipt = await tx.wait(1);
  console.log(`  ✅ Confirmed : block ${receipt.blockNumber}`);

  // Parse result from event
  const iface       = verifier.interface;
  const resultEvent = receipt.logs
    .map(log => { try { return iface.parseLog(log); } catch { return null; } })
    .find(e => e && e.name === "VerificationResult");

  if (!resultEvent) {
    throw new Error("VerificationResult event not found in receipt.");
  }

  const passed         = resultEvent.args.passed;
  const verificationId = resultEvent.args.verificationId.toString();

  console.log(`\n  Verification ID : ${verificationId}`);

  if (passed) {
    console.log("  ✅ INTEGRITY VERIFIED — config matches approved hash.");
    console.log("     Deployment is authorised to proceed.\n");
    process.exit(0);
  } else {
    console.error("\n  ❌ INTEGRITY FAILED — TAMPER DETECTED!");
    console.error("     The live pipeline config does NOT match the approved hash.");
    console.error(`     Expected : ${approvedHash}`);
    console.error(`     Got      : ${configHash}`);
    console.error("\n     🚫 Deployment BLOCKED. Review changes to pipeline.yml.\n");
    process.exit(1);
  }
}

module.exports = { verifyIntegrity };
