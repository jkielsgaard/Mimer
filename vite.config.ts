import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

const host = process.env.TAURI_DEV_HOST;

const pkg = JSON.parse(readFileSync(path.resolve(import.meta.dirname, "package.json"), "utf8")) as {
  version: string;
};

/**
 * SemVer build metadata for this build: the short commit SHA, plus `dirty` when the working tree
 * has uncommitted changes (for example `63947f4.dirty`). Empty outside a Git checkout.
 */
function gitBuild(): string {
  const run = (cmd: string): string =>
    execSync(cmd, { cwd: import.meta.dirname, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  try {
    const sha = run("git rev-parse --short HEAD");
    return run("git status --porcelain") === "" ? sha : `${sha}.dirty`;
  } catch {
    return "";
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_BUILD__: JSON.stringify(gitBuild()),
    __APP_BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host ?? false,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: { target: "es2022", chunkSizeWarningLimit: 1500 },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
