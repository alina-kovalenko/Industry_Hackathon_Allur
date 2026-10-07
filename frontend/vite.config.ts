import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/app/",
  server: {
    proxy: { "/api": "http://127.0.0.1:8001" },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/three/") || id.includes("/three-stdlib/"))
            return "three";
          if (id.includes("/recharts/") || id.includes("/d3-")) return "charts";
        },
      },
    },
  },
});
