// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title  PipelineRegistry
 * @notice Stores and manages approved pipeline configuration hashes.
 *         Only the contract owner (the project admin) can register or
 *         revoke approved hashes. The GitHub Actions logger queries
 *         this contract to confirm a pipeline config is legitimate
 *         before allowing a deployment to proceed.
 *
 * @dev    Deployed once to Sepolia testnet. Address stored in .env
 *         and loaded by logger/config.js.
 */
contract PipelineRegistry {

    // ─────────────────────────────────────────────
    //  State variables
    // ─────────────────────────────────────────────

    /// @notice Address that deployed this contract — the only account
    ///         allowed to register or revoke pipeline configs.
    address public owner;

    /// @notice Human-readable name for this registry entry, e.g. "main-pipeline"
    ///         keyed by pipeline ID.
    mapping(uint256 => string) public pipelineNames;

    /// @notice The SHA-256 hash of the approved .github/workflows/pipeline.yml
    ///         for each registered pipeline ID.
    ///         Stored as bytes32 for gas efficiency.
    mapping(uint256 => bytes32) public approvedHashes;

    /// @notice Tracks whether a pipeline ID has been registered.
    mapping(uint256 => bool) public isRegistered;

    /// @notice Tracks whether a pipeline ID has been revoked (soft-delete).
    mapping(uint256 => bool) public isRevoked;

    /// @notice Auto-incrementing ID counter for pipelines.
    uint256 public pipelineCount;

    // ─────────────────────────────────────────────
    //  Events
    // ─────────────────────────────────────────────

    /**
     * @notice Emitted when a new pipeline config is registered.
     * @param pipelineId  The unique ID assigned to this pipeline.
     * @param name        Human-readable label for the pipeline.
     * @param configHash  SHA-256 hash of the approved workflow YAML file.
     * @param registeredBy  The address that performed the registration.
     * @param timestamp   Block timestamp of registration.
     */
    event PipelineRegistered(
        uint256 indexed pipelineId,
        string  name,
        bytes32 configHash,
        address indexed registeredBy,
        uint256 timestamp
    );

    /**
     * @notice Emitted when an existing pipeline's approved hash is updated.
     * @param pipelineId  The pipeline being updated.
     * @param oldHash     The previous approved hash (for audit trail).
     * @param newHash     The new approved hash.
     * @param updatedBy   Address that performed the update.
     * @param timestamp   Block timestamp of update.
     */
    event PipelineHashUpdated(
        uint256 indexed pipelineId,
        bytes32 oldHash,
        bytes32 newHash,
        address indexed updatedBy,
        uint256 timestamp
    );

    /**
     * @notice Emitted when a pipeline is revoked (deactivated).
     * @param pipelineId  The pipeline being revoked.
     * @param revokedBy   Address that performed the revocation.
     * @param timestamp   Block timestamp of revocation.
     */
    event PipelineRevoked(
        uint256 indexed pipelineId,
        address indexed revokedBy,
        uint256 timestamp
    );

    // ─────────────────────────────────────────────
    //  Modifiers
    // ─────────────────────────────────────────────

    /// @dev Restricts a function to the contract owner only.
    modifier onlyOwner() {
        require(msg.sender == owner, "PipelineRegistry: caller is not the owner");
        _;
    }

    /// @dev Ensures the given pipeline ID has been registered.
    modifier pipelineExists(uint256 pipelineId) {
        require(isRegistered[pipelineId], "PipelineRegistry: pipeline not found");
        _;
    }

    /// @dev Ensures the given pipeline ID has NOT been revoked.
    modifier notRevoked(uint256 pipelineId) {
        require(!isRevoked[pipelineId], "PipelineRegistry: pipeline is revoked");
        _;
    }

    // ─────────────────────────────────────────────
    //  Constructor
    // ─────────────────────────────────────────────

    /**
     * @notice Sets the deploying address as the contract owner.
     */
    constructor() {
        owner = msg.sender;
    }

    // ─────────────────────────────────────────────
    //  Write functions (owner only)
    // ─────────────────────────────────────────────

    /**
     * @notice Register a new pipeline with its approved config hash.
     * @param name        A short label, e.g. "main-branch-pipeline".
     * @param configHash  SHA-256 hash of the workflow YAML, as bytes32.
     * @return pipelineId The unique ID assigned to the new pipeline.
     *
     * @dev   The caller should compute the SHA-256 hash off-chain
     *        (in hash-generator.js) and pass it as a bytes32 value.
     *        Example from JS:
     *          const hash = ethers.utils.sha256(fileBuffer);  // "0x..."
     */
    function registerPipeline(
        string calldata name,
        bytes32 configHash
    ) external onlyOwner returns (uint256 pipelineId) {
        require(bytes(name).length > 0,       "PipelineRegistry: name cannot be empty");
        require(configHash != bytes32(0),     "PipelineRegistry: hash cannot be zero");

        pipelineId = ++pipelineCount;

        pipelineNames[pipelineId]  = name;
        approvedHashes[pipelineId] = configHash;
        isRegistered[pipelineId]   = true;
        isRevoked[pipelineId]      = false;

        emit PipelineRegistered(
            pipelineId,
            name,
            configHash,
            msg.sender,
            block.timestamp
        );
    }

    /**
     * @notice Update the approved hash for an existing pipeline.
     *         Use this when you intentionally change your workflow YAML
     *         and want to re-approve the new version.
     * @param pipelineId  The pipeline to update.
     * @param newHash     The SHA-256 hash of the newly approved YAML.
     */
    function updateApprovedHash(
        uint256 pipelineId,
        bytes32 newHash
    )
        external
        onlyOwner
        pipelineExists(pipelineId)
        notRevoked(pipelineId)
    {
        require(newHash != bytes32(0), "PipelineRegistry: hash cannot be zero");

        bytes32 oldHash = approvedHashes[pipelineId];
        approvedHashes[pipelineId] = newHash;

        emit PipelineHashUpdated(
            pipelineId,
            oldHash,
            newHash,
            msg.sender,
            block.timestamp
        );
    }

    /**
     * @notice Revoke a pipeline, preventing it from passing verification.
     *         This is a soft-delete — the pipeline history is preserved
     *         on-chain for audit purposes.
     * @param pipelineId  The pipeline to revoke.
     */
    function revokePipeline(
        uint256 pipelineId
    )
        external
        onlyOwner
        pipelineExists(pipelineId)
        notRevoked(pipelineId)
    {
        isRevoked[pipelineId] = true;

        emit PipelineRevoked(
            pipelineId,
            msg.sender,
            block.timestamp
        );
    }

    // ─────────────────────────────────────────────
    //  Read functions (public — anyone can verify)
    // ─────────────────────────────────────────────

    /**
     * @notice Check whether a given hash matches the approved hash
     *         for a pipeline. This is the core integrity check called
     *         by Verifier.sol and blockchain-logger.js.
     *
     * @param pipelineId    The pipeline to check against.
     * @param candidateHash The SHA-256 hash of the currently running
     *                      workflow YAML, computed at runtime by the CI job.
     * @return isValid      True only if the pipeline is registered, not
     *                      revoked, and the hash matches exactly.
     */
    function verifyHash(
        uint256 pipelineId,
        bytes32 candidateHash
    ) external view returns (bool isValid) {
        if (!isRegistered[pipelineId]) return false;
        if ( isRevoked[pipelineId])   return false;

        return approvedHashes[pipelineId] == candidateHash;
    }

    /**
     * @notice Fetch all stored details for a pipeline in one call.
     * @param pipelineId  The pipeline to query.
     * @return name         Human-readable label.
     * @return configHash   The currently approved hash.
     * @return registered   Whether it has been registered.
     * @return revoked      Whether it has been revoked.
     */
    function getPipeline(uint256 pipelineId)
        external
        view
        returns (
            string  memory name,
            bytes32        configHash,
            bool           registered,
            bool           revoked
        )
    {
        return (
            pipelineNames[pipelineId],
            approvedHashes[pipelineId],
            isRegistered[pipelineId],
            isRevoked[pipelineId]
        );
    }

    /**
     * @notice Transfer ownership of the registry to a new admin address.
     * @param newOwner  Must be a non-zero address.
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "PipelineRegistry: new owner is zero address");
        owner = newOwner;
    }
}
