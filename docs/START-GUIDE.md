# Mimer – how to start the app

This guide gets Mimer running on **Linux** and **Windows** from the source code, and explains how to build an installer. Read the section for your system; the steps after "Start the app" are the same on both.

> You only need to do the setup once. After that, starting the app is one command: `pnpm tauri dev`.

---

## What you need

| Tool                 | Version             | Why                                                             |
| -------------------- | ------------------- | --------------------------------------------------------------- |
| Node.js              | **22 LTS**          | Frontend build and tests (`.nvmrc` says 22)                     |
| pnpm                 | latest              | Package manager (installed with npm below)                      |
| Rust                 | stable (via rustup) | The backend                                                     |
| Platform build tools | see below           | Compile the native parts                                        |
| LM Studio (optional) | latest              | Local AI. Mimer runs without it; AI features show a clear error |

---

## Linux (Fedora, Bazzite, Ubuntu)

On **Bazzite** and other immutable Fedora systems, do everything inside a Fedora container (distrobox). This keeps the system clean. On a normal Fedora or Ubuntu install you can skip step 1.

### Step 1 – Create and enter the container (Bazzite / Silverblue only)

```bash
distrobox create --name mimer-dev --image quay.io/fedora/fedora:43
distrobox enter mimer-dev
```

The container shares your display, home folder and network, so the window opens normally and `localhost:1234` reaches LM Studio on the host.

### Step 2 – System libraries

Fedora:

```bash
sudo dnf install -y webkit2gtk4.1-devel dbus-devel curl wget file \
  libappindicator-gtk3-devel librsvg2-devel libxdo-devel \
  gcc gcc-c++ make pkgconf-pkg-config
sudo dnf group install -y "development-tools"
```

Ubuntu / Debian (instead of Fedora):

```bash
sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev \
  libdbus-1-dev libayatana-appindicator3-dev librsvg2-dev
```

### Step 3 – Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source ~/.cargo/env
```

### Step 4 – Node.js 22 and pnpm

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.nvm/nvm.sh        # or open a new terminal
nvm install 22
nvm use 22
corepack enable
corepack prepare pnpm@latest --activate
```

If `corepack` is not available, use `npm install -g pnpm` instead.

### Step 5 – Get the code and start the app

```bash
cd ~/Development/Mimer      # the folder that contains package.json
pnpm install
pnpm tauri dev
```

The first start compiles the Rust code and takes several minutes. Later starts take seconds.

If the window is blank or shows graphics errors, start with:

```bash
WEBKIT_DISABLE_COMPOSITING_MODE=1 pnpm tauri dev
```

---

## Windows 10 / 11

Everything below runs in **PowerShell** (Start menu → "PowerShell"). You do not need administrator rights for the project itself.

### Step 1 – Visual Studio C++ build tools (needed by Rust)

