// src/hasher.js
//
// SHA-256 file hashing utility.
// Returns a 0x-prefixed bytes32-compatible hex string.

"use strict";

const fs     = require("fs");
const path   = require("path");
const crypto = require("crypto");

/**
 * Hash a single file with SHA-256.
 * @param   {string} filePath  Path to the file.
 * @returns {string}           0x-prefixed 64-char hex string.
 */
function hashFile(filePath) {
  const abs = path.resolve(filePath);

  if (!fs.existsSync(abs)) {
    throw new Error(`[chainguard] File not found: ${abs}`);
  }

  const buffer = fs.readFileSync(abs);
  return "0x" + crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Hash multiple files into one combined digest.
 * @param   {string[]} filePaths  Array of file paths.
 * @returns {string}              0x-prefixed 64-char hex string.
 */
function hashFiles(filePaths) {
  if (!filePaths || filePaths.length === 0) {
    throw new Error("[chainguard] At least one file path is required");
  }

  const combined = crypto.createHash("sha256");

  for (const filePath of filePaths) {
    const abs = path.resolve(filePath);
    if (!fs.existsSync(abs)) {
      throw new Error(`[chainguard] File not found: ${abs}`);
    }
    combined.update(fs.readFileSync(abs));
    combined.update(path.basename(abs));
  }

  return "0x" + combined.digest("hex");
}

/**
 * Validate a bytes32 hex string.
 * @param   {string} hash
 * @returns {boolean}
 */
function isValidBytes32(hash) {
  return typeof hash === "string" && /^0x[0-9a-fA-F]{64}$/.test(hash);
}

module.exports = { hashFile, hashFiles, isValidBytes32 };
