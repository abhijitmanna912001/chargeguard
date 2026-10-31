import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // The server-only package resolves to an empty module only under the
      // "react-server" condition, which Next.js sets; its default export throws.
      // Vitest runs without that condition, so tests swap in an empty module.
      "server-only": fileURLToPath(new URL("./test/server-only-stub.ts", import.meta.url)),
    },
  },
});
