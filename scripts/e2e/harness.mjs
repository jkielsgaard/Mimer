// DRAFT, not wired into any command yet (see docs/plans/review-2026-11.md, task 8).
//
// Runs Mimer's real frontend in a headless Chromium with a pretend backend, so screens can be
// checked and photographed without the desktop app and without anybody's own notes. The frontend
// is served by `pnpm dev` (http://localhost:1420); every Tauri command the frontend calls is
// answered here from a small demo vault kept in memory.
//
// Needs the dev dependency `playwright` and a Chromium (see the plan for how CI gets one).
import { chromium } from "playwright";

/** The moment the pretend app runs at, so "today" is the same in every picture. */
const NOW = "2026-10-30T09:15:00";

/** The demo vault. Task 6 of the plan moves these into `src-tauri/demo-vault/` and reads them here. */
export const NOTES = {
  "Work/VPN rollout plan.md":
    "---\ntags: [vpn, it, pinned]\n---\n# VPN rollout plan\n\nWe roll out the new VPN client to all laptops before the end of November.\n\n## Goals\n\n- Everyone is on the new client by 30 November.\n- The old client is removed afterwards.\n- Support has a short guide to send to users.\n\n## Risks\n\n| Risk | Answer |\n| --- | --- |\n| Laptops that are rarely online | Offer a drop-in hour |\n| Missing licences | Order 20 extra |\n\nSee [[Weekly with Mette]] for the status. This work is part of #q4.\n",
  "Work/Support guide.md":
    "---\ntags: [it]\n---\n# Support guide\n\nA short guide for people who get the new VPN client.\n\n1. Install the client.\n2. Sign in with your work account.\n3. Check that the green dot shows.\n",
  "Projects/VPN rollout.md":
    "---\ntags: [epic]\n---\n# VPN rollout\n\n- [ ] Send the offer to Acme status:doing made:2026-10-26 #vpn\n  - [x] Collect the prices\n  - [ ] Write the offer\n  - [ ] Get it approved\n  - 2026-10-28 Called Acme: they want a discount on 50 seats.\n  - 2026-10-27 Asked three suppliers for a price.\n- [ ] Write the user guide made:2026-10-27 [[Support guide]]\n  - [x] Outline\n  - [ ] Screenshots\n- [ ] Order 20 extra licences status:waiting made:2026-10-28\n- [x] Pick the pilot group made:2026-10-20\n",
  "Projects/Office move.md":
    "---\ntags: [epic]\n---\n# Office move\n\n- [ ] Book the movers made:2026-10-25\n  - [ ] Get three quotes\n- [ ] Update the address on the website made:2026-10-29\n",
  "Meetings/Weekly with Mette.md":
    "---\ntags: [meeting, vpn]\nmeeting: 2026-10-30 10:00\nwith: [Mette]\nparts: [agenda, decisions, actions]\n---\n# Weekly with Mette\n\n## Agenda\n\n- [x] VPN status\n- [ ] Licences\n- [ ] Support guide\n\n## Notes\n\nPilot group is done. Rollout starts Monday.\n\nLicences: we are short of 20. Mette checks the price with the supplier.\n\nSupport guide: the draft is ready and needs screenshots.\n\n## Decisions\n\n- Rollout starts Monday\n\n## Actions\n\n- [ ] Order 20 extra licences made:2026-10-30\n- [ ] Add screenshots to the guide made:2026-10-30\n",
  "Meetings/Budget review.md":
    "---\ntags: [meeting]\nmeeting: 2026-10-31 13:30\nwith: [Lars, Nina]\nparts: [agenda]\n---\n# Budget review\n\n## Agenda\n\n- [ ] Q4 numbers\n- [ ] Next year\n\n## Notes\n",
};

const IDEAS = [
  {
    line: 0,
    key: "i1",
    date: "2026-10-29",
    text: "A weekly review note that collects what I worked on",
    tags: ["review"],
    status: null,
    note: "",
  },
  {
    line: 1,
    key: "i2",
    date: "2026-10-27",
    text: "Try the built-in AI on the old meeting notes",
    tags: [],
    status: null,
    note: "",
  },
  {
    line: 2,
    key: "i3",
    date: "2026-10-22",
    text: "Move the support guide into its own project",
    tags: ["it"],
    status: "task",
    note: "",
  },
];

/**
 * Opens a page with the pretend backend in place. `theme` is a theme id from `src/lib/themes.ts`.
 * The picture is `width` x `height` pixels; the page is drawn a little larger (x1.25) so the text
 * reads well in a README and in the Store. `log` collects page errors and commands with no answer.
 */
