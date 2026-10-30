---
name: release
description: Commit the finished work and release a new version of Mimer (Windows installer, Microsoft Store package, Linux) through GitHub. Use for /release, or when the owner asks to commit and build a new version or Store package.
---

# Release Mimer

Only when the owner asks. Talk to them in Danish.

1. **Checks green**: `pnpm format:check`, `pnpm areas check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (Node 22) and `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test` in `src-tauri/` (the `mimer-dev` distrobox). Stop and report if one fails.
2. **Change report** of everything in the release: `pnpm areas report <last tag>`.
3. **Version** (minor for features, patch for fixes only): `package.json`, `src-tauri/Cargo.toml`, the `mimer` entry in `src-tauri/Cargo.lock`, `docs/MSIX.md`, the version at the top of `CLAUDE.md`. Turn `[Unreleased]` in `CHANGELOG.md` into `## [X.Y.Z] - <date>` with a clean Added / Changed / Fixed / Removed, and an empty `[Unreleased]` above it. Do anything `docs/DECISIONS.md` says must happen "in the release after …".
4. **Commit** on the work branch (Conventional Commits, with the attribution lines the session gives), merge `--no-ff` into `main`, tag `vX.Y.Z`, push `main`, the branch and the tag. Never move or delete a tag that is pushed.
5. **Watch** that the Release workflow started (`gh run list`). The owner publishes the draft release.
6. **What's new**: write the Store text for the owner in English, short bullets in the owner's words: what they can now do, not how it is built.