```powershell
winget install --id Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

This installs the C++ toolchain. It is large (several GB) and can take 10–20 minutes. Windows may ask for administrator permission once.

### Step 2 – Rust, Node.js 22 and Git

```powershell
winget install --id Rustlang.Rustup
winget install --id OpenJS.NodeJS.LTS
winget install --id Git.Git
```

**Close PowerShell and open it again** so the new programs are found. Then:

```powershell
rustup default stable-msvc
node -v        # should print v22.x (if it shows another version, install Node 22 from nodejs.org)
```

### Step 3 – pnpm

```powershell
npm install -g pnpm
pnpm -v
```

`npm install -g` works without administrator rights on a normal Node install. (If you prefer `corepack`, run `corepack enable` in a terminal opened as administrator.)

### Step 4 – WebView2 (only if the window stays blank)

Windows 11 and current Windows 10 already include WebView2. If the Mimer window stays white:

```powershell
winget install --id Microsoft.EdgeWebView2Runtime
```

### Step 5 – Get the code and start the app

```powershell
cd C:\Users\<you>\Development\Mimer      # the folder that contains package.json
pnpm install
pnpm tauri dev
```

The first start takes several minutes (it compiles everything). Later starts take seconds.

**Tip:** if PowerShell refuses to run `pnpm` because of script rules, run this once and try again:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

---

## Use the built-in AI (optional)

Open **Settings → Built-in AI**, choose your hardware and a model, press **Download**, and then **Wake** in the status bar. The help (F1) has a topic called The built-in AI.

## Start the app (both systems)

From the project folder:

```bash
pnpm tauri dev
```

- The Mimer window opens. The first time you see the **Welcome** screen: choose **Open folder as vault** and pick a folder with Markdown files, or **Create new vault**.
- Keep the terminal open. Changes to the frontend reload automatically; changes to Rust code restart the app when you run `pnpm tauri dev` again.
- Stop the app by closing the window or pressing `Ctrl+C` in the terminal.

### Before you open your own notes

Mimer turns a vault into a Git repository and commits changes. Use a dedicated notes folder, not your whole home directory or a project folder you already version with another Git repository. Try a throw-away folder first.

---

## Check that everything works

```bash
pnpm test                 # frontend tests (about 660 tests)
pnpm lint                 # ESLint, must be clean
pnpm typecheck            # TypeScript, must be clean
pnpm format:check         # Prettier
cargo test --manifest-path src-tauri/Cargo.toml       # Rust tests (about 530 tests)
```

On Windows replace the `cargo` line with the same command; it works in PowerShell too. `pnpm check` runs everything at once (it needs Rust and Node on the same machine).

---

## Build an installer

```bash
pnpm tauri build
```

- **Windows:** the installer is `src-tauri\target\release\bundle\nsis\Mimer_<version>_x64-setup.exe`. It installs for the current user only and needs no administrator rights.
- **Linux:** `src-tauri/target/release/bundle/` contains an `.AppImage` and an `.rpm`.

---

## Set up local AI (LM Studio)

1. Install [LM Studio](https://lmstudio.ai) and download a model that supports tool calling (for example a Qwen or Llama _instruct_ model).
2. In LM Studio open the **Developer** tab and **start the server**. Address: `http://localhost:1234/v1`.
3. In Mimer: **File → Settings… → AI providers → LM Studio → Load models**, choose the model, **Test connection**, **Save**.

### Semantic search (optional)

Semantic search finds notes by meaning. It needs an **embedding model** in LM Studio (for example `nomic-embed-text`):

1. Download the embedding model in LM Studio and load it on the server.
2. In Mimer: **Settings → AI → Semantic search**: tick **Enable semantic search**, choose **LM Studio**, pick the model (**Load models** lists them), **Save**.
3. Indexing starts in the background. The status shows how many notes are done. Then in the search panel choose **Meaning** or **Both**.

Semantic search only uses a provider on your own computer, so no note is sent to a cloud service.

---

## Try the new features (quick tour)

