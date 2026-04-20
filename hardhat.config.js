require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/**
 * hardhat.config.js
 *
 * Configures the Hardhat development environment for the
 * Blockchain-based CI/CD Integrity System.
 *
 * Networks configured:
 *   - hardhat   : local in-memory chain for fast unit tests
 *   - localhost  : persistent local node (npx hardhat node)
 *   - sepolia    : Ethereum Sepolia testnet for live deployment
 *
 * Loaded from .env (never commit .env to GitHub):
 *   SEPOLIA_RPC_URL   — Alchemy or Infura endpoint for Sepolia
 *   PRIVATE_KEY       — deployer wallet private key (with 0x prefix)
 *   ETHERSCAN_API_KEY — for contract verification on Etherscan (optional)
 */

// ── Validate required env vars at config load time ──────────────────────────
const SEPOLIA_RPC_URL   = process.env.SEPOLIA_RPC_URL   || "";
const PRIVATE_KEY       = process.env.PRIVATE_KEY       || "0x" + "0".repeat(64);
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";

if (!process.env.SEPOLIA_RPC_URL) {
  console.warn(
    "\n⚠  WARNING: SEPOLIA_RPC_URL is not set in .env.\n" +
    "   Sepolia deployments will fail. Local testing still works.\n"
  );
}

if (!process.env.PRIVATE_KEY) {
  console.warn(
    "\n⚠  WARNING: PRIVATE_KEY is not set in .env.\n" +
    "   Using a dummy key — only local testing will work.\n"
  );
}

// ── Hardhat configuration ────────────────────────────────────────────────────
/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {

  // ── Solidity compiler ──────────────────────────────────────────────────────
 solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },

  // ── Networks ───────────────────────────────────────────────────────────────
  networks: {

    /**
     * Built-in Hardhat network.
     * Used automatically when running:
     *   npx hardhat test
     *   npx hardhat compile
     * Fast, in-memory, resets between test runs.
     */
    hardhat: {
      chainId: 31337,
    },

    /**
     * Local persistent node.
     * Start with: npx hardhat node
     * Deploy with: npx hardhat run scripts/deploy.js --network localhost
     * Useful for testing the React dashboard against a real RPC.
     */
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },

    /**
     * Sepolia testnet — live deployment target.
     * Get free Sepolia ETH from: https://sepoliafaucet.com
     *
     * Deploy with:
     *   npx hardhat run scripts/deploy.js --network sepolia
     */
    sepolia: {
      url: SEPOLIA_RPC_URL,
      accounts: PRIVATE_KEY !== "0x" + "0".repeat(64)
        ? [PRIVATE_KEY]
        : [],
      chainId: 11155111,
      gasPrice: "auto",
      // Timeout for slow testnet confirmations (ms)
      timeout: 120000,
    },
  },

  // ── Etherscan verification ─────────────────────────────────────────────────
  // After deploying, verify source code with:
  //   npx hardhat verify --network sepolia <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
  etherscan: {
    apiKey: {
      sepolia: ETHERSCAN_API_KEY,
    },
  },

  // ── Gas reporter ──────────────────────────────────────────────────────────
  // Prints gas costs per function when running tests.
  // Useful for your dissertation's performance evaluation section.
  // Enable by setting REPORT_GAS=true in .env.
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
    outputFile: "gas-report.txt",
    noColors: true,
    // coinmarketcap: process.env.COINMARKETCAP_API_KEY,  // uncomment for USD prices
  },

  // ── Paths ──────────────────────────────────────────────────────────────────
  // Explicit paths — matches the folder structure we defined.
  paths: {
    sources:   "./contracts",
    tests:     "./test",
    cache:     "./cache",
    artifacts: "./artifacts",
  },

  // ── Mocha (test runner) settings ──────────────────────────────────────────
  mocha: {
    timeout: 60000,   // 60 s — generous for testnet-forked tests
  },
};
