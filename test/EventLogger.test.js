// test/EventLogger.test.js
//
// Full unit test suite for EventLogger.sol
//
// Run with:
//   npm test
//   npm run test:gas   ← also prints gas cost per function

const { expect }      = require("chai");
const { ethers }      = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Stage enum values — mirrors EventLogger.sol exactly. */
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

function fakeHash(seed = "test") {
  return ethers.keccak256(ethers.toUtf8Bytes(seed));
}

/** Deploy a fresh EventLogger and return useful references. */
async function deployLoggerFixture() {
  const [owner, botWallet, otherAccount] = await ethers.getSigners();
  const Factory = await ethers.getContractFactory("EventLogger");
  const logger  = await Factory.deploy();
  return { logger, owner, botWallet, otherAccount };
}

/** Deploy and pre-authorise the bot wallet. */
async function deployAuthorisedFixture() {
  const { logger, owner, botWallet, otherAccount } =
    await loadFixture(deployLoggerFixture);

  await logger.authoriseLogger(botWallet.address);
  return { logger, owner, botWallet, otherAccount };
}

/** Shared valid log params for reuse across tests. */
const VALID_PARAMS = {
  pipelineId: 1n,
  runId:      987654321n,
  stage:      Stage.BUILD_SUCCESS,
  configHash: fakeHash("approved-config"),
  commitHash: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  actor:      "octocat",
  notes:      "Build completed in 42s",
};

// ─── Test suite ───────────────────────────────────────────────────────────────

