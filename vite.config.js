import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // In dev, forward /api/notion → a local Express shim that adds the token.
      // In production, Vercel's api/notion.js serverless function handles it.
      "/api/notion": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
