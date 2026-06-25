import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Unit-Test-Setup (Slice „Testing-Fundament").
 *
 * Bewusst NUR Unit-Tests ohne DB/Payload: schnelle, deterministische
 * Absicherung der reinen Logik (z. B. lib/paths-progress-compute.ts). Tests,
 * die DB/Payload brauchen, sind ein späterer Schritt (eigenes Setup mit
 * Test-Postgres). `.next` und das vendored `tooling/` sind ausgeschlossen,
 * damit Source-Kopien dort nicht doppelt matchen.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**", "tooling/**", "dist/**"],
  },
  resolve: {
    alias: {
      "@": dirname,
    },
  },
});
