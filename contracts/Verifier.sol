// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @notice Minimal interface for PipelineRegistry — only the
 *         functions Verifier needs to call.
 */
interface IPipelineRegistry {
    function verifyHash(
        uint256 pipelineId,
        bytes32 candidateHash
    ) external view returns (bool isValid);

    function getPipeline(uint256 pipelineId)
        external
        view
        returns (
            string  memory name,
            bytes32        configHash,
            bool           registered,
            bool           revoked
        );
}

/**
 * @notice Minimal interface for EventLogger — only logEvent.
 */
interface IEventLogger {
    enum Stage {
        PIPELINE_TRIGGERED,
        BUILD_STARTED,
        BUILD_SUCCESS,
        BUILD_FAILED,
        TESTS_STARTED,
        TESTS_PASSED,
        TESTS_FAILED,
        INTEGRITY_VERIFIED,  // index 7
        INTEGRITY_FAILED,    // index 8
        DEPLOY_STARTED,
        DEPLOY_SUCCESS,
        DEPLOY_FAILED
    }

    function logEvent(
        uint256 pipelineId,
        uint256 runId,
        Stage   stage,
        bytes32 configHash,
        string  calldata commitHash,
        string  calldata actor,
        string  calldata notes
    ) external returns (uint256 logId);
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * @title  Verifier
 * @notice The integrity gate of the system.
 *
 *         GitHub Actions calls this contract (via blockchain-logger.js)
 *         just before the deploy step. Verifier:
 *
 *           1. Asks PipelineRegistry whether the live workflow hash
 *              matches the stored approved hash.
 *           2. Emits a VerificationResult event with the outcome.
 *           3. Tells EventLogger to record INTEGRITY_VERIFIED or
 *              INTEGRITY_FAILED so the audit trail is complete.
 *           4. Returns the boolean result to the caller — the GitHub
 *              Actions job aborts the deploy if false.
 *
 * @dev    Deployed after PipelineRegistry and EventLogger.
 *         Their addresses are passed to the constructor and stored
 *         immutably, preventing post-deployment tampering.
 */
contract Verifier {

    // ─────────────────────────────────────────────
    //  Immutable contract references
    // ─────────────────────────────────────────────

    /// @notice Address of the deployed PipelineRegistry contract.
    ///         Immutable — cannot be changed after deployment.
    IPipelineRegistry public immutable registry;

    /// @notice Address of the deployed EventLogger contract.
    ///         Immutable — cannot be changed after deployment.
    IEventLogger public immutable logger;

    // ─────────────────────────────────────────────
    //  State variables
    // ─────────────────────────────────────────────

    /// @notice Contract owner — the only address that can authorise callers.
    address public owner;

    /// @notice Addresses permitted to trigger verifications.
    ///         Must include the GitHub Actions bot wallet.
    mapping(address => bool) public authorisedCallers;

    /// @notice Total number of verifications performed (pass + fail).
    uint256 public verificationCount;

    /// @notice Total number of failed verifications — useful for the dashboard.
    uint256 public failureCount;

    // ─────────────────────────────────────────────
    //  Structs
    // ─────────────────────────────────────────────

    /**
     * @notice Full record of one verification attempt, stored on-chain.
     * @param verificationId  Auto-incremented unique ID.
     * @param pipelineId      The pipeline checked.
     * @param runId           GitHub Actions run ID.
     * @param candidateHash   Hash of the live workflow YAML at check time.
     * @param approvedHash    Hash stored in PipelineRegistry at check time.
     * @param passed          True if the hashes matched.
     * @param commitHash      Git commit SHA of the triggering push.
     * @param actor           GitHub username that triggered the run.
     * @param checkedBy       Bot wallet address that called this function.
     * @param timestamp       Block timestamp of the verification.
     */
    struct VerificationRecord {
        uint256 verificationId;
        uint256 pipelineId;
        uint256 runId;
        bytes32 candidateHash;
        bytes32 approvedHash;
        bool    passed;
        string  commitHash;
        string  actor;
        address checkedBy;
        uint256 timestamp;
    }

    /// @notice All verification records, indexed by verificationId (1-based).
    mapping(uint256 => VerificationRecord) public verifications;

    /// @notice All verificationIds for a given pipelineId.
    mapping(uint256 => uint256[]) public verificationsByPipeline;

    // ─────────────────────────────────────────────
    //  Events
    // ─────────────────────────────────────────────

    /**
     * @notice Emitted on every verification attempt, pass or fail.
     *         The dashboard listens for this to show integrity status.
     *
     * @param verificationId  Unique ID of this check.
     * @param pipelineId      The pipeline that was checked.
     * @param runId           GitHub Actions run ID.
     * @param candidateHash   Hash presented by the running pipeline.
     * @param approvedHash    Hash on record in PipelineRegistry.
     * @param passed          Whether they matched.
     * @param actor           Who triggered the run.
     * @param timestamp       When the check happened.
     */
    event VerificationResult(
        uint256 indexed verificationId,
        uint256 indexed pipelineId,
        uint256 indexed runId,
        bytes32         candidateHash,
        bytes32         approvedHash,
        bool            passed,
        string          actor,
        uint256         timestamp
    );

    /**
     * @notice Emitted specifically on a tamper detection (hash mismatch).
     *         Useful for dashboards or alerting systems that filter
     *         only on failure events.
     *
     * @param pipelineId     The affected pipeline.
     * @param runId          The run where tampering was detected.
     * @param candidateHash  The unexpected hash found in the live workflow.
     * @param approvedHash   The hash that was expected.
     * @param actor          Who triggered the run.
     * @param timestamp      When it was detected.
     */
    event TamperDetected(
        uint256 indexed pipelineId,
        uint256 indexed runId,
        bytes32         candidateHash,
        bytes32         approvedHash,
        string          actor,
        uint256         timestamp
    );

    /// @notice Emitted when a caller is authorised.
    event CallerAuthorised(address indexed caller, uint256 timestamp);

    /// @notice Emitted when a caller is revoked.
    event CallerRevoked(address indexed caller, uint256 timestamp);

    // ─────────────────────────────────────────────
    //  Modifiers
    // ─────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "Verifier: caller is not the owner");
        _;
    }

