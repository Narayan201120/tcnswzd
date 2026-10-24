import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Dev server proxies API calls to the FastAPI backend on port 8000 so the
// frontend and backend run on one origin and need no CORS. In production the
// static frontend and the serverless API share the same origin under /api.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    proxy: {
      "/api": { target: "http://localhost:8000", changeOrigin: true },
      "/health": { target: "http://localhost:8000", changeOrigin: true },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
  },
});
