import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Integracioni testovi čitaju 133k redova kroz stranice od po 1000,
    // što je preko 130 zahteva po testu. 30 s ne bi bilo dovoljno.
    testTimeout: 120_000,
  },
});
