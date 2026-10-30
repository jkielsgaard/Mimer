# The Rust backend

Which area each module belongs to is in `docs/AREAS.md`. Shared here: `lib.rs` (plugins, state, the list of commands), `state.rs`, `error.rs` (`AppError`), `commands/mod.rs`.

- Commands in `commands/` are thin: check the input, call the area's module, return `Result<T, AppError>`. Logic lives in the module and is tested there without Tauri (`tempfile` vaults, `open_for_test`).
- A new command is registered in `lib.rs` and gets a typed wrapper in `src/lib/api.ts`. A type the frontend reads derives `ts_rs::TS` with `#[ts(export)]`; `cargo test` regenerates `src/bindings/`.
- No `unwrap`/`expect`/`panic!` outside tests; `rustfmt` and `clippy -D warnings` are clean.
