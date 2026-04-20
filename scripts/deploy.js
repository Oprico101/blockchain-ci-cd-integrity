// scripts/deploy.js
//
// Deploys all three contracts to the configured network in the
// correct dependency order:
//
//   1. PipelineRegistry  — no constructor args
//   2. EventLogger       — no constructor args
//   3. Verifier          — needs registry + logger addresses
//
// After deployment the script:
//   - Authorises the bot wallet in EventLogger and Verifier
//   - Registers the initial pipeline config hash in PipelineRegistry
//   - Prints a deployment summary with all addresses
//   - Writes addresses to deployments/<network>.json for use by
//     blockchain-logger.js and the React dashboard
//
// Usage:
//   npx hardhat run scripts/deploy.js --network sepolia
//   npx hardhat run scripts/deploy.js --network localhost

const { ethers, network } = require("hardhat");
const fs   = require("fs");
const path = require("path");
require("dotenv").config();

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Print a section header to make console output easy to scan.
 */
function section(title) {
  console.log("\n" + "─".repeat(60));
  console.log(`  ${title}`);
  console.log("─".repeat(60));
}

/**
 * Wait for a given number of block confirmations.
 * On the local Hardhat network we skip this (always instant).
 */
async function waitForConfirmations(tx, confirmations = 2) {
  if (network.name === "hardhat" || network.name === "localhost") {
    await tx.wait(1);
  } else {
    console.log(`  ⏳ Waiting for ${confirmations} confirmations...`);
    await tx.wait(confirmations);
  }
}

// ─── Main deploy function ────────────────────────────────────────────────────

