import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@features": fileURLToPath(new URL("./src/features", import.meta.url)),
      "@node-agent": fileURLToPath(
        new URL("./src/features/node-agent", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    globals: false,
  },
});
