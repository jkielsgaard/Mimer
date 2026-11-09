// DRAFT, not wired into any command yet (see docs/plans/review-2026-11.md, task 8).
// Takes the ten pictures in docs/screenshots/ (README and Microsoft Store). Start `pnpm dev` first.
import { launch, rail } from "./harness.mjs";

const out = new URL("../../docs/screenshots/", import.meta.url).pathname;
const executablePath = process.env.CHROMIUM || undefined;

async function run(theme, steps) {
  const { browser, page } = await launch({ theme, executablePath });
  await page.goto("http://localhost:1420/");
  await page.waitForTimeout(1500);
  const shot = async (name) => {
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${out}${name}.png` });
  };
  try {
    await steps(page, shot);
  } finally {
    await browser.close();
  }
}

await run("light", async (page, shot) => {
  await rail(page, "Start");
  await shot("start-page");
  await rail(page, "Files");
  await page
    .getByRole("button", { name: /VPN rollout plan.*Work/ })
    .first()
    .click();
  await shot("note-editor");
  await page.getByRole("button", { name: "More for this note" }).click();
  await page.getByRole("menuitem", { name: "Tags…" }).click();
  await shot("tags");
  await page.keyboard.press("Escape");
  await rail(page, "Tasks");
  await shot("tasks");
  await page.getByRole("button", { name: /Focus/ }).nth(1).click();
  await shot("focus");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  await rail(page, "Tasks");
  await page.getByText("Send the offer to Acme").first().click();
  await shot("task-page");
  await rail(page, "Meetings");
  await page.getByRole("button", { name: /Start meeting/ }).click();
  await shot("meeting");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  await rail(page, "Ideas");
  await shot("ideas");
  await page
    .getByRole("button", { name: /Settings/ })
    .first()
    .click();
  await shot("themes");
});
await run("midnight", async (page, shot) => {
  await rail(page, "Start");
  await shot("midnight");
});
