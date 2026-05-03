// src/cli.js
//
// CLI command handler for oprico-chainguard-logger.
//
// Commands:
//   chainguard log <stage> <runId> <commitHash> <actor> [notes]
//   chainguard verify <runId> <commitHash> <actor>
//   chainguard hash <file>
//   chainguard status

"use strict";

const { logEvent }       = require("./logger");
const { verifyIntegrity} = require("./verifier");
const { hashFile }       = require("./hasher");
const { loadConfig }     = require("./config");
const { ethers }         = require("ethers");

// ─── Help text ────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║            OPRICO ChainGuard Logger v1.0.0                 ║
║     Blockchain-based CI/CD Pipeline Integrity System       ║
╚════════════════════════════════════════════════════════════╝

USAGE:
  npx chainguard <command> [options]

COMMANDS:
  log <stage> <runId> <commitHash> <actor> [notes]
      Log a CI/CD event to the blockchain.

      stage       Event stage index (0-11):
                  0  PIPELINE_TRIGGERED    6  TESTS_FAILED
                  1  BUILD_STARTED         7  INTEGRITY_VERIFIED
                  2  BUILD_SUCCESS         8  INTEGRITY_FAILED
                  3  BUILD_FAILED          9  DEPLOY_STARTED
                  4  TESTS_STARTED        10  DEPLOY_SUCCESS
                  5  TESTS_PASSED         11  DEPLOY_FAILED

  verify <runId> <commitHash> <actor>
      Verify pipeline integrity on-chain.
      Exits 0 if verified, exits 1 if tamper detected.

  hash <file>
      Compute SHA-256 hash of a file (bytes32 format).

  status
      Show current pipeline status from the blockchain.

ENVIRONMENT VARIABLES (add to .env or GitHub Secrets):
  CHAINGUARD_RPC_URL              Sepolia RPC endpoint
  CHAINGUARD_BOT_PRIVATE_KEY      Bot wallet private key (0x prefix)
  CHAINGUARD_REGISTRY_ADDRESS     PipelineRegistry contract address
  CHAINGUARD_LOGGER_ADDRESS       EventLogger contract address
  CHAINGUARD_VERIFIER_ADDRESS     Verifier contract address
  CHAINGUARD_PIPELINE_ID          Pipeline ID (default: 1)

EXAMPLES:
  npx chainguard log 0 \$GITHUB_RUN_ID \$GITHUB_SHA \$GITHUB_ACTOR
  npx chainguard verify \$GITHUB_RUN_ID \$GITHUB_SHA \$GITHUB_ACTOR
  npx chainguard hash .github/workflows/pipeline.yml
  npx chainguard status
`);
}

// ─── Status command ───────────────────────────────────────────────────────────

async function cmdStatus() {
  console.log("\n╔════════════════════════════════════════════════════════╗");
  console.log("║         OPRICO ChainGuard — Pipeline Status            ║");
  console.log("╚════════════════════════════════════════════════════════╝\n");

  const CONFIG   = loadConfig();
  const provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);

  const registry = new ethers.Contract(
    CONFIG.addresses.registry,
    CONFIG.abis.registry,
    provider
  );

  const verifier = new ethers.Contract(
    CONFIG.addresses.verifier,
    CONFIG.abis.verifier,
    provider
  );

  const pipeline              = await registry.getPipeline(CONFIG.pipelineId);
  const [total, failures, passes] = await verifier.getStats();

  console.log(`  Pipeline ID   : ${CONFIG.pipelineId}`);
  console.log(`  Name          : ${pipeline.name}`);
  console.log(`  Status        : ${pipeline.revoked ? "REVOKED ❌" : "Active ✅"}`);
  console.log(`  Approved hash : ${pipeline.configHash}`);
  console.log(`\n  Verification stats (all time):`);
  console.log(`    Total       : ${total.toString()}`);
  console.log(`    Passed      : ${passes.toString()}`);
  console.log(`    Failed      : ${failures.toString()}`);
  console.log(`    Integrity   : ${failures > 0n ? "⚠ Tampers detected" : "✅ Clean"}\n`);
}

// ─── Main CLI router ──────────────────────────────────────────────────────────

async function main() {
  const [,, command, ...args] = process.argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    process.exit(0);
  }

  switch (command) {

    case "log": {
      const [stageStr, runId, commitHash, actor, ...notesParts] = args;

      if (!stageStr || !runId || !commitHash || !actor) {
        console.error("Usage: chainguard log <stage> <runId> <commitHash> <actor> [notes]");
        process.exit(1);
      }

      await logEvent({
        stage:      parseInt(stageStr, 10),
        runId,
        commitHash,
        actor,
        notes:      notesParts.join(" "),
      });
      break;
    }

    case "verify": {
      const [runId, commitHash, actor] = args;

      if (!runId || !commitHash || !actor) {
        console.error("Usage: chainguard verify <runId> <commitHash> <actor>");
        process.exit(1);
      }

      await verifyIntegrity({ runId, commitHash, actor });
      break;
    }

    case "hash": {
      const [filePath] = args;

      if (!filePath) {
        console.error("Usage: chainguard hash <file>");
        process.exit(1);
      }

      const hash = hashFile(filePath);
      console.log(hash);
      break;
    }

    case "status": {
      await cmdStatus();
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch(err => {
  console.error("\n❌ Fatal error:", err.message || err);
  process.exit(1);
});