| What                    | How                                                                                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Several notes at once   | Click notes in the tree; each opens as a tab. Close with `×`, middle-click or `Ctrl/Cmd+W`. Switch with `Ctrl/Cmd+PageUp/PageDown`.                   |
| Split view              | Open two notes, press `Ctrl/Cmd+\`. Press it again to close the split.                                                                                |
| Daily note              | `Ctrl/Cmd+Shift+D` (creates `Daily/<date>.md`), or a day in the calendar at the top of the file panel.                                                |
| Templates               | Right-click or **File → Save the note as a template…**, then **File → New note from a template…**. Variables such as `{{date}}` are filled in.        |
| Vault settings          | **Settings → Vault**: daily notes folder, date format, daily template.                                                                                |
| Tables                  | Type a Markdown table; when the cursor leaves it, it shows as a table. `Ctrl/Cmd+Alt+T` inserts one.                                                  |
| Export                  | **File → Export…**, or right-click a note or folder → **Export…**. Choose HTML, Word or PDF (PDF opens a print preview: choose _Save as PDF_).        |
| Chat                    | The speech bubble at the right edge, or `Ctrl/Cmd+L`, opens **Ask about my notes**. **History** lists earlier chats; **New chat** starts over.        |
| Attach notes to chat    | In the chat type `/` and pick a note (or press the paperclip). Mimer works on the notes you attach.                                                   |
| Formatting toolbar      | Above every note: bold, italic, headings, lists, links, table, code block and more. You do not need to type the Markdown.                             |
| Import from OneNote     | See [IMPORT-ONENOTE.md](IMPORT-ONENOTE.md), then **File → Import notes from a folder…**.                                                              |
| Meeting and quick notes | **New** at the top of the file tree: **Meeting note…** and **Quick note**. They use the templates `Meeting` and `Quick note`.                         |
| Tasks and epic tasks    | `Ctrl/Cmd+Shift+T`, or the Tasks icon at the left edge. Tasks are checklist lines in your notes; an epic task is a note in `Tasks/` that holds tasks. |
| Ideas                   | `Ctrl/Cmd+Shift+N` writes an idea down from anywhere; the light bulb at the left edge lists them.                                                     |
| Trace my work           | **Settings → General** (or when you create a vault): one line a day under "Worked on" in the daily note for each note and task you work on.           |
| Command palette         | `Ctrl/Cmd+Shift+P`: notes, AI commands and actions in one search.                                                                                     |
| Switch vault            | Click the vault name in the header, or `Ctrl/Cmd+Shift+O`.                                                                                            |
| Index page              | Right-click a folder → **Make an index page** (no AI), or **AI** → **Create an index page**.                                                          |
| Link to a note          | The link button in the toolbar, or `Ctrl/Cmd+Shift+K`.                                                                                                |
| How-to guide            | **Help → How to use Mimer**, or press `F1`. Small **?** buttons explain settings and tools.                                                           |
| Name a note             | `Ctrl/Cmd+N` asks for the name in a small window; the note starts with that name as its heading.                                                      |
| Pictures                | Paste, drag, or the **Insert image** button. **Images** at the right edge lists them.                                                                 |
| AI on a folder          | Right-click a folder → **AI**: sort into folders, find duplicates, fix spelling in every note and more.                                               |
| AI on a note            | The **AI** button above the note, and **AI ▾** in the bar over selected text. Each command does one fixed thing; you review it before it is written.  |
| Projects                | Under **Projects** in the file panel, with their own notes. Drag a note onto a project to move it in.                                                 |
| About                   | **Help → About Mimer…** shows the version and who made the app.                                                                                       |
| Meaning search          | Needs semantic search enabled (see above).                                                                                                            |

---

## Troubleshooting

| Problem                                        | Fix                                                                                                                   |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `pnpm: command not found`                      | Open a new terminal (Windows) or run `source ~/.nvm/nvm.sh` (Linux), then `corepack enable` or `npm install -g pnpm`. |
| `node -v` shows the wrong version              | Linux: `nvm use 22`. Windows: install Node 22 LTS from nodejs.org.                                                    |
| Rust build fails with a linker error (Windows) | The Visual Studio C++ build tools (step 1) are missing. Re-run the winget command.                                    |
| Missing `webkit2gtk` / `dbus` (Linux)          | Install the system packages from Linux step 2 in the same container or terminal.                                      |
| Blank window                                   | Linux: `WEBKIT_DISABLE_COMPOSITING_MODE=1 pnpm tauri dev`. Windows: install WebView2.                                 |
| "Could not reach http://localhost:1234"        | LM Studio's server is not running, or the model is not loaded. The app still works without AI.                        |
| Settings could not be loaded                   | `settings.json` is from a newer Mimer version. Mimer does not overwrite it; update Mimer or fix the file.             |
| The app says the keychain is unavailable       | Linux: start GNOME Keyring or KWallet. Windows: the Credential Manager is always available.                           |

Logs are written to the application log folder: Linux `~/.local/share/dk.mdvault.app/logs`, Windows `%LOCALAPPDATA%\dk.mdvault.app\logs`.

---

## Where to find more

- [`README.md`](../README.md): features and how to install.
- [`docs/MANUAL_TESTS.md`](MANUAL_TESTS.md): the manual test checklist.
- [`docs/DECISIONS.md`](DECISIONS.md): every technical decision and deviation from the specification.

## Foundry Local in a development build

Foundry Local's native libraries (about 90 MB on Linux) are not kept in git. Fetch them once into `src-tauri/foundry-native` with `scripts/fetch-foundry-native.sh` (Linux) or `scripts/fetch-foundry-native.ps1` (Windows). Without them Mimer works, and Settings → Built-in AI says Foundry Local is not included in this build. The release build fetches them before it builds. The Foundry Local engine runs in a helper process: Mimer started again as `mimer --foundry-helper <command>` (see `src-tauri/src/foundry/helper.rs`).
