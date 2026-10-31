import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Mirrors the "@/*" path in tsconfig.json so component tests can use it.
      "@": fileURLToPath(new URL("./", import.meta.url)),
      // The server-only package resolves to an empty module only under the
      // "react-server" condition, which Next.js sets; its default export throws.
      // Vitest runs without that condition, so tests swap in an empty module.
      "server-only": fileURLToPath(new URL("./test/server-only-stub.ts", import.meta.url)),
    },
  },
});
