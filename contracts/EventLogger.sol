// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title  EventLogger
 * @notice Records every CI/CD pipeline event immutably on-chain.
 *         Called by blockchain-logger.js at each stage of the
 *         GitHub Actions workflow: build started, tests passed,
 *         integrity verified, deployment triggered, etc.
 *
 * @dev    Works alongside PipelineRegistry.sol. Each log entry
 *         references a pipelineId registered there.
 *         The React dashboard reads this contract's emitted events
 *         to render the full audit trail.
 */
contract EventLogger {

    // ─────────────────────────────────────────────
    //  Enums
    // ─────────────────────────────────────────────

    /**
     * @notice The stage of the CI/CD pipeline that triggered this log entry.
     *         Stored as uint8 on-chain for gas efficiency.
     *
     *   PIPELINE_TRIGGERED  — a git push or manual trigger started the pipeline
     *   BUILD_STARTED       — the build job began
     *   BUILD_SUCCESS       — build completed without errors
     *   BUILD_FAILED        — build failed
     *   TESTS_STARTED       — test suite started running
     *   TESTS_PASSED        — all tests passed
     *   TESTS_FAILED        — one or more tests failed
     *   INTEGRITY_VERIFIED  — hash matched the approved hash in PipelineRegistry
     *   INTEGRITY_FAILED    — hash mismatch detected — possible tampering
     *   DEPLOY_STARTED      — deployment job began
     *   DEPLOY_SUCCESS      — deployment completed successfully
     *   DEPLOY_FAILED       — deployment failed
     */
    enum Stage {
        PIPELINE_TRIGGERED,
        BUILD_STARTED,
        BUILD_SUCCESS,
        BUILD_FAILED,
        TESTS_STARTED,
        TESTS_PASSED,
        TESTS_FAILED,
        INTEGRITY_VERIFIED,
        INTEGRITY_FAILED,
        DEPLOY_STARTED,
        DEPLOY_SUCCESS,
        DEPLOY_FAILED
    }

    // ─────────────────────────────────────────────
    //  Structs
    // ─────────────────────────────────────────────

    /**
     * @notice A single on-chain log entry for one CI/CD event.
     * @param logId         Auto-incremented unique ID for this log entry.
     * @param pipelineId    References the pipeline in PipelineRegistry.
     * @param runId         The GitHub Actions run ID (from ${{ github.run_id }}).
     * @param stage         Which pipeline stage this entry represents.
     * @param configHash    SHA-256 hash of the workflow YAML at the time
     *                      this event was logged. Allows post-hoc comparison.
     * @param commitHash    The git commit SHA that triggered this run.
     * @param actor         GitHub username that triggered the pipeline
     *                      (stored as a string, not an address).
     * @param notes         Optional free-text field — e.g. error message on failure,
     *                      environment name on deploy, test count on pass.
     * @param loggedBy      The Ethereum address of the wallet that sent this tx
     *                      (your GitHub Actions bot wallet).
     * @param timestamp     Block timestamp when this entry was recorded.
     */
    struct LogEntry {
        uint256 logId;
        uint256 pipelineId;
        uint256 runId;
        Stage   stage;
        bytes32 configHash;
        string  commitHash;
        string  actor;
        string  notes;
        address loggedBy;
        uint256 timestamp;
    }

    // ─────────────────────────────────────────────
    //  State variables
    // ─────────────────────────────────────────────

    /// @notice Address that deployed this contract.
    address public owner;

    /// @notice Addresses permitted to write log entries.
    ///         The GitHub Actions bot wallet must be authorised here.
    mapping(address => bool) public authorisedLoggers;

    /// @notice All log entries, indexed by logId (1-based).
    mapping(uint256 => LogEntry) public logEntries;

    /// @notice All logIds belonging to a given pipelineId.
    ///         Used by the dashboard to fetch logs per pipeline.
    mapping(uint256 => uint256[]) public logsByPipeline;

    /// @notice All logIds belonging to a given GitHub Actions runId.
    ///         Used to reconstruct the full timeline of a single run.
    mapping(uint256 => uint256[]) public logsByRun;

    /// @notice Total number of log entries recorded.
    uint256 public logCount;

    // ─────────────────────────────────────────────
    //  Events
    // ─────────────────────────────────────────────

    /**
     * @notice Emitted on every CI/CD event logged.
     *         The React dashboard listens for this event to update
     *         the audit trail in real time.
     *
     * @param logId       Unique ID of this entry.
     * @param pipelineId  Which pipeline this belongs to.
     * @param runId       GitHub Actions run ID.
     * @param stage       Which stage was reached.
     * @param configHash  Workflow YAML hash at time of logging.
     * @param commitHash  Git commit SHA.
     * @param actor       GitHub username that triggered the run.
     * @param loggedBy    Bot wallet address that sent the transaction.
     * @param timestamp   Block timestamp.
     */
    event CiCdEventLogged(
        uint256 indexed logId,
        uint256 indexed pipelineId,
        uint256 indexed runId,
        Stage           stage,
        bytes32         configHash,
        string          commitHash,
        string          actor,
        address         loggedBy,
        uint256         timestamp
    );

    /// @notice Emitted when a logger address is authorised.
    event LoggerAuthorised(address indexed logger, uint256 timestamp);

    /// @notice Emitted when a logger address is revoked.
    event LoggerRevoked(address indexed logger, uint256 timestamp);

    // ─────────────────────────────────────────────
    //  Modifiers
    // ─────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "EventLogger: caller is not the owner");
        _;
    }

    modifier onlyAuthorised() {
        require(
            authorisedLoggers[msg.sender] || msg.sender == owner,
            "EventLogger: caller is not an authorised logger"
        );
        _;
    }

    // ─────────────────────────────────────────────
    //  Constructor
    // ─────────────────────────────────────────────

    /**
     * @notice Deploys the contract, sets the owner, and authorises
     *         the deployer as the first logger.
     */
    constructor() {
        owner = msg.sender;
        authorisedLoggers[msg.sender] = true;
        emit LoggerAuthorised(msg.sender, block.timestamp);
    }

    // ─────────────────────────────────────────────
    //  Access control (owner only)
    // ─────────────────────────────────────────────

    /**
     * @notice Authorise a wallet address to write log entries.
     *         Call this with your GitHub Actions bot wallet address
     *         after deployment.
     * @param logger  The address to authorise.
     */
    function authoriseLogger(address logger) external onlyOwner {
        require(logger != address(0), "EventLogger: zero address");
        authorisedLoggers[logger] = true;
        emit LoggerAuthorised(logger, block.timestamp);
    }

    /**
     * @notice Revoke logging permission from an address.
     * @param logger  The address to revoke.
     */
    function revokeLogger(address logger) external onlyOwner {
        authorisedLoggers[logger] = false;
        emit LoggerRevoked(logger, block.timestamp);
    }

    // ─────────────────────────────────────────────
    //  Write function
    // ─────────────────────────────────────────────

    /**
     * @notice Record a CI/CD pipeline event on-chain.
     *         Called by blockchain-logger.js from GitHub Actions.
     *
     * @param pipelineId  ID from PipelineRegistry for this pipeline.
     * @param runId       GitHub Actions ${{ github.run_id }}.
     * @param stage       The Stage enum value for this event.
     * @param configHash  SHA-256 hash of the workflow YAML (bytes32).
     * @param commitHash  Git commit SHA, e.g. "a1b2c3d4...".
     * @param actor       GitHub username, e.g. "octocat".
     * @param notes       Optional context string.
     * @return logId      The ID assigned to this new log entry.
     */
    function logEvent(
        uint256 pipelineId,
        uint256 runId,
        Stage   stage,
        bytes32 configHash,
        string  calldata commitHash,
        string  calldata actor,
        string  calldata notes
    ) external onlyAuthorised returns (uint256 logId) {
        require(pipelineId > 0,              "EventLogger: invalid pipelineId");
        require(runId > 0,                   "EventLogger: invalid runId");
        require(bytes(commitHash).length > 0,"EventLogger: commitHash required");
        require(bytes(actor).length > 0,     "EventLogger: actor required");

        logId = ++logCount;

        logEntries[logId] = LogEntry({
            logId:       logId,
            pipelineId:  pipelineId,
            runId:       runId,
            stage:       stage,
            configHash:  configHash,
            commitHash:  commitHash,
            actor:       actor,
            notes:       notes,
            loggedBy:    msg.sender,
            timestamp:   block.timestamp
        });

        logsByPipeline[pipelineId].push(logId);
        logsByRun[runId].push(logId);

        emit CiCdEventLogged(
            logId,
            pipelineId,
            runId,
            stage,
            configHash,
            commitHash,
            actor,
            msg.sender,
            block.timestamp
        );
    }

    // ─────────────────────────────────────────────
    //  Read functions
    // ─────────────────────────────────────────────

    /**
     * @notice Fetch a single log entry by its ID.
     * @param logId  The log entry to retrieve.
     */
    function getLogEntry(uint256 logId)
        external
        view
        returns (LogEntry memory)
    {
        require(logId > 0 && logId <= logCount, "EventLogger: log not found");
        return logEntries[logId];
    }

    /**
     * @notice Get all log entry IDs for a given pipeline.
     *         Use these IDs with getLogEntry() to reconstruct the full history.
     * @param pipelineId  The pipeline to query.
     */
    function getLogIdsByPipeline(uint256 pipelineId)
        external
        view
        returns (uint256[] memory)
    {
        return logsByPipeline[pipelineId];
    }

    /**
     * @notice Get all log entry IDs for a specific GitHub Actions run.
     *         Lets the dashboard show the complete timeline of one run.
     * @param runId  The GitHub Actions run ID.
     */
    function getLogIdsByRun(uint256 runId)
        external
        view
        returns (uint256[] memory)
    {
        return logsByRun[runId];
    }

    /**
     * @notice Convenience: get the most recent N log entries across
     *         all pipelines. Useful for the dashboard's "latest events" feed.
     * @param count  How many recent entries to return (max 50).
     */
    function getRecentLogs(uint256 count)
        external
        view
        returns (LogEntry[] memory entries)
    {
        if (count > 50) count = 50;
        if (count > logCount) count = logCount;

        entries = new LogEntry[](count);
        for (uint256 i = 0; i < count; i++) {
            entries[i] = logEntries[logCount - i];
        }
    }

    /**
     * @notice Transfer ownership to a new admin.
     * @param newOwner  Non-zero address of the new owner.
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "EventLogger: zero address");
        owner = newOwner;
    }
}
