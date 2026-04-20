// logger/hash-generator.js
//
// Computes a SHA-256 hash of one or more files and returns it as a
// bytes32-compatible hex string (0x-prefixed, 64 hex chars).
//
// Used by blockchain-logger.js to fingerprint the workflow YAML file
// at runtime. The resulting hash is what gets compared against the
// approved hash stored in PipelineRegistry on-chain.
//
// Usage (standalone):
//   node logger/hash-generator.js .github/workflows/pipeline.yml

const fs     = require("fs");
const path   = require("path");
const crypto = require("crypto");

// ─── Core hash function ───────────────────────────────────────────────────────

/**
 * Compute the SHA-256 hash of a single file.
 *
 * @param   {string} filePath  Absolute or relative path to the file.
 * @returns {string}           0x-prefixed 64-char hex string (bytes32 compatible).
 * @throws  {Error}            If the file does not exist or cannot be read.
 */
function hashFile(filePath) {
  const absPath = path.resolve(filePath);

  if (!fs.existsSync(absPath)) {
    throw new Error(`hashFile: file not found — ${absPath}`);
  }

  const buffer = fs.readFileSync(absPath);
  const digest = crypto.createHash("sha256").update(buffer).digest("hex");
  return "0x" + digest;
}

/**
 * Compute a single combined SHA-256 hash over multiple files.
 * Files are hashed in the order provided — order matters.
 *
 * Useful if you want to fingerprint the entire .github/workflows/
 * directory rather than just one file.
 *
 * @param   {string[]} filePaths  Array of file paths to include.
 * @returns {string}              0x-prefixed 64-char hex string.
 */
function hashFiles(filePaths) {
  if (!filePaths || filePaths.length === 0) {
    throw new Error("hashFiles: at least one file path is required");
  }

  const combined = crypto.createHash("sha256");

  for (const filePath of filePaths) {
    const absPath = path.resolve(filePath);

    if (!fs.existsSync(absPath)) {
      throw new Error(`hashFiles: file not found — ${absPath}`);
    }

    const buffer = fs.readFileSync(absPath);
    // Hash each file's content into the combined digest
    combined.update(buffer);
    // Also mix in the filename so renaming a file changes the hash
    combined.update(path.basename(absPath));
  }

  return "0x" + combined.digest("hex");
}

/**
 * Validate that a string is a well-formed bytes32 hex value.
 * Used to sanity-check hashes before sending them on-chain.
 *
 * @param   {string} hash  The hash string to validate.
 * @returns {boolean}      True if valid.
 */
function isValidBytes32(hash) {
  return typeof hash === "string" &&
    /^0x[0-9a-fA-F]{64}$/.test(hash);
}

// ─── CLI usage ────────────────────────────────────────────────────────────────

// Allow running directly: node logger/hash-generator.js <file1> [file2 ...]
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("Usage: node logger/hash-generator.js <file> [file2 ...]");
    process.exit(1);
  }

  try {
    const hash = args.length === 1 ? hashFile(args[0]) : hashFiles(args);
    console.log(hash);
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { hashFile, hashFiles, isValidBytes32 };
