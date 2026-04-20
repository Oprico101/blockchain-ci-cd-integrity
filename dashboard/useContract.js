// dashboard/src/hooks/useContract.js
//
// Provides connected Ethers.js contract instances for all three
// smart contracts. Reads contract addresses and ABIs from environment
// variables (set in dashboard/.env) and the compiled Hardhat artifacts.
//
// Usage:
//   const { registry, logger, verifier, provider, error } = useContracts();

import { useState, useEffect } from "react";
import { ethers } from "ethers";

// ABIs — imported from Hardhat artifacts (run `npm run compile` first)
import PipelineRegistryABI from "../../../artifacts/contracts/PipelineRegistry.sol/PipelineRegistry.json";
import EventLoggerABI      from "../../../artifacts/contracts/EventLogger.sol/EventLogger.json";
import VerifierABI         from "../../../artifacts/contracts/Verifier.sol/Verifier.json";

const CONTRACT_ADDRESSES = {
  pipelineRegistry: import.meta.env.VITE_PIPELINE_REGISTRY_ADDRESS,
  eventLogger:      import.meta.env.VITE_EVENT_LOGGER_ADDRESS,
  verifier:         import.meta.env.VITE_VERIFIER_ADDRESS,
};

const RPC_URL = import.meta.env.VITE_SEPOLIA_RPC_URL;

/**
 * Returns read-only Ethers.js contract instances connected to Sepolia.
 * Uses a JsonRpcProvider (no wallet needed — read-only dashboard).
 */
export function useContracts() {
  const [contracts, setContracts] = useState({
    registry: null,
    logger:   null,
    verifier: null,
    provider: null,
    error:    null,
  });

  useEffect(() => {
    try {
      if (!RPC_URL) throw new Error("VITE_SEPOLIA_RPC_URL is not set in dashboard/.env");

      const missingAddresses = Object.entries(CONTRACT_ADDRESSES)
        .filter(([, addr]) => !addr)
        .map(([key]) => key);

      if (missingAddresses.length > 0) {
        throw new Error(`Missing contract addresses in .env: ${missingAddresses.join(", ")}`);
      }

      const provider = new ethers.JsonRpcProvider(RPC_URL);

      const registry = new ethers.Contract(
        CONTRACT_ADDRESSES.pipelineRegistry,
        PipelineRegistryABI.abi,
        provider
      );

      const logger = new ethers.Contract(
        CONTRACT_ADDRESSES.eventLogger,
        EventLoggerABI.abi,
        provider
      );

      const verifier = new ethers.Contract(
        CONTRACT_ADDRESSES.verifier,
        VerifierABI.abi,
        provider
      );

      setContracts({ registry, logger, verifier, provider, error: null });
    } catch (err) {
      setContracts(prev => ({ ...prev, error: err.message }));
    }
  }, []);

  return contracts;
}
