import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // A relative base keeps the same artifact valid at both the domain root and
  // any GitHub Pages repository subpath.
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist-github",
    emptyOutDir: true,
    sourcemap: false,
    cssCodeSplit: true,
    target: "es2020",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) {
            return "react";
          }
        },
      },
    },
  },
});
