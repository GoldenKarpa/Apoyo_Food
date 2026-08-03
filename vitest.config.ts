import path from "path";
import { defineConfig } from "vitest/config";

// Mirrors portal-web's vitest.config.ts (same pinned vitest version, same
// shape) — the ecosystem's one precedent for a test harness in this stack.
export default defineConfig({
  resolve: {
    // Mirrors tsconfig.json's "@/*" path mapping — vitest doesn't read tsconfig
    // paths on its own.
    alias: { "@": path.resolve(__dirname) },
  },
  test: {
    environment: "node",
  },
});
