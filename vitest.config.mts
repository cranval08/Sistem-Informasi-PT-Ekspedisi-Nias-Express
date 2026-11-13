import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    // Inisialisasi PGlite + migrasi butuh beberapa detik per berkas.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
