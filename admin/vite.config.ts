import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/admin": {
        target: process.env.VITE_GATEWAY_URL ?? "http://localhost:3100",
        changeOrigin: true,
      },
    },
  },
});