    modifier onlyAuthorised() {
        require(
            authorisedCallers[msg.sender] || msg.sender == owner,
            "Verifier: caller is not authorised"
        );
        _;
    }

    // ─────────────────────────────────────────────
    //  Constructor
    // ─────────────────────────────────────────────

    /**
     * @notice Wires Verifier to the already-deployed PipelineRegistry
     *         and EventLogger contracts.
     *
     * @param registryAddress  Address of the deployed PipelineRegistry.
     * @param loggerAddress    Address of the deployed EventLogger.
     *
     * @dev    Run deploy.js which deploys all three contracts in order
     *         and passes these addresses automatically.
     */
    constructor(address registryAddress, address loggerAddress) {
        require(registryAddress != address(0), "Verifier: invalid registry address");
        require(loggerAddress   != address(0), "Verifier: invalid logger address");

        registry = IPipelineRegistry(registryAddress);
        logger   = IEventLogger(loggerAddress);
        owner    = msg.sender;

        authorisedCallers[msg.sender] = true;
        emit CallerAuthorised(msg.sender, block.timestamp);
    }

    // ─────────────────────────────────────────────
    //  Access control
    // ─────────────────────────────────────────────

    /**
     * @notice Authorise a wallet to call verify().
     *         Add your GitHub Actions bot wallet here after deployment.
     */
    function authoriseCaller(address caller) external onlyOwner {
        require(caller != address(0), "Verifier: zero address");
        authorisedCallers[caller] = true;
        emit CallerAuthorised(caller, block.timestamp);
    }

    /**
     * @notice Revoke a wallet's permission to call verify().
     */
    function revokeCaller(address caller) external onlyOwner {
        authorisedCallers[caller] = false;
        emit CallerRevoked(caller, block.timestamp);
    }

    // ─────────────────────────────────────────────
    //  Core verification function
    // ─────────────────────────────────────────────

