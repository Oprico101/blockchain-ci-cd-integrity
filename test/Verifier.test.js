// test/Verifier.test.js
//
// Full unit test suite for Verifier.sol
//
// These tests are the most important for your dissertation —
// they directly prove the tamper detection and integrity verification
// mechanisms work correctly end-to-end.
//
// Run with:
//   npm test
//   npm run test:gas   ← also prints gas cost per function

const { expect }      = require("chai");
const { ethers }      = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fakeHash(seed = "test") {
  return ethers.keccak256(ethers.toUtf8Bytes(seed));
}

// Shared test inputs
const PIPELINE_NAME  = "main-branch-pipeline";
const APPROVED_HASH  = fakeHash("approved-pipeline-config-v1");
const TAMPERED_HASH  = fakeHash("tampered-pipeline-config");
const RUN_ID         = 123456789n;
const COMMIT_HASH    = "abc123def456abc123def456abc123def456abc1";
const ACTOR          = "octocat";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/**
 * Deploy all three contracts in dependency order and wire them together.
 * This mirrors exactly what deploy.js does on Sepolia.
 */
async function deployAllFixture() {
  const [owner, botWallet, otherAccount] = await ethers.getSigners();

  // 1. Deploy PipelineRegistry
  const RegistryFactory = await ethers.getContractFactory("PipelineRegistry");
  const registry        = await RegistryFactory.deploy();

  // 2. Deploy EventLogger
  const LoggerFactory = await ethers.getContractFactory("EventLogger");
  const logger        = await LoggerFactory.deploy();

  // 3. Deploy Verifier — wired to registry + logger
  const VerifierFactory = await ethers.getContractFactory("Verifier");
  const verifier        = await VerifierFactory.deploy(
    await registry.getAddress(),
    await logger.getAddress()
  );

  // Authorise Verifier to write to EventLogger
  await logger.authoriseLogger(await verifier.getAddress());

  // Authorise bot wallet in Verifier
  await verifier.authoriseCaller(botWallet.address);

  return { registry, logger, verifier, owner, botWallet, otherAccount };
}

/**
 * Deploy all contracts AND register an approved pipeline.
 * Most tests start from this state.
 */
