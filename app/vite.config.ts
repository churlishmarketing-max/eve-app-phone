import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // TEMP-VERIFY-PROXY
    proxy: {
      "/brain": {
        target: "http://192.168.0.4:8787",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/brain/, ""),
      },
    },
  },
});