async function main() {
  section("Blockchain CI/CD Integrity System — Deployment");

  // ── Signers ──────────────────────────────────────────────────────────────
  const [deployer] = await ethers.getSigners();

  const deployerBalance = await ethers.provider.getBalance(deployer.address);

  console.log(`  Network   : ${network.name}`);
  console.log(`  Deployer  : ${deployer.address}`);
  console.log(`  Balance   : ${ethers.formatEther(deployerBalance)} ETH`);

  if (deployerBalance === 0n) {
    throw new Error(
      "Deployer wallet has 0 ETH. " +
      "Fund it with Sepolia ETH from https://sepoliafaucet.com"
    );
  }

  // ── Bot wallet (GitHub Actions) ──────────────────────────────────────────
  // The bot wallet sends transactions during CI runs.
  // It must be different from the deployer wallet.
  const botAddress = process.env.BOT_WALLET_ADDRESS || "";
  if (!botAddress || !ethers.isAddress(botAddress)) {
    console.warn(
      "\n  ⚠  BOT_WALLET_ADDRESS not set or invalid in .env.\n" +
      "     You will need to manually call authoriseCaller() and\n" +
      "     authoriseLogger() after deployment.\n"
    );
  }

  // ── 1. Deploy PipelineRegistry ───────────────────────────────────────────
  section("1 / 3  Deploying PipelineRegistry");

  const RegistryFactory = await ethers.getContractFactory("PipelineRegistry");
  const registry        = await RegistryFactory.deploy();
  await registry.waitForDeployment();

  const registryAddress = await registry.getAddress();
  console.log(`  ✅ PipelineRegistry deployed at: ${registryAddress}`);

  // ── 2. Deploy EventLogger ────────────────────────────────────────────────
  section("2 / 3  Deploying EventLogger");

  const LoggerFactory = await ethers.getContractFactory("EventLogger");
  const logger        = await LoggerFactory.deploy();
  await logger.waitForDeployment();

  const loggerAddress = await logger.getAddress();
  console.log(`  ✅ EventLogger deployed at: ${loggerAddress}`);

  // ── 3. Deploy Verifier ───────────────────────────────────────────────────
  section("3 / 3  Deploying Verifier");

  const VerifierFactory = await ethers.getContractFactory("Verifier");
  const verifier        = await VerifierFactory.deploy(registryAddress, loggerAddress);
  await verifier.waitForDeployment();

  const verifierAddress = await verifier.getAddress();
  console.log(`  ✅ Verifier deployed at: ${verifierAddress}`);
  console.log(`     → wired to Registry : ${registryAddress}`);
  console.log(`     → wired to Logger   : ${loggerAddress}`);

  // ── 4. Authorise bot wallet ──────────────────────────────────────────────
  if (botAddress && ethers.isAddress(botAddress)) {
    section("Authorising bot wallet");

    console.log(`  Bot wallet: ${botAddress}`);

    // Authorise in EventLogger
    const tx1 = await logger.authoriseLogger(botAddress);
    await waitForConfirmations(tx1);
    console.log("  ✅ Bot authorised in EventLogger");

    // Authorise in Verifier
    const tx2 = await verifier.authoriseCaller(botAddress);
    await waitForConfirmations(tx2);
    console.log("  ✅ Bot authorised in Verifier");
  }

  // ── 5. Register initial pipeline ────────────────────────────────────────
  section("Registering initial pipeline");

  // Compute the SHA-256 hash of the workflow YAML file if it exists,
  // otherwise use a placeholder that you'll update after first push.
  let configHash;
  const workflowPath = path.resolve(
    __dirname,
    "../.github/workflows/pipeline.yml"
  );

  if (fs.existsSync(workflowPath)) {
    const fileBuffer = fs.readFileSync(workflowPath);
    // ethers.sha256 expects a Uint8Array and returns a 0x-prefixed hex string
    configHash = ethers.sha256(fileBuffer);
    console.log(`  Computed hash of pipeline.yml : ${configHash}`);
  } else {
    // Placeholder — run updateApprovedHash() after your first push
    configHash = ethers.ZeroHash.replace(
      "0000000000000000000000000000000000000000000000000000000000000000",
      "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
    );
    console.log(
      "  ⚠  pipeline.yml not found — using placeholder hash.\n" +
      "     Call updateApprovedHash() after you create the workflow file."
    );
  }

  const tx3 = await registry.registerPipeline(
    "main-branch-pipeline",
    configHash
  );
  await waitForConfirmations(tx3);

  // pipelineCount is now 1 — that's the ID to use everywhere
  const pipelineId = await registry.pipelineCount();
  console.log(`  ✅ Pipeline registered with ID: ${pipelineId.toString()}`);
  console.log(`     Name : main-branch-pipeline`);
  console.log(`     Hash : ${configHash}`);

  // ── 6. Save deployment info ──────────────────────────────────────────────
  section("Saving deployment info");

  const deploymentsDir = path.resolve(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentInfo = {
    network:                 network.name,
    deployedAt:              new Date().toISOString(),
    deployer:                deployer.address,
    pipelineRegistryAddress: registryAddress,
    eventLoggerAddress:      loggerAddress,
    verifierAddress:         verifierAddress,
    initialPipelineId:       pipelineId.toString(),
    initialConfigHash:       configHash,
  };

  const outPath = path.join(deploymentsDir, `${network.name}.json`);
  fs.writeFileSync(outPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`  ✅ Deployment info written to: deployments/${network.name}.json`);

  // ── 7. Final summary ─────────────────────────────────────────────────────
  section("Deployment complete — copy these values to .env");

  console.log(`
  PIPELINE_REGISTRY_ADDRESS=${registryAddress}
  EVENT_LOGGER_ADDRESS=${loggerAddress}
  VERIFIER_ADDRESS=${verifierAddress}
  PIPELINE_ID=${pipelineId.toString()}

  Also add these as GitHub Actions Secrets:
    BOT_PRIVATE_KEY        — your bot wallet private key
    SEPOLIA_RPC_URL        — your Alchemy/Infura endpoint
    PIPELINE_REGISTRY_ADDRESS=${registryAddress}
    EVENT_LOGGER_ADDRESS=${loggerAddress}
    VERIFIER_ADDRESS=${verifierAddress}
    PIPELINE_ID=${pipelineId.toString()}
  `);

  // ── 8. Etherscan verification hint ───────────────────────────────────────
  if (network.name === "sepolia") {
    section("Verify contracts on Etherscan (optional but recommended)");
    console.log(`
  npx hardhat verify --network sepolia ${registryAddress}
  npx hardhat verify --network sepolia ${loggerAddress}
  npx hardhat verify --network sepolia ${verifierAddress} "${registryAddress}" "${loggerAddress}"
    `);
  }
}

// ─── Run ─────────────────────────────────────────────────────────────────────

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌ Deployment failed:\n", err.message || err);
    process.exit(1);
  });
