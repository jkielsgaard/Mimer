#!/usr/bin/env node
// Generates a test vault: node scripts/gen-vault.mjs <target-folder> [note-count]
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const [target, countArg] = process.argv.slice(2);
if (!target) {
  console.error("Usage: node scripts/gen-vault.mjs <target-folder> [note-count=1000]");
  process.exit(1);
}
const count = Number(countArg ?? 1000);
const root = resolve(target);
const words = (
  "firewall policy password network server backup restore audit risk control access encryption " +
  "incident response vendor asset inventory training review compliance patch monitoring logging"
).split(" ");
const pick = (i, n) =>
  Array.from({ length: n }, (_, k) => words[(i * 7 + k * 13) % words.length]).join(" ");

for (let i = 0; i < count; i++) {
  const folder = join(root, `Topic ${i % 25}`, `Area ${i % 4}`);
  mkdirSync(folder, { recursive: true });
  const next = (i + 1) % count;
  const body = [
    "---",
    `tags: [${words[i % words.length]}, batch${i % 10}]`,
    "---",
    `# Note ${i}: ${pick(i, 3)}`,
    "",
    `${pick(i, 30)}. #tag${i % 12}`,
    "",
    `See [[Note ${next}]] and [[Note ${(i + 7) % count}|related]].`,
    "",
    `${pick(i + 3, 60)}`,
    "",
  ].join("\n");
  // The file name matches the link target "Note <n>".
  writeFileSync(join(folder, `Note ${i}.md`), body);
}
console.log(`Created ${count} notes in ${root}`);