describe("EventLogger", function () {

  // ── Deployment ─────────────────────────────────────────────────────────────
  describe("Deployment", function () {

    it("sets the deployer as owner", async function () {
      const { logger, owner } = await loadFixture(deployLoggerFixture);
      expect(await logger.owner()).to.equal(owner.address);
    });

    it("auto-authorises the deployer as a logger", async function () {
      const { logger, owner } = await loadFixture(deployLoggerFixture);
      expect(await logger.authorisedLoggers(owner.address)).to.be.true;
    });

    it("starts with logCount of 0", async function () {
      const { logger } = await loadFixture(deployLoggerFixture);
      expect(await logger.logCount()).to.equal(0n);
    });
  });

  // ── Access control ─────────────────────────────────────────────────────────
  describe("Access control", function () {

    it("owner can authorise a new logger", async function () {
      const { logger, botWallet } = await loadFixture(deployLoggerFixture);
      await logger.authoriseLogger(botWallet.address);
      expect(await logger.authorisedLoggers(botWallet.address)).to.be.true;
    });

    it("emits LoggerAuthorised when a logger is added", async function () {
      const { logger, botWallet } = await loadFixture(deployLoggerFixture);

      await expect(logger.authoriseLogger(botWallet.address))
        .to.emit(logger, "LoggerAuthorised")
        .withArgs(botWallet.address, (ts) => ts > 0n);
    });

    it("owner can revoke a logger", async function () {
      const { logger, botWallet } = await loadFixture(deployLoggerFixture);
      await logger.authoriseLogger(botWallet.address);
      await logger.revokeLogger(botWallet.address);
      expect(await logger.authorisedLoggers(botWallet.address)).to.be.false;
    });

    it("emits LoggerRevoked when a logger is removed", async function () {
      const { logger, botWallet } = await loadFixture(deployLoggerFixture);
      await logger.authoriseLogger(botWallet.address);

      await expect(logger.revokeLogger(botWallet.address))
        .to.emit(logger, "LoggerRevoked")
        .withArgs(botWallet.address, (ts) => ts > 0n);
    });

    it("reverts if non-owner tries to authorise a logger", async function () {
      const { logger, otherAccount, botWallet } =
        await loadFixture(deployLoggerFixture);

      await expect(
        logger.connect(otherAccount).authoriseLogger(botWallet.address)
      ).to.be.revertedWith("EventLogger: caller is not the owner");
    });

    it("reverts if non-owner tries to revoke a logger", async function () {
      const { logger, botWallet, otherAccount } =
        await loadFixture(deployAuthorisedFixture);

      await expect(
        logger.connect(otherAccount).revokeLogger(botWallet.address)
      ).to.be.revertedWith("EventLogger: caller is not the owner");
    });
  });

  // ── logEvent ───────────────────────────────────────────────────────────────
  describe("logEvent", function () {

    it("logs an event and returns logId 1", async function () {
      const { logger } = await loadFixture(deployLoggerFixture);
      const p = VALID_PARAMS;

      const tx = await logger.logEvent(
        p.pipelineId, p.runId, p.stage,
        p.configHash, p.commitHash, p.actor, p.notes
      );
      const receipt = await tx.wait();

      // logCount should now be 1
      expect(await logger.logCount()).to.equal(1n);
    });

    it("stores all fields in the LogEntry struct correctly", async function () {
      const { logger, owner } = await loadFixture(deployLoggerFixture);
      const p = VALID_PARAMS;

      await logger.logEvent(
        p.pipelineId, p.runId, p.stage,
        p.configHash, p.commitHash, p.actor, p.notes
      );

      const entry = await logger.getLogEntry(1);

      expect(entry.logId).to.equal(1n);
      expect(entry.pipelineId).to.equal(p.pipelineId);
      expect(entry.runId).to.equal(p.runId);
      expect(entry.stage).to.equal(p.stage);
      expect(entry.configHash).to.equal(p.configHash);
      expect(entry.commitHash).to.equal(p.commitHash);
      expect(entry.actor).to.equal(p.actor);
      expect(entry.notes).to.equal(p.notes);
      expect(entry.loggedBy).to.equal(owner.address);
      expect(entry.timestamp).to.be.greaterThan(0n);
    });

    it("emits CiCdEventLogged with all correct fields", async function () {
      const { logger, owner } = await loadFixture(deployLoggerFixture);
      const p = VALID_PARAMS;

      await expect(
        logger.logEvent(
          p.pipelineId, p.runId, p.stage,
          p.configHash, p.commitHash, p.actor, p.notes
        )
      )
        .to.emit(logger, "CiCdEventLogged")
        .withArgs(
          1n,
          p.pipelineId,
          p.runId,
          p.stage,
          p.configHash,
          p.commitHash,
          p.actor,
          owner.address,
          (ts) => ts > 0n
        );
    });

    it("indexes the logId under the correct pipelineId", async function () {
      const { logger } = await loadFixture(deployLoggerFixture);
      const p = VALID_PARAMS;

      await logger.logEvent(
        p.pipelineId, p.runId, p.stage,
        p.configHash, p.commitHash, p.actor, ""
      );
      await logger.logEvent(
        p.pipelineId, p.runId, Stage.DEPLOY_SUCCESS,
        p.configHash, p.commitHash, p.actor, ""
      );

      const ids = await logger.getLogIdsByPipeline(p.pipelineId);
      expect(ids.length).to.equal(2);
      expect(ids[0]).to.equal(1n);
      expect(ids[1]).to.equal(2n);
    });

    it("indexes the logId under the correct runId", async function () {
      const { logger } = await loadFixture(deployLoggerFixture);
      const p = VALID_PARAMS;

      await logger.logEvent(
        p.pipelineId, p.runId, Stage.BUILD_STARTED,
        p.configHash, p.commitHash, p.actor, ""
      );
      await logger.logEvent(
        p.pipelineId, p.runId, Stage.BUILD_SUCCESS,
        p.configHash, p.commitHash, p.actor, ""
      );

      const ids = await logger.getLogIdsByRun(p.runId);
      expect(ids.length).to.equal(2);
    });

    it("authorised bot wallet can log events", async function () {
      const { logger, botWallet } =
        await loadFixture(deployAuthorisedFixture);
      const p = VALID_PARAMS;

      await expect(
        logger.connect(botWallet).logEvent(
          p.pipelineId, p.runId, p.stage,
          p.configHash, p.commitHash, p.actor, ""
        )
      ).to.not.be.reverted;
    });

    it("reverts if called by an unauthorised address", async function () {
      const { logger, otherAccount } = await loadFixture(deployLoggerFixture);
      const p = VALID_PARAMS;

      await expect(
        logger.connect(otherAccount).logEvent(
          p.pipelineId, p.runId, p.stage,
          p.configHash, p.commitHash, p.actor, ""
        )
      ).to.be.revertedWith("EventLogger: caller is not an authorised logger");
    });

    it("reverts if pipelineId is 0", async function () {
      const { logger } = await loadFixture(deployLoggerFixture);
      const p = VALID_PARAMS;

      await expect(
        logger.logEvent(0, p.runId, p.stage, p.configHash, p.commitHash, p.actor, "")
      ).to.be.revertedWith("EventLogger: invalid pipelineId");
    });

    it("reverts if runId is 0", async function () {
      const { logger } = await loadFixture(deployLoggerFixture);
      const p = VALID_PARAMS;

      await expect(
        logger.logEvent(p.pipelineId, 0, p.stage, p.configHash, p.commitHash, p.actor, "")
      ).to.be.revertedWith("EventLogger: invalid runId");
    });

    it("reverts if commitHash is empty", async function () {
      const { logger } = await loadFixture(deployLoggerFixture);
      const p = VALID_PARAMS;

      await expect(
        logger.logEvent(p.pipelineId, p.runId, p.stage, p.configHash, "", p.actor, "")
      ).to.be.revertedWith("EventLogger: commitHash required");
    });

    it("reverts if actor is empty", async function () {
      const { logger } = await loadFixture(deployLoggerFixture);
      const p = VALID_PARAMS;

      await expect(
        logger.logEvent(p.pipelineId, p.runId, p.stage, p.configHash, p.commitHash, "", "")
      ).to.be.revertedWith("EventLogger: actor required");
    });
  });

  // ── getRecentLogs ──────────────────────────────────────────────────────────
  describe("getRecentLogs", function () {

    it("returns the most recent N entries in reverse order", async function () {
      const { logger } = await loadFixture(deployLoggerFixture);
      const p = VALID_PARAMS;

      // Log 3 events
      for (let i = 0; i < 3; i++) {
        await logger.logEvent(
          p.pipelineId, p.runId + BigInt(i), i,
          p.configHash, p.commitHash, p.actor, `event ${i}`
        );
      }

      const recent = await logger.getRecentLogs(2);
      expect(recent.length).to.equal(2);
      // Most recent first
      expect(recent[0].logId).to.equal(3n);
      expect(recent[1].logId).to.equal(2n);
    });

    it("caps results at 50 even if more are requested", async function () {
      const { logger } = await loadFixture(deployLoggerFixture);
      const p = VALID_PARAMS;

      // Log 5 events
      for (let i = 0; i < 5; i++) {
        await logger.logEvent(
          p.pipelineId, p.runId, i,
          p.configHash, p.commitHash, p.actor, ""
        );
      }

      // Requesting 100 should return only 5 (what exists, capped at 50)
      const recent = await logger.getRecentLogs(100);
      expect(recent.length).to.equal(5);
    });

    it("returns all entries if count equals logCount", async function () {
      const { logger } = await loadFixture(deployLoggerFixture);
      const p = VALID_PARAMS;

      await logger.logEvent(
        p.pipelineId, p.runId, p.stage,
        p.configHash, p.commitHash, p.actor, ""
      );

      const recent = await logger.getRecentLogs(1);
      expect(recent.length).to.equal(1);
      expect(recent[0].logId).to.equal(1n);
    });
  });

  // ── getLogEntry ────────────────────────────────────────────────────────────
  describe("getLogEntry", function () {

    it("reverts for logId 0", async function () {
      const { logger } = await loadFixture(deployLoggerFixture);
      await expect(logger.getLogEntry(0)).to.be.revertedWith(
        "EventLogger: log not found"
      );
    });

    it("reverts for a logId beyond logCount", async function () {
      const { logger } = await loadFixture(deployLoggerFixture);
      await expect(logger.getLogEntry(999)).to.be.revertedWith(
        "EventLogger: log not found"
      );
    });
  });

  // ── All 12 stages can be logged ────────────────────────────────────────────
  describe("All Stage enum values", function () {

    it("accepts all 12 stage values without reverting", async function () {
      const { logger } = await loadFixture(deployLoggerFixture);
      const p = VALID_PARAMS;

      for (const [name, index] of Object.entries(Stage)) {
        await expect(
          logger.logEvent(
            p.pipelineId,
            p.runId + BigInt(index),
            index,
            p.configHash,
            p.commitHash,
            p.actor,
            `Stage: ${name}`
          ),
          `Stage ${name} (${index}) should not revert`
        ).to.not.be.reverted;
      }

      expect(await logger.logCount()).to.equal(12n);
    });
  });
});
