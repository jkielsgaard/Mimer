// Smoke tests in a real (headless) browser: `pnpm e2e`. Starts the frontend, runs each check on a
// fresh page and exits with a non-zero code when one fails. See scripts/e2e/README.md.
import { launch, rail } from "./harness.mjs";
import { startServer } from "./server.mjs";

const executablePath = process.env.CHROMIUM || undefined;
const results = [];

/** Runs one check on a fresh page. A page error (`ERR …` in the log) fails it too. */
async function check(name, steps, { theme = "light", welcome = false } = {}) {
  const { browser, page, log } = await launch({
    theme,
    welcome,
    width: 1600,
    height: 900,
    executablePath,
  });
  try {
    await page.goto("http://localhost:1420/");
    await page.waitForTimeout(1200);
    await steps(page);
    const errors = log.filter((l) => l.startsWith("ERR"));
    if (errors.length > 0) throw new Error(errors[0]);
    results.push({ name, ok: true });
    console.log(`ok    ${name}`);
  } catch (e) {
    results.push({ name, ok: false });
    console.log(`FAIL  ${name}: ${String(e.message).split("\n")[0]}`);
  } finally {
    await browser.close();
  }
}

function expect(cond, what) {
  if (!cond) throw new Error(what);
}

/** Files → opens the demo note in the editor. */
async function openNote(page) {
  await rail(page, "Files");
  // The same name is in the left panel too; the last one is the row on the Notes page.
  await page
    .getByRole("button", { name: /VPN rollout plan.*Work/ })
    .last()
    .click();
  await page.getByRole("button", { name: "More for this note" }).waitFor();
}

const stop = await startServer();
try {
  await check("boots", async (page) => {
    await rail(page, "Start");
    await page.getByText("Welcome back").waitFor({ timeout: 5000 });
    expect(
      (await page.getByText("VPN rollout plan").count()) > 0,
      "no Continue card for the demo note",
    );
  });

  await check("note", async (page) => {
    await openNote(page);
    await page
      .getByRole("heading", { name: "VPN rollout plan" })
      .first()
      .waitFor({ timeout: 5000 });
    await page.locator(".cm-content").first().click();
    await page.keyboard.type(" smoke");
    expect(
      (await page.locator(".cm-content").first().innerText()).includes("smoke"),
      "typed text is not in the editor",
    );
  });

  await check("tags box can be typed in", async (page) => {
    await openNote(page);
    await page.getByRole("button", { name: "More for this note" }).click();
    await page.getByRole("menuitem", { name: "Tags…" }).click();
    const box = page.getByPlaceholder("+ Add a tag. Enter adds it.");
    await box.click();
    await page.keyboard.type("abc");
    expect((await box.inputValue()) === "abc", "the tag box did not take the typing");
  });

  await check("time list is not see-through", async (page) => {
    await rail(page, "Meetings");
    await page.getByRole("button", { name: /^New$/ }).first().click();
    await page.getByLabel("Time", { exact: true }).click();
    const alpha = await page.getByRole("listbox").evaluate((el) => {
      const c = getComputedStyle(el).backgroundColor;
      const m = /rgba?\(([^)]+)\)/.exec(c);
      const parts = (m?.[1] ?? "").split(/[,/ ]+/).filter(Boolean);
      return parts.length > 3 ? Number(parts[3]) : 1;
    });
    expect(alpha === 1, `the time list has a see-through background (alpha ${alpha})`);
  });

  await check("new meeting stays open", async (page) => {
    await rail(page, "Meetings");
    await page.getByRole("button", { name: /^New$/ }).first().click();
    for (const name of ["Agenda", "Decisions", "Actions", "Agenda", "Decisions", "Actions"]) {
      await page.getByRole("checkbox", { name }).click();
      await page.waitForTimeout(250);
      expect(
        (await page.locator("[role=dialog]").count()) === 1,
        `the window closed after clicking ${name}`,
      );
    }
  });

  await check("meeting", async (page) => {
    await rail(page, "Meetings");
    await page.getByRole("button", { name: /Start meeting/ }).click();
    const notes = page.getByLabel("Notes for the meeting");
    await notes.click();
    await page.keyboard.type(" smoke");
    await page.getByLabel("Add a decision").fill("Ship it on Friday");
    await page.keyboard.press("Enter");
    await page.getByText("Ship it on Friday").waitFor({ timeout: 3000 });
  });

  await check(
    "welcome offers the demo vault",
    async (page) => {
      await page.getByRole("button", { name: "Try the demo vault" }).waitFor({ timeout: 5000 });
      await page.getByRole("button", { name: /Create new vault/ }).waitFor({ timeout: 2000 });
    },
    { welcome: true },
  );

  await check("tasks", async (page) => {
    await rail(page, "Tasks");
    await page.getByText("VPN rollout").first().waitFor({ timeout: 5000 });
    await page.getByText("Office move").first().waitFor({ timeout: 5000 });
  });

  await check("themes", async (page) => {
    await page
      .getByRole("button", { name: /Settings/ })
      .first()
      .click();
    await page.getByRole("radio", { name: /Midnight/ }).click();
    await page.waitForTimeout(300);
    const theme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    expect(theme === "midnight", `data-theme is ${theme}, not midnight`);
  });
} finally {
  stop();
}

const failed = results.filter((r) => !r.ok).length;
console.log(
  failed === 0
    ? `\nAll ${results.length} checks passed.`
    : `\n${failed} of ${results.length} checks failed.`,
);
process.exit(failed === 0 ? 0 : 1);