async function deployWithPipelineFixture() {
  const contracts = await loadFixture(deployAllFixture);
  const { registry } = contracts;

  await registry.registerPipeline(PIPELINE_NAME, APPROVED_HASH);

  return { ...contracts, pipelineId: 1n };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe("Verifier", function () {

  // ── Deployment ─────────────────────────────────────────────────────────────
  describe("Deployment", function () {

    it("stores the registry address immutably", async function () {
      const { verifier, registry } = await loadFixture(deployAllFixture);
      expect(await verifier.registry()).to.equal(await registry.getAddress());
    });

    it("stores the logger address immutably", async function () {
      const { verifier, logger } = await loadFixture(deployAllFixture);
      expect(await verifier.logger()).to.equal(await logger.getAddress());
    });

    it("sets the deployer as owner", async function () {
      const { verifier, owner } = await loadFixture(deployAllFixture);
      expect(await verifier.owner()).to.equal(owner.address);
    });

    it("auto-authorises the deployer as a caller", async function () {
      const { verifier, owner } = await loadFixture(deployAllFixture);
      expect(await verifier.authorisedCallers(owner.address)).to.be.true;
    });

    it("starts with verificationCount of 0", async function () {
      const { verifier } = await loadFixture(deployAllFixture);
      expect(await verifier.verificationCount()).to.equal(0n);
    });

    it("reverts if registry address is zero", async function () {
      const LoggerFactory = await ethers.getContractFactory("EventLogger");
      const logger        = await LoggerFactory.deploy();
      const VerifierFactory = await ethers.getContractFactory("Verifier");

      await expect(
        VerifierFactory.deploy(ethers.ZeroAddress, await logger.getAddress())
      ).to.be.revertedWith("Verifier: invalid registry address");
    });

    it("reverts if logger address is zero", async function () {
      const RegistryFactory = await ethers.getContractFactory("PipelineRegistry");
      const registry        = await RegistryFactory.deploy();
      const VerifierFactory = await ethers.getContractFactory("Verifier");

      await expect(
        VerifierFactory.deploy(await registry.getAddress(), ethers.ZeroAddress)
      ).to.be.revertedWith("Verifier: invalid logger address");
    });
  });

  // ── Access control ─────────────────────────────────────────────────────────
  describe("Access control", function () {

    it("owner can authorise a new caller", async function () {
      const { verifier, otherAccount } = await loadFixture(deployAllFixture);
      await verifier.authoriseCaller(otherAccount.address);
      expect(await verifier.authorisedCallers(otherAccount.address)).to.be.true;
    });

    it("owner can revoke a caller", async function () {
      const { verifier, botWallet } = await loadFixture(deployAllFixture);
      await verifier.revokeCaller(botWallet.address);
      expect(await verifier.authorisedCallers(botWallet.address)).to.be.false;
    });

    it("reverts if non-owner tries to authorise a caller", async function () {
      const { verifier, botWallet, otherAccount } =
        await loadFixture(deployAllFixture);

      await expect(
        verifier.connect(otherAccount).authoriseCaller(botWallet.address)
      ).to.be.revertedWith("Verifier: caller is not the owner");
    });

    it("reverts if unauthorised address calls verify()", async function () {
      const { verifier, otherAccount } =
        await loadFixture(deployWithPipelineFixture);

      await expect(
        verifier.connect(otherAccount).verify(
          1n, RUN_ID, APPROVED_HASH, COMMIT_HASH, ACTOR
        )
      ).to.be.revertedWith("Verifier: caller is not authorised");
    });
  });

  // ── verify — passing cases ─────────────────────────────────────────────────
  describe("verify() — integrity PASSES", function () {

    it("returns passed=true when hash matches the approved hash", async function () {
      const { verifier, pipelineId } =
        await loadFixture(deployWithPipelineFixture);

      // staticCall lets us read the return value without sending a tx
      const [passed] = await verifier.verify.staticCall(
        pipelineId, RUN_ID, APPROVED_HASH, COMMIT_HASH, ACTOR
      );

      expect(passed).to.be.true;
    });

    it("increments verificationCount on a passing verification", async function () {
      const { verifier, pipelineId } =
        await loadFixture(deployWithPipelineFixture);

      await verifier.verify(pipelineId, RUN_ID, APPROVED_HASH, COMMIT_HASH, ACTOR);

      expect(await verifier.verificationCount()).to.equal(1n);
    });

    it("emits VerificationResult with passed=true", async function () {
      const { verifier, pipelineId } =
        await loadFixture(deployWithPipelineFixture);

      await expect(
        verifier.verify(pipelineId, RUN_ID, APPROVED_HASH, COMMIT_HASH, ACTOR)
      )
        .to.emit(verifier, "VerificationResult")
        .withArgs(
          1n,
          pipelineId,
          RUN_ID,
          APPROVED_HASH,
          APPROVED_HASH,
          true,
          ACTOR,
          (ts) => ts > 0n
        );
    });

    it("does NOT emit TamperDetected on a passing verification", async function () {
      const { verifier, pipelineId } =
        await loadFixture(deployWithPipelineFixture);

      await expect(
        verifier.verify(pipelineId, RUN_ID, APPROVED_HASH, COMMIT_HASH, ACTOR)
      ).to.not.emit(verifier, "TamperDetected");
    });

    it("stores a VerificationRecord on-chain with correct data", async function () {
      const { verifier, pipelineId, owner } =
        await loadFixture(deployWithPipelineFixture);

      await verifier.verify(pipelineId, RUN_ID, APPROVED_HASH, COMMIT_HASH, ACTOR);

      const record = await verifier.getVerification(1);

      expect(record.verificationId).to.equal(1n);
      expect(record.pipelineId).to.equal(pipelineId);
      expect(record.runId).to.equal(RUN_ID);
      expect(record.candidateHash).to.equal(APPROVED_HASH);
      expect(record.approvedHash).to.equal(APPROVED_HASH);
      expect(record.passed).to.be.true;
      expect(record.commitHash).to.equal(COMMIT_HASH);
      expect(record.actor).to.equal(ACTOR);
      expect(record.checkedBy).to.equal(owner.address);
      expect(record.timestamp).to.be.greaterThan(0n);
    });

    it("failureCount stays 0 after a passing verification", async function () {
      const { verifier, pipelineId } =
        await loadFixture(deployWithPipelineFixture);

      await verifier.verify(pipelineId, RUN_ID, APPROVED_HASH, COMMIT_HASH, ACTOR);

      const [, failures] = await verifier.getStats();
      expect(failures).to.equal(0n);
    });

    it("appends verificationId to verificationsByPipeline", async function () {
      const { verifier, pipelineId } =
        await loadFixture(deployWithPipelineFixture);

      await verifier.verify(pipelineId, RUN_ID, APPROVED_HASH, COMMIT_HASH, ACTOR);

      const ids = await verifier.getVerificationsByPipeline(pipelineId);
      expect(ids.length).to.equal(1);
      expect(ids[0]).to.equal(1n);
    });

    it("bot wallet can call verify successfully", async function () {
      const { verifier, botWallet, pipelineId } =
        await loadFixture(deployWithPipelineFixture);

      const [passed] = await verifier.connect(botWallet).verify.staticCall(
        pipelineId, RUN_ID, APPROVED_HASH, COMMIT_HASH, ACTOR
      );

      expect(passed).to.be.true;
    });
  });

  // ── verify — tamper detection ──────────────────────────────────────────────
  describe("verify() — TAMPER DETECTED (the key security tests)", function () {

    it("returns passed=false when hash does NOT match approved hash", async function () {
      const { verifier, pipelineId } =
        await loadFixture(deployWithPipelineFixture);

      const [passed] = await verifier.verify.staticCall(
        pipelineId, RUN_ID, TAMPERED_HASH, COMMIT_HASH, ACTOR
      );

      expect(passed).to.be.false;
    });

    it("emits TamperDetected event when hash mismatches", async function () {
      const { verifier, pipelineId } =
        await loadFixture(deployWithPipelineFixture);

      await expect(
        verifier.verify(pipelineId, RUN_ID, TAMPERED_HASH, COMMIT_HASH, ACTOR)
      )
        .to.emit(verifier, "TamperDetected")
        .withArgs(
          pipelineId,
          RUN_ID,
          TAMPERED_HASH,
          APPROVED_HASH,
          ACTOR,
          (ts) => ts > 0n
        );
    });

    it("increments failureCount when verification fails", async function () {
      const { verifier, pipelineId } =
        await loadFixture(deployWithPipelineFixture);

      await verifier.verify(pipelineId, RUN_ID, TAMPERED_HASH, COMMIT_HASH, ACTOR);

      const [, failures] = await verifier.getStats();
      expect(failures).to.equal(1n);
    });

    it("stores the tampered hash in the VerificationRecord for audit", async function () {
      const { verifier, pipelineId } =
        await loadFixture(deployWithPipelineFixture);

      await verifier.verify(pipelineId, RUN_ID, TAMPERED_HASH, COMMIT_HASH, ACTOR);

      const record = await verifier.getVerification(1);

      expect(record.passed).to.be.false;
      // Both hashes stored — critical for the dissertation audit trail
      expect(record.candidateHash).to.equal(TAMPERED_HASH);
      expect(record.approvedHash).to.equal(APPROVED_HASH);
    });

    it("returns passed=false for a revoked pipeline even with correct hash", async function () {
      const { verifier, registry, pipelineId } =
        await loadFixture(deployWithPipelineFixture);

      await registry.revokePipeline(pipelineId);

      const [passed] = await verifier.verify.staticCall(
        pipelineId, RUN_ID, APPROVED_HASH, COMMIT_HASH, ACTOR
      );

      expect(passed).to.be.false;
    });

    it("returns passed=false for an unregistered pipelineId", async function () {
      const { verifier } = await loadFixture(deployWithPipelineFixture);

      const [passed] = await verifier.verify.staticCall(
        999n, RUN_ID, APPROVED_HASH, COMMIT_HASH, ACTOR
      );

      expect(passed).to.be.false;
    });

    it("correctly records pass and fail counts across multiple runs", async function () {
      const { verifier, pipelineId } =
        await loadFixture(deployWithPipelineFixture);

      // 2 passes
      await verifier.verify(pipelineId, RUN_ID,      APPROVED_HASH, COMMIT_HASH, ACTOR);
      await verifier.verify(pipelineId, RUN_ID + 1n, APPROVED_HASH, COMMIT_HASH, ACTOR);
      // 1 failure (tamper)
      await verifier.verify(pipelineId, RUN_ID + 2n, TAMPERED_HASH, COMMIT_HASH, ACTOR);

      const [total, failures, passes] = await verifier.getStats();
      expect(total).to.equal(3n);
      expect(failures).to.equal(1n);
      expect(passes).to.equal(2n);
    });
  });

  // ── checkOnly ──────────────────────────────────────────────────────────────
  describe("checkOnly() — read-only integrity preview", function () {

    it("returns true for the correct hash (no state change)", async function () {
      const { verifier, pipelineId } =
        await loadFixture(deployWithPipelineFixture);

      expect(await verifier.checkOnly(pipelineId, APPROVED_HASH)).to.be.true;
    });

    it("returns false for a wrong hash (no state change)", async function () {
      const { verifier, pipelineId } =
        await loadFixture(deployWithPipelineFixture);

      expect(await verifier.checkOnly(pipelineId, TAMPERED_HASH)).to.be.false;
    });

    it("does not increment verificationCount", async function () {
      const { verifier, pipelineId } =
        await loadFixture(deployWithPipelineFixture);

      await verifier.checkOnly(pipelineId, APPROVED_HASH);
      expect(await verifier.verificationCount()).to.equal(0n);
    });
  });

  // ── verify() input validation ──────────────────────────────────────────────
  describe("verify() — input validation", function () {

    it("reverts if pipelineId is 0", async function () {
      const { verifier } = await loadFixture(deployWithPipelineFixture);

      await expect(
        verifier.verify(0n, RUN_ID, APPROVED_HASH, COMMIT_HASH, ACTOR)
      ).to.be.revertedWith("Verifier: invalid pipelineId");
    });

    it("reverts if runId is 0", async function () {
      const { verifier, pipelineId } =
        await loadFixture(deployWithPipelineFixture);

      await expect(
        verifier.verify(pipelineId, 0n, APPROVED_HASH, COMMIT_HASH, ACTOR)
      ).to.be.revertedWith("Verifier: invalid runId");
    });

    it("reverts if candidateHash is zero bytes32", async function () {
      const { verifier, pipelineId } =
        await loadFixture(deployWithPipelineFixture);

      await expect(
        verifier.verify(pipelineId, RUN_ID, ethers.ZeroHash, COMMIT_HASH, ACTOR)
      ).to.be.revertedWith("Verifier: candidateHash required");
    });

    it("reverts if commitHash is empty string", async function () {
      const { verifier, pipelineId } =
        await loadFixture(deployWithPipelineFixture);

      await expect(
        verifier.verify(pipelineId, RUN_ID, APPROVED_HASH, "", ACTOR)
      ).to.be.revertedWith("Verifier: commitHash required");
    });

    it("reverts if actor is empty string", async function () {
      const { verifier, pipelineId } =
        await loadFixture(deployWithPipelineFixture);

      await expect(
        verifier.verify(pipelineId, RUN_ID, APPROVED_HASH, COMMIT_HASH, "")
      ).to.be.revertedWith("Verifier: actor required");
    });
  });

  // ── getStats ───────────────────────────────────────────────────────────────
  describe("getStats()", function () {

    it("returns zeros before any verifications", async function () {
      const { verifier } = await loadFixture(deployAllFixture);
      const [total, failures, passes] = await verifier.getStats();
      expect(total).to.equal(0n);
      expect(failures).to.equal(0n);
      expect(passes).to.equal(0n);
    });
  });
});
