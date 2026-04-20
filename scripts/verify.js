// scripts/verify.js
//
// Manual on-chain verification helper.
//
// Use this script to manually check whether a pipeline config hash
// matches the approved hash stored in PipelineRegistry — without
// triggering a full GitHub Actions run.
//
// Useful for:
//   - Checking integrity after a suspected tampering incident
//   - Verifying a new hash before calling updateApprovedHash()
//   - Debugging mismatches between local and on-chain hashes
//   - Dissertation demonstrations
//
// Usage:
//   npx hardhat run scripts/verify.js --network sepolia
//
// Or pass a specific file to hash:
//   VERIFY_FILE=.github/workflows/pipeline.yml npx hardhat run scripts/verify.js --network sepolia
//
// Or pass a raw hash directly:
//   VERIFY_HASH=0xabc123... npx hardhat run scripts/verify.js --network sepolia

const { ethers, network } = require("hardhat");
const fs                  = require("fs");
const path                = require("path");
const crypto              = require("crypto");
require("dotenv").config();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function section(title) {
  console.log("\n" + "─".repeat(60));
  console.log(`  ${title}`);
  console.log("─".repeat(60));
}

/**
 * Compute SHA-256 hash of a file, returned as 0x-prefixed bytes32 hex.
 */
function hashFile(filePath) {
  const abs    = path.resolve(filePath);
  const buffer = fs.readFileSync(abs);
  return "0x" + crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Load deployed contract addresses from deployments/<network>.json
 * or from environment variables.
 */
function loadAddresses() {
  const fromEnv = {
    pipelineRegistry: process.env.PIPELINE_REGISTRY_ADDRESS,
    eventLogger:      process.env.EVENT_LOGGER_ADDRESS,
    verifier:         process.env.VERIFIER_ADDRESS,
  };

  if (fromEnv.pipelineRegistry && fromEnv.verifier) {
    return fromEnv;
  }

  const deploymentsPath = path.resolve(
    __dirname,
    `../deployments/${network.name}.json`
  );

  if (!fs.existsSync(deploymentsPath)) {
    throw new Error(
      `No deployment info found for network "${network.name}".\n` +
      `  Run: npx hardhat run scripts/deploy.js --network ${network.name}`
    );
  }

  const d = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
  return {
    pipelineRegistry: d.pipelineRegistryAddress,
    eventLogger:      d.eventLoggerAddress,
    verifier:         d.verifierAddress,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  section("Manual On-Chain Verification — CI/CD Integrity System");

  const [signer] = await ethers.getSigners();
  console.log(`  Network   : ${network.name}`);
  console.log(`  Caller    : ${signer.address}`);

  // ── Load addresses ────────────────────────────────────────────────────────
  const addresses = loadAddresses();
  console.log(`\n  PipelineRegistry : ${addresses.pipelineRegistry}`);
  console.log(`  Verifier         : ${addresses.verifier}`);

  // ── Attach to contracts ───────────────────────────────────────────────────
  const registry = await ethers.getContractAt(
    "PipelineRegistry",
    addresses.pipelineRegistry
  );

  const verifier = await ethers.getContractAt(
    "Verifier",
    addresses.verifier
  );

  // ── Determine pipeline ID ─────────────────────────────────────────────────
  const pipelineId = parseInt(process.env.PIPELINE_ID || "1", 10);
  console.log(`\n  Pipeline ID : ${pipelineId}`);

  // ── Fetch the on-chain approved hash ──────────────────────────────────────
  section("On-chain approved pipeline config");

  const pipeline = await registry.getPipeline(pipelineId);

  if (!pipeline.registered) {
    console.error(`  ❌ Pipeline #${pipelineId} is not registered.`);
    console.error(`     Register it first with registerPipeline() in deploy.js`);
    process.exit(1);
  }

  if (pipeline.revoked) {
    console.warn(`  ⚠  Pipeline #${pipelineId} has been REVOKED.`);
    console.warn(`     All verifications will fail until a new pipeline is registered.`);
  }

  console.log(`  Name         : ${pipeline.name}`);
  console.log(`  Approved hash: ${pipeline.configHash}`);
  console.log(`  Registered   : ${pipeline.registered}`);
  console.log(`  Revoked      : ${pipeline.revoked}`);

  // ── Determine candidate hash ──────────────────────────────────────────────
  section("Candidate hash to verify");

  let candidateHash;

  if (process.env.VERIFY_HASH) {
    // Use a raw hash passed directly via env var
    candidateHash = process.env.VERIFY_HASH;
    console.log(`  Source  : VERIFY_HASH env var`);
    console.log(`  Hash    : ${candidateHash}`);

  } else {
    // Hash a file — default to pipeline.yml, override with VERIFY_FILE
    const targetFile = process.env.VERIFY_FILE ||
      path.resolve(__dirname, "../.github/workflows/pipeline.yml");

    if (!fs.existsSync(targetFile)) {
      console.error(`  ❌ File not found: ${targetFile}`);
      console.error(`     Set VERIFY_FILE=<path> or VERIFY_HASH=0x... to override.`);
      process.exit(1);
    }

    candidateHash = hashFile(targetFile);
    console.log(`  Source  : ${path.relative(process.cwd(), targetFile)}`);
    console.log(`  Hash    : ${candidateHash}`);
  }

  // ── Compare hashes ────────────────────────────────────────────────────────
  section("Hash comparison");

  const approvedHash = pipeline.configHash.toLowerCase();
  const candidate    = candidateHash.toLowerCase();
  const match        = approvedHash === candidate;

  console.log(`  Approved : ${approvedHash}`);
  console.log(`  Candidate: ${candidate}`);
  console.log(`  Match    : ${match ? "YES ✅" : "NO ❌"}`);

  if (!match) {
    // Show exactly which characters differ
    const a = approvedHash.replace("0x", "");
    const b = candidate.replace("0x", "");
    const diffPositions = [];

    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i] !== b[i]) diffPositions.push(i);
    }

    console.log(
      `\n  ⚠  ${diffPositions.length} character(s) differ at positions: ` +
      diffPositions.slice(0, 20).join(", ") +
      (diffPositions.length > 20 ? ` … (${diffPositions.length - 20} more)` : "")
    );
  }

  // ── Read-only on-chain check ───────────────────────────────────────────────
  section("On-chain read-only check (no gas, no transaction)");

  const checkResult = await verifier.checkOnly(pipelineId, candidateHash);
  console.log(`  verifier.checkOnly() returned: ${checkResult ? "true ✅" : "false ❌"}`);

  // ── Summary stats ─────────────────────────────────────────────────────────
  section("Current verification stats");

  const [total, failures, passes] = await verifier.getStats();
  console.log(`  Total verifications : ${total.toString()}`);
  console.log(`  Passed              : ${passes.toString()}`);
  console.log(`  Failed (tampers)    : ${failures.toString()}`);

  // ── List all registered pipelines ─────────────────────────────────────────
  section("All registered pipelines");

  const count = await registry.pipelineCount();
  console.log(`  Total registered: ${count.toString()}\n`);

  for (let i = 1; i <= Number(count); i++) {
    const p = await registry.getPipeline(i);
    const status = p.revoked ? "REVOKED" : "active";
    console.log(
      `  [${i}] ${p.name.padEnd(30)} ${status.padEnd(10)} ${p.configHash}`
    );
  }

  // ── Final verdict ─────────────────────────────────────────────────────────
  section("Verdict");

  if (match && !pipeline.revoked) {
    console.log("  ✅ INTEGRITY CONFIRMED");
    console.log("     The candidate hash matches the approved on-chain hash.");
    console.log("     This pipeline config is legitimate.\n");
    process.exit(0);
  } else if (pipeline.revoked) {
    console.log("  ⚠  PIPELINE REVOKED");
    console.log("     This pipeline has been administratively revoked.");
    console.log("     Register a new pipeline to resume deployments.\n");
    process.exit(1);
  } else {
    console.log("  ❌ INTEGRITY FAILURE — HASH MISMATCH");
    console.log("     The candidate hash does NOT match the approved on-chain hash.");
    console.log("     This may indicate the pipeline config has been tampered with.");
    console.log("\n  Recommended actions:");
    console.log("     1. Review recent changes to .github/workflows/pipeline.yml");
    console.log("     2. Check the git log: git log --oneline .github/workflows/");
    console.log("     3. If the change was intentional, call updateApprovedHash():");
    console.log(`        registry.updateApprovedHash(${pipelineId}, "${candidateHash}")`);
    console.log("");
    process.exit(1);
  }
}

// ─── Run ──────────────────────────────────────────────────────────────────────

main().catch(err => {
  console.error("\n❌ Error:", err.message || err);
  process.exit(1);
});
