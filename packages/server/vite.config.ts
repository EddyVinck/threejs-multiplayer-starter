import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: true,
    outDir: "dist",
    sourcemap: true,
    ssr: "src/index.ts",
    target: "es2022",
    rollupOptions: {
      output: {
        entryFileNames: "index.js"
      }
    }
  },
  ssr: {
    noExternal: ["@gamejam/shared"]
  }
});
