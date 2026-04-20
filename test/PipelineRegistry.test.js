// test/PipelineRegistry.test.js
//
// Full unit test suite for PipelineRegistry.sol
//
// Run with:
//   npm test
//   npm run test:gas   ← also prints gas cost per function

const { expect }        = require("chai");
const { ethers }        = require("hardhat");
const { loadFixture }   = require("@nomicfoundation/hardhat-toolbox/network-helpers");

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Generate a deterministic fake bytes32 hash for testing. */
function fakeHash(seed = "test") {
  return ethers.keccak256(ethers.toUtf8Bytes(seed));
}

/** Deploy a fresh PipelineRegistry before each test group. */
async function deployRegistryFixture() {
  const [owner, otherAccount, anotherAccount] = await ethers.getSigners();
  const Factory  = await ethers.getContractFactory("PipelineRegistry");
  const registry = await Factory.deploy();
  return { registry, owner, otherAccount, anotherAccount };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe("PipelineRegistry", function () {

  // ── Deployment ─────────────────────────────────────────────────────────────
  describe("Deployment", function () {

    it("sets the deployer as owner", async function () {
      const { registry, owner } = await loadFixture(deployRegistryFixture);
      expect(await registry.owner()).to.equal(owner.address);
    });

    it("starts with pipelineCount of 0", async function () {
      const { registry } = await loadFixture(deployRegistryFixture);
      expect(await registry.pipelineCount()).to.equal(0n);
    });
  });

  // ── registerPipeline ───────────────────────────────────────────────────────
  describe("registerPipeline", function () {

    it("registers a pipeline and returns pipelineId 1", async function () {
      const { registry } = await loadFixture(deployRegistryFixture);
      const hash = fakeHash("pipeline-v1");

      await registry.registerPipeline("main-pipeline", hash);

      expect(await registry.pipelineCount()).to.equal(1n);
    });

    it("stores the name and hash correctly", async function () {
      const { registry } = await loadFixture(deployRegistryFixture);
      const hash = fakeHash("pipeline-v1");

      await registry.registerPipeline("main-pipeline", hash);
      const pipeline = await registry.getPipeline(1);

      expect(pipeline.name).to.equal("main-pipeline");
      expect(pipeline.configHash).to.equal(hash);
      expect(pipeline.registered).to.be.true;
      expect(pipeline.revoked).to.be.false;
    });

    it("emits PipelineRegistered event with correct args", async function () {
      const { registry, owner } = await loadFixture(deployRegistryFixture);
      const hash = fakeHash("pipeline-v1");

      await expect(registry.registerPipeline("main-pipeline", hash))
        .to.emit(registry, "PipelineRegistered")
        .withArgs(
          1n,
          "main-pipeline",
          hash,
          owner.address,
          // timestamp — we just check it's a positive number
          (ts) => ts > 0n
        );
    });

    it("increments pipelineId for each new registration", async function () {
      const { registry } = await loadFixture(deployRegistryFixture);

      await registry.registerPipeline("pipeline-a", fakeHash("a"));
      await registry.registerPipeline("pipeline-b", fakeHash("b"));
      await registry.registerPipeline("pipeline-c", fakeHash("c"));

      expect(await registry.pipelineCount()).to.equal(3n);

      const a = await registry.getPipeline(1);
      const b = await registry.getPipeline(2);
      const c = await registry.getPipeline(3);

      expect(a.name).to.equal("pipeline-a");
      expect(b.name).to.equal("pipeline-b");
      expect(c.name).to.equal("pipeline-c");
    });

    it("reverts if called by non-owner", async function () {
      const { registry, otherAccount } = await loadFixture(deployRegistryFixture);

      await expect(
        registry.connect(otherAccount).registerPipeline("hacked", fakeHash("hack"))
      ).to.be.revertedWith("PipelineRegistry: caller is not the owner");
    });

    it("reverts if name is empty", async function () {
      const { registry } = await loadFixture(deployRegistryFixture);

      await expect(
        registry.registerPipeline("", fakeHash("v1"))
      ).to.be.revertedWith("PipelineRegistry: name cannot be empty");
    });

    it("reverts if hash is zero bytes32", async function () {
      const { registry } = await loadFixture(deployRegistryFixture);

      await expect(
        registry.registerPipeline("pipeline", ethers.ZeroHash)
      ).to.be.revertedWith("PipelineRegistry: hash cannot be zero");
    });
  });

  // ── verifyHash ─────────────────────────────────────────────────────────────
  describe("verifyHash", function () {

    it("returns true for the correct hash", async function () {
      const { registry } = await loadFixture(deployRegistryFixture);
      const hash = fakeHash("approved-config");

      await registry.registerPipeline("main-pipeline", hash);

      expect(await registry.verifyHash(1, hash)).to.be.true;
    });

    it("returns false for an incorrect hash", async function () {
      const { registry } = await loadFixture(deployRegistryFixture);

      await registry.registerPipeline("main-pipeline", fakeHash("approved"));

      expect(await registry.verifyHash(1, fakeHash("tampered"))).to.be.false;
    });

    it("returns false for an unregistered pipeline", async function () {
      const { registry } = await loadFixture(deployRegistryFixture);

      expect(await registry.verifyHash(99, fakeHash("any"))).to.be.false;
    });

    it("returns false for a revoked pipeline even with correct hash", async function () {
      const { registry } = await loadFixture(deployRegistryFixture);
      const hash = fakeHash("approved");

      await registry.registerPipeline("main-pipeline", hash);
      await registry.revokePipeline(1);

      // Even the correct hash must fail on a revoked pipeline
      expect(await registry.verifyHash(1, hash)).to.be.false;
    });
  });

  // ── updateApprovedHash ─────────────────────────────────────────────────────
  describe("updateApprovedHash", function () {

    it("updates the stored hash correctly", async function () {
      const { registry } = await loadFixture(deployRegistryFixture);
      const oldHash = fakeHash("v1");
      const newHash = fakeHash("v2");

      await registry.registerPipeline("main-pipeline", oldHash);
      await registry.updateApprovedHash(1, newHash);

      const pipeline = await registry.getPipeline(1);
      expect(pipeline.configHash).to.equal(newHash);
    });

    it("emits PipelineHashUpdated with old and new hash", async function () {
      const { registry, owner } = await loadFixture(deployRegistryFixture);
      const oldHash = fakeHash("v1");
      const newHash = fakeHash("v2");

      await registry.registerPipeline("main-pipeline", oldHash);

      await expect(registry.updateApprovedHash(1, newHash))
        .to.emit(registry, "PipelineHashUpdated")
        .withArgs(1n, oldHash, newHash, owner.address, (ts) => ts > 0n);
    });

    it("reverts if called by non-owner", async function () {
      const { registry, otherAccount } = await loadFixture(deployRegistryFixture);
      await registry.registerPipeline("main-pipeline", fakeHash("v1"));

      await expect(
        registry.connect(otherAccount).updateApprovedHash(1, fakeHash("v2"))
      ).to.be.revertedWith("PipelineRegistry: caller is not the owner");
    });

    it("reverts if pipeline does not exist", async function () {
      const { registry } = await loadFixture(deployRegistryFixture);

      await expect(
        registry.updateApprovedHash(99, fakeHash("v2"))
      ).to.be.revertedWith("PipelineRegistry: pipeline not found");
    });

    it("reverts if pipeline is revoked", async function () {
      const { registry } = await loadFixture(deployRegistryFixture);
      await registry.registerPipeline("main-pipeline", fakeHash("v1"));
      await registry.revokePipeline(1);

      await expect(
        registry.updateApprovedHash(1, fakeHash("v2"))
      ).to.be.revertedWith("PipelineRegistry: pipeline is revoked");
    });
  });

  // ── revokePipeline ─────────────────────────────────────────────────────────
  describe("revokePipeline", function () {

    it("marks a pipeline as revoked", async function () {
      const { registry } = await loadFixture(deployRegistryFixture);
      await registry.registerPipeline("main-pipeline", fakeHash("v1"));
      await registry.revokePipeline(1);

      const pipeline = await registry.getPipeline(1);
      expect(pipeline.revoked).to.be.true;
    });

    it("emits PipelineRevoked event", async function () {
      const { registry, owner } = await loadFixture(deployRegistryFixture);
      await registry.registerPipeline("main-pipeline", fakeHash("v1"));

      await expect(registry.revokePipeline(1))
        .to.emit(registry, "PipelineRevoked")
        .withArgs(1n, owner.address, (ts) => ts > 0n);
    });

    it("reverts if called by non-owner", async function () {
      const { registry, otherAccount } = await loadFixture(deployRegistryFixture);
      await registry.registerPipeline("main-pipeline", fakeHash("v1"));

      await expect(
        registry.connect(otherAccount).revokePipeline(1)
      ).to.be.revertedWith("PipelineRegistry: caller is not the owner");
    });

    it("reverts if pipeline is already revoked", async function () {
      const { registry } = await loadFixture(deployRegistryFixture);
      await registry.registerPipeline("main-pipeline", fakeHash("v1"));
      await registry.revokePipeline(1);

      await expect(
        registry.revokePipeline(1)
      ).to.be.revertedWith("PipelineRegistry: pipeline is revoked");
    });
  });

  // ── transferOwnership ──────────────────────────────────────────────────────
  describe("transferOwnership", function () {

    it("transfers ownership to a new address", async function () {
      const { registry, otherAccount } = await loadFixture(deployRegistryFixture);
      await registry.transferOwnership(otherAccount.address);
      expect(await registry.owner()).to.equal(otherAccount.address);
    });

    it("reverts if new owner is zero address", async function () {
      const { registry } = await loadFixture(deployRegistryFixture);
      await expect(
        registry.transferOwnership(ethers.ZeroAddress)
      ).to.be.revertedWith("PipelineRegistry: new owner is zero address");
    });

    it("reverts if called by non-owner", async function () {
      const { registry, otherAccount, anotherAccount } =
        await loadFixture(deployRegistryFixture);

      await expect(
        registry.connect(otherAccount).transferOwnership(anotherAccount.address)
      ).to.be.revertedWith("PipelineRegistry: caller is not the owner");
    });
  });
});
