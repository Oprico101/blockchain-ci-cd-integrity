# oprico-chainguard-logger

> Blockchain-based CI/CD pipeline integrity logger by Oprico.
> Records and verifies every pipeline event on the Ethereum blockchain — immutably and transparently.

[![npm version](https://img.shields.io/npm/v/oprico-chainguard-logger.svg)](https://www.npmjs.com/package/oprico-chainguard-logger)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

---

## What it does

- **Records** every CI/CD event (build, test, deploy) as an immutable transaction on the Ethereum Sepolia blockchain
- **Verifies** your pipeline config has not been tampered with before every deployment
- **Blocks** deployments automatically if the pipeline config does not match the approved hash on-chain
- **Provides** a full tamper-proof audit trail of every pipeline run

---

## Installation

```bash
npm install oprico-chainguard-logger
```

Or use directly without installing:

```bash
npx oprico-chainguard-logger <command>
```

---

## Quick start

### 1. Deploy the smart contracts

Clone the main repo and deploy:

```bash
git clone https://github.com/Oprico101/blockchain-ci-cd-integrity
cd blockchain-cicd-integrity
npm install
npm run deploy:sepolia
```

Copy the printed contract addresses.

### 2. Set environment variables

Add these to your `.env` file or GitHub Secrets:

```env
CHAINGUARD_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
CHAINGUARD_BOT_PRIVATE_KEY=0xYOUR_BOT_WALLET_PRIVATE_KEY
CHAINGUARD_REGISTRY_ADDRESS=0xYOUR_PIPELINE_REGISTRY_ADDRESS
CHAINGUARD_LOGGER_ADDRESS=0xYOUR_EVENT_LOGGER_ADDRESS
CHAINGUARD_VERIFIER_ADDRESS=0xYOUR_VERIFIER_ADDRESS
CHAINGUARD_PIPELINE_ID=1
```

### 3. Add to your GitHub Actions workflow

```yaml
- name: Install ChainGuard
  run: npm install oprico-chainguard-logger

- name: Log — pipeline triggered
  run: npx chainguard log 0 ${{ github.run_id }} ${{ github.sha }} ${{ github.actor }}

- name: Build & Test
  run: npm test

- name: Log — tests passed
  run: npx chainguard log 5 ${{ github.run_id }} ${{ github.sha }} ${{ github.actor }}

- name: Verify pipeline integrity
  run: npx chainguard verify ${{ github.run_id }} ${{ github.sha }} ${{ github.actor }}

- name: Deploy
  run: npm run deploy
```

---

## CLI Commands

### `chainguard log <stage> <runId> <commitHash> <actor> [notes]`

Log a CI/CD event to the blockchain.

```bash
npx chainguard log 0 $GITHUB_RUN_ID $GITHUB_SHA $GITHUB_ACTOR "Pipeline started"
```

Stage values:

| Index | Stage |
|---|---|
| 0 | PIPELINE_TRIGGERED |
| 1 | BUILD_STARTED |
| 2 | BUILD_SUCCESS |
| 3 | BUILD_FAILED |
| 4 | TESTS_STARTED |
| 5 | TESTS_PASSED |
| 6 | TESTS_FAILED |
| 7 | INTEGRITY_VERIFIED |
| 8 | INTEGRITY_FAILED |
| 9 | DEPLOY_STARTED |
| 10 | DEPLOY_SUCCESS |
| 11 | DEPLOY_FAILED |

---

### `chainguard verify <runId> <commitHash> <actor>`

Verify pipeline integrity on-chain. Exits 0 if verified, exits 1 if tamper detected (blocking deployment).

```bash
npx chainguard verify $GITHUB_RUN_ID $GITHUB_SHA $GITHUB_ACTOR
```

---

### `chainguard hash <file>`

Compute the SHA-256 hash of a file in bytes32 format.

```bash
npx chainguard hash .github/workflows/pipeline.yml
# 0x2aca9283823e1457...
```

---

### `chainguard status`

Show current pipeline status and verification stats from the blockchain.

```bash
npx chainguard status
```

---

## Programmatic usage

```javascript
const chainguard = require("oprico-chainguard-logger");

// Log an event
await chainguard.logEvent({
  stage:      chainguard.Stage.BUILD_SUCCESS,
  runId:      "12345678",
  commitHash: "abc123...",
  actor:      "octocat",
  notes:      "Build completed in 42s",
});

// Verify integrity
await chainguard.verifyIntegrity({
  runId:      "12345678",
  commitHash: "abc123...",
  actor:      "octocat",
});

// Hash a file
const hash = chainguard.hashFile(".github/workflows/pipeline.yml");
console.log(hash); // 0x2aca9283...
```

---

## How tamper detection works

1. When you first set up, the SHA-256 hash of your `pipeline.yml` is registered on the blockchain as the **approved hash**
2. On every pipeline run, ChainGuard computes the **live hash** of `pipeline.yml` at runtime
3. It calls the `Verifier` smart contract which compares the two hashes
4. If they match — deployment proceeds
5. If they don't match — deployment is blocked and a `TamperDetected` event is permanently recorded on-chain

---

## License

MIT © Oprico101
