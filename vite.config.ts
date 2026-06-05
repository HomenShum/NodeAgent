import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// NodeAgent dev/build config.
// The self-contained prototype lives at /nodeagent-v1.html (served from the repo
// root by Vite). The React demo app mounts from index.html -> src/app/main.tsx.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@features": fileURLToPath(new URL("./src/features", import.meta.url)),
      "@node-agent": fileURLToPath(
        new URL("./src/features/node-agent", import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
    open: false,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
