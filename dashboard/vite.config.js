// dashboard/vite.config.js

import { defineConfig } from "vite";
import react            from "@vitejs/plugin-react";
import path             from "path";

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      // Allows useContract.js to import from ../../../artifacts/...
      // relative to dashboard/src/hooks/ without path issues.
      "@artifacts": path.resolve(__dirname, "../artifacts"),
    },
  },

  server: {
    port: 5173,
    open: true,
  },
});
