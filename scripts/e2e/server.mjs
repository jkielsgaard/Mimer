// Starts Vite (the real frontend) on port 1420 and waits until it answers.
import { spawn } from "node:child_process";

const URL = "http://localhost:1420/";

async function answers() {
  try {
    const r = await fetch(URL);
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * Starts `vite` on 1420 (it fails if the port is taken: `--strictPort`) and resolves with a
 * function that stops it. `pnpm` starts `vite` as a child of its own, so the child gets a process
 * group and the whole group is stopped (stopping only `pnpm` left `vite` running and the port
 * taken). It is stopped by that group, never by a pattern match, which would also stop the shell
 * that runs this.
 */
export async function startServer() {
  const child = spawn("pnpm", ["exec", "vite", "--port", "1420", "--strictPort"], {
    stdio: "ignore",
    detached: true,
  });
  const stop = () => {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      /* it has stopped already */
    }
  };
  let exited = false;
  child.on("exit", () => {
    exited = true;
  });
  for (let i = 0; i < 120; i++) {
    if (exited) throw new Error("vite stopped at once (is port 1420 already in use?)");
    if (await answers())
      return () => {
        if (!exited) stop();
      };
    await new Promise((r) => setTimeout(r, 500));
  }
  stop();
  throw new Error("vite did not answer on " + URL + " in 60 seconds");
}
