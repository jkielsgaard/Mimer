#!/usr/bin/env node
// The areas of Mimer (docs/AREAS.md), used to see where a change lands.
//
//   node scripts/areas.mjs check                 every file in src/ and src-tauri/src/ has an area
//   node scripts/areas.mjs report [base] [--plan "Tasks,Shared UI"]
//                                                the changed files since `base` (default main),
//                                                committed or not, grouped by area; files outside
//                                                the planned areas are marked
//   node scripts/areas.mjs of <path>…            the area of each path

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();

/** The rows of the table under "## Map": [{ name, kind, paths }]. */
function readAreas() {
  const text = readFileSync(`${root}/docs/AREAS.md`, "utf8");
  const map = text.split("## Map")[1] ?? "";
  const areas = [];
  for (const line of map.split("\n")) {
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 5 || cells[1] === "Area" || cells[1].startsWith("---")) continue;
    const paths = [...cells[3].matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    areas.push({ name: cells[1], kind: cells[2], paths });
  }
  return areas;
}

/** The area of a path: the one with the longest matching path. */
function areaOf(areas, path) {
  let best = null;
  let length = -1;
  for (const a of areas) {
    for (const p of a.paths) {
      if (path.startsWith(p) && p.length > length) {
        best = a;
        length = p.length;
      }
    }
  }
  return best;
}

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter((l) => l.trim() !== "");
}

const [command = "report", ...rest] = process.argv.slice(2);
const areas = readAreas();

if (command === "check") {
  const files = git([
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "src",
    "src-tauri/src",
  ]);
  const missing = files.filter((f) => areaOf(areas, f) === null);
  if (missing.length > 0) {
    console.error(`These files belong to no area in docs/AREAS.md:\n  ${missing.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`Every one of ${String(files.length)} files belongs to an area.`);
} else if (command === "of") {
  for (const p of rest) console.log(`${p}: ${areaOf(areas, p)?.name ?? "no area"}`);
} else if (command === "report") {
  const planAt = rest.indexOf("--plan");
  const plan =
    planAt === -1
      ? null
      : new Set(
          (rest[planAt + 1] ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        );
  const base = rest.find((r, i) => !r.startsWith("--") && rest[i - 1] !== "--plan") ?? "main";
  const changed = new Map();
  const add = (status, path) => changed.set(path, status);
  for (const l of git(["diff", "--name-status", `${base}...HEAD`])) {
    const [s, ...p] = l.split("\t");
    add(s[0], p[p.length - 1]);
  }
  for (const l of git(["status", "--porcelain"])) {
    const s = l.slice(0, 2).trim() || "M";
    const path = l.slice(3).split(" -> ").pop();
    add(s === "??" ? "A" : s[0], path);
  }
  if (changed.size === 0) {
    console.log(`No changes since ${base}.`);
    process.exit(0);
  }
  const byArea = new Map();
  for (const [path, status] of changed) {
    const name = areaOf(areas, path)?.name ?? "No area";
    byArea.set(name, [...(byArea.get(name) ?? []), { path, status }]);
  }
  const words = { A: "new", M: "changed", D: "deleted", R: "renamed" };
  console.log(
    `Change report since ${base}: ${String(changed.size)} files in ${String(byArea.size)} areas\n`,
  );
  for (const a of [...areas.map((x) => x.name), "No area"]) {
    const files = byArea.get(a);
    if (!files) continue;
    const outside = plan !== null && !plan.has(a) ? "   <- NOT IN THE PLAN" : "";
    console.log(`${a} (${String(files.length)})${outside}`);
    for (const f of files.sort((x, y) => x.path.localeCompare(y.path))) {
      console.log(`  ${(words[f.status] ?? f.status).padEnd(8)} ${f.path}`);
    }
  }
} else {
  console.error(`Unknown command: ${command}`);
  process.exit(2);
}