    /**
     * @notice Perform an integrity check on a pipeline run.
     *
     *         This is the single most important function in the system.
     *         It is called by blockchain-logger.js at the "verify" step
     *         of the GitHub Actions workflow, before deployment begins.
     *
     *         Flow:
     *           1. Fetches the approved hash from PipelineRegistry.
     *           2. Compares it to the candidateHash computed at runtime.
     *           3. Stores a VerificationRecord on-chain.
     *           4. Emits VerificationResult (always) and TamperDetected
     *              (only on failure).
     *           5. Calls EventLogger to append INTEGRITY_VERIFIED or
     *              INTEGRITY_FAILED to the audit trail.
     *           6. Returns the boolean result — the GitHub Actions step
     *              checks this and aborts the deploy if false.
     *
     * @param pipelineId     ID from PipelineRegistry for this pipeline.
     * @param runId          GitHub Actions ${{ github.run_id }}.
     * @param candidateHash  SHA-256 of the live .github/workflows/pipeline.yml,
     *                       computed by hash-generator.js at runtime.
     * @param commitHash     Git commit SHA that triggered this run.
     * @param actor          GitHub username that triggered the run.
     *
     * @return passed        True if hashes match and pipeline is not revoked.
     * @return verificationId  The ID of the stored VerificationRecord.
     */
    function verify(
        uint256 pipelineId,
        uint256 runId,
        bytes32 candidateHash,
        string  calldata commitHash,
        string  calldata actor
    )
        external
        onlyAuthorised
        returns (bool passed, uint256 verificationId)
    {
        require(pipelineId > 0,               "Verifier: invalid pipelineId");
        require(runId > 0,                    "Verifier: invalid runId");
        require(candidateHash != bytes32(0),  "Verifier: candidateHash required");
        require(bytes(commitHash).length > 0, "Verifier: commitHash required");
        require(bytes(actor).length > 0,      "Verifier: actor required");

        // ── 1. Fetch the approved hash from PipelineRegistry ──
        (
            ,                    // name (unused here)
            bytes32 approvedHash,
            bool    registered,
            bool    revoked
        ) = registry.getPipeline(pipelineId);

        // ── 2. Determine pass/fail ──
        //    Fails if: pipeline not registered, pipeline revoked,
        //    or hash does not match exactly.
        if (!registered || revoked) {
            passed = false;
        } else {
            passed = (approvedHash == candidateHash);
        }

        // ── 3. Store the VerificationRecord on-chain ──
        verificationId = ++verificationCount;

        verifications[verificationId] = VerificationRecord({
            verificationId: verificationId,
            pipelineId:     pipelineId,
            runId:          runId,
            candidateHash:  candidateHash,
            approvedHash:   approvedHash,
            passed:         passed,
            commitHash:     commitHash,
            actor:          actor,
            checkedBy:      msg.sender,
            timestamp:      block.timestamp
        });

        verificationsByPipeline[pipelineId].push(verificationId);

        if (!passed) {
            unchecked { failureCount++; }
        }

        // ── 4. Emit events ──
        emit VerificationResult(
            verificationId,
            pipelineId,
            runId,
            candidateHash,
            approvedHash,
            passed,
            actor,
            block.timestamp
        );

        if (!passed) {
            emit TamperDetected(
                pipelineId,
                runId,
                candidateHash,
                approvedHash,
                actor,
                block.timestamp
            );
        }

        // ── 5. Append to EventLogger audit trail ──
        //    Use a try/catch so a logger failure never blocks verification.
        IEventLogger.Stage logStage = passed
            ? IEventLogger.Stage.INTEGRITY_VERIFIED
            : IEventLogger.Stage.INTEGRITY_FAILED;

        string memory notes = passed
            ? "Hash matched approved config"
            : "TAMPER DETECTED: hash mismatch";

        try logger.logEvent(
            pipelineId,
            runId,
            logStage,
            candidateHash,
            commitHash,
            actor,
            notes
        ) {} catch {}
        // ↑ Silent catch: the verification result is already stored
        //   on-chain and emitted as an event. A logger hiccup must
        //   never block or revert the verification itself.

        // ── 6. Return result to blockchain-logger.js ──
        return (passed, verificationId);
    }

    // ─────────────────────────────────────────────
    //  Read functions
    // ─────────────────────────────────────────────

    /**
     * @notice Read-only integrity check — does NOT store a record or
     *         emit events. Use for off-chain checks or dashboard previews.
     *
     * @param pipelineId     The pipeline to check.
     * @param candidateHash  The hash to test.
     * @return               True if the hash matches the approved hash.
     */
    function checkOnly(
        uint256 pipelineId,
        bytes32 candidateHash
    ) external view returns (bool) {
        return registry.verifyHash(pipelineId, candidateHash);
    }

    /**
     * @notice Fetch a stored VerificationRecord by its ID.
     */
    function getVerification(uint256 verificationId)
        external
        view
        returns (VerificationRecord memory)
    {
        require(
            verificationId > 0 && verificationId <= verificationCount,
            "Verifier: record not found"
        );
        return verifications[verificationId];
    }

    /**
     * @notice Get all verificationIds for a given pipeline.
     */
    function getVerificationsByPipeline(uint256 pipelineId)
        external
        view
        returns (uint256[] memory)
    {
        return verificationsByPipeline[pipelineId];
    }

    /**
     * @notice Quick summary stats for the dashboard header.
     * @return total    Total verifications performed.
     * @return failures Total failed verifications (tamper detections).
     * @return passes   Total passed verifications.
     */
    function getStats()
        external
        view
        returns (uint256 total, uint256 failures, uint256 passes)
    {
        total    = verificationCount;
        failures = failureCount;
        passes   = verificationCount - failureCount;
    }

    /**
     * @notice Transfer ownership to a new admin.
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Verifier: zero address");
        owner = newOwner;
    }
}
