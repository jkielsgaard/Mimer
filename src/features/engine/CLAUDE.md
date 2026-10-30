# Built-in AI

The AI that runs inside Mimer: llama.cpp (`src-tauri/src/engine/`), Microsoft's Foundry Local (`foundry/`, run in a helper process) and Windows' Phi Silica (`phisilica/`, Store version on Copilot+ PCs), with their settings (`BuiltInAiTab`, `FoundrySettings`, `PhiSilicaSettings`), wake and sleep.

- Nothing is downloaded without the person pressing a button for it. Foundry's hardware parts are fetched only after "Download and find my hardware" (`hardware-ready` / `hardware-declined` in its folder).
- The helper and the engines answer on `127.0.0.1` only.
- The Phi Silica token is a GitHub secret; it never appears in code, logs or chat.
