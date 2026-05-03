// src/index.js
//
// Main entry point for oprico-chainguard-logger.
// Exports all public functions for programmatic use.

"use strict";

const { logEvent, Stage }    = require("./logger");
const { verifyIntegrity }    = require("./verifier");
const { hashFile, hashFiles, isValidBytes32 } = require("./hasher");
const { loadConfig }         = require("./config");

module.exports = {
  // Core functions
  logEvent,
  verifyIntegrity,

  // Hashing utilities
  hashFile,
  hashFiles,
  isValidBytes32,

  // Config loader
  loadConfig,

  // Stage enum
  Stage,
};
