import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    rollupOptions: { input: { main: "index.html", popup: "popup.html" } },
  },
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  test: { testTimeout: 20_000 },
});