export async function launch({
  theme = "light",
  width = 1920,
  height = 1080,
  notes = NOTES,
  executablePath,
} = {}) {
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const page = await browser.newPage({
    viewport: { width: Math.round(width / 1.25), height: Math.round(height / 1.25) },
    deviceScaleFactor: 1.25,
  });
  await page.clock.setFixedTime(new Date(NOW));
  const log = [];
  page.on("pageerror", (e) => log.push("ERR " + e.message));
  await page.exposeFunction("__log", (s) => log.push(s));
  await page.addInitScript(
    ({ notes, theme, ideas, now }) => {
      const at = new Date(now).getTime() - 35 * 60000;
      try {
        localStorage.setItem("mimer.betaNoticeSeen", "1");
        localStorage.setItem(
          "mimer-recent:/demo/Mimer Demo",
          JSON.stringify([
            "Work/VPN rollout plan.md",
            "Projects/VPN rollout.md",
            "Meetings/Weekly with Mette.md",
            "Projects/Office move.md",
          ]),
        );
        localStorage.setItem(
          "mimer.startLayout",
          JSON.stringify([
            { id: "continue", wide: true },
            { id: "nextMeeting", wide: false },
            { id: "workingOn", wide: false },
            { id: "recent", wide: false },
            { id: "pinned", wide: false },
            { id: "epics", wide: true },
          ]),
        );
      } catch {
        /* the page works without it */
      }
      const front = (t) => {
        const m = /^---\n([\s\S]*?)\n---\n?/.exec(t);
        const o = {};
        if (m)
          m[1].split("\n").forEach((l) => {
            const i = l.indexOf(":");
            if (i > 0) o[l.slice(0, i).trim()] = l.slice(i + 1).trim();
          });
        return o;
      };
      const tagsOf = (t) =>
        (front(t).tags || "")
          .replace(/[\[\]]/g, "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      const tagged = (tag) =>
        Object.entries(notes)
          .filter(([, t]) => tagsOf(t).includes(tag))
          .map(([p, c]) => ({ path: p, content: c, mtime: at }));
      // A small copy of the task reader in src-tauri/src/tasks/mod.rs: enough for the demo vault.
      const parseTasks = (p, text) => {
        const lines = text.split("\n");
        const out = [];
        lines.forEach((l, i) => {
          const m = /^- \[( |x)\] (.*)$/.exec(l);
          if (!m) return;
          let title = m[2];
          const word = (k) => {
            const r = new RegExp("\\b" + k + ":(\\S+)").exec(title);
            if (r) title = title.replace(r[0], "");
            return r ? r[1] : null;
          };
          const status = word("status"),
            made = word("made"),
            due = word("due"),
            plan = word("plan");
          const tags = [...title.matchAll(/#(\w+)/g)].map((x) => x[1]);
          title = title.replace(/#\w+/g, "");
          const link = (/\[\[([^\]]+)\]\]/.exec(title) || [])[1] || null;
          title = title.replace(/\[\[[^\]]+\]\]/g, "");
          const steps = [],
            logs = [];
          let j = i + 1;
          while (j < lines.length && /^  - /.test(lines[j])) {
            const s = /^  - \[( |x)\] (.*)$/.exec(lines[j]);
            const g = /^  - (\d{4}-\d{2}-\d{2}) (.*)$/.exec(lines[j]);
            if (s) steps.push({ line: j, text: s[2], done: s[1] === "x", key: p + ":" + j });
            else if (g) logs.push({ line: j, date: g[1], text: g[2], key: p + ":" + j });
            j++;
          }
          out.push({
            path: p,
            line: i,
            end: j - 1,
            key: p + ":" + i,
            title: title.trim().replace(/\s+/g, " "),
            done: m[1] === "x",
            tags,
            due,
            plan,
            status,
            estMinutes: null,
            steps,
            log: logs,
            note: "",
            made,
            link,
          });
        });
        return out;
      };
      const settings = {
        schemaVersion: 1,
        recentVaults: ["/demo/Mimer Demo"],
        lastVault: "/demo/Mimer Demo",
        theme,
        editor: {
          fontSize: 15,
          lineWidth: 760,
          spellcheck: true,
          recentNotes: 4,
          aiSpelling: false,
          traceWork: false,
          ownWords: [],
        },
        git: { authorName: "Demo", authorEmail: "demo@example.com", idleCommitMinutes: 5 },
        ai: {
          defaultProviderId: "lm",
          checkAnswers: false,
          cloudConsent: null,
          answerLanguage: "",
          globalInstructions: "",
          foundry: { model: "", tools: true },
          builtin: {
            cpu: "other",
            gpu: "none",
            backend: "cpu",
            modelId: "gemma-4-12b-qat",
            contextTokens: 16384,
            gpuUse: "auto",
            gpuLayerCount: 32,
            threads: 0,
            flashAttention: "auto",
            thinking: false,
            idleSleepMinutes: 0,
          },
          embeddings: { enabled: false, providerId: "lm", model: "" },
          providers: [
            {
              id: "lm",
              kind: "lmstudio",
              name: "LM Studio",
              baseUrl: "http://localhost:1234/v1",
              model: "",
              location: "local",
              supportsTools: true,
              contextTokens: 8000,
            },
          ],
        },
      };
      const vault = {
        name: "Mimer Demo",
        path: "/demo/Mimer Demo",
        config: {
          schemaVersion: 1,
          attachmentsFolder: "attachments",
          newNoteFolder: "",
          dailyNotesFolder: "Daily",
          dailyNoteFormat: "%Y-%m-%d",
          dailyTemplate: "",
          meetingsFolder: "Meetings",
          quickNotesFolder: "",
          imageLinkStyle: "markdown",
        },
      };
      const folders = {};
      for (const p of Object.keys(notes)) {
        const [d, f] = p.split("/");
        (folders[d] ??= []).push({ name: f, path: p, isDir: false, children: [], modified: at });
      }
      const tree = Object.entries(folders).map(([d, ch]) => ({
        name: d,
        path: d,
        isDir: true,
        children: ch,
        modified: 0,
      }));
      // One answer per Tauri command (the names are the ones in src/lib/api.ts). A command that is
      // not listed answers null and is written to the log as "unknown <name>".
      const answers = {
        get_settings: () => settings,
        open_vault: () => vault,
        get_tree: () => tree,
        get_tree_order: () => ({ folders: {} }),
        get_epic_order: () => [],
        read_note: ({ path }) => ({ path, content: notes[path] ?? "", mtime: at }),
        write_note: ({ path, content }) => {
          notes[path] = content;
          return null;
        },
        create_note: ({ folder, name }) => `${folder}/${name}.md`,
        tagged_notes: ({ tag }) => tagged(tag),
        all_tags: () => [
          { tag: "vpn", count: 4 },
          { tag: "it", count: 3 },
          { tag: "q4", count: 2 },
          { tag: "review", count: 1 },
          { tag: "meeting", count: 2 },
          { tag: "epic", count: 2 },
          { tag: "pinned", count: 1 },
        ],
        note_tags: ({ path }) => tagsOf(notes[path] ?? ""),
        note_set_tag: ({ path }) => tagsOf(notes[path] ?? ""),
        list_tasks: () => Object.entries(notes).flatMap(([p, t]) => parseTasks(p, t)),
        list_epics: () =>
          tagged("epic").map((n) => ({
            path: n.path,
            title: /^# (.*)$/m.exec(n.content)?.[1] ?? n.path,
            source: null,
            description: "",
          })),
        list_ideas: () => ideas,
        backlinks: () => [],
        list_chats: () => [],
        list_daily_dates: () => [],
        splash_done: () => null,
        missing_vaults: () => [],
        list_projects: () => [],
        get_embedding_status: () => ({ enabled: false }),
      };
      let callback = 1;
      window.__TAURI_INTERNALS__ = {
        metadata: {
          currentWindow: { label: "main" },
          currentWebview: { label: "main", windowLabel: "main" },
        },
        transformCallback: () => callback++,
        unregisterCallback() {},
        convertFileSrc: (p) => p,
        invoke: async (cmd, args) => {
          if (cmd.startsWith("plugin:event|")) return cmd.endsWith("listen") ? 1 : null;
          if (cmd.startsWith("plugin:")) return null;
          const answer = answers[cmd];
          if (!answer) {
            window.__log("unknown " + cmd);
            return null;
          }
          return await answer(args ?? {});
        },
      };
      window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    },
    { notes, theme, ideas: IDEAS, now: NOW },
  );
  return { browser, page, log };
}

/** Clicks an icon in the left rail by its name: Start, Files, Search, Ideas, Tasks, Meetings. */
export function rail(page, name) {
  return page.locator(`[aria-label="${name}"]`).first().click({ timeout: 5000 });
}
