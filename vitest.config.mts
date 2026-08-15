import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  // Rute u `app/` uvoze preko `@/`, kako Next podrazumeva. Bez ovog aliasa
  // vitest ne može da uveze rutu, pa se `/api/search` ne bi mogao testirati.
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // Integracioni testovi čitaju 133k redova kroz stranice od po 1000,
    // što je preko 130 zahteva po testu. 30 s ne bi bilo dovoljno.
    testTimeout: 120_000,
  },
});
