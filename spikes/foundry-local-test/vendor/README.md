# Vendored: foundry-local-sdk 2.1.0

Copy of the `foundry-local-sdk` crate (MIT, Microsoft, https://github.com/microsoft/Foundry-Local).
Two changes, both only to make it build:

1. `Cargo.toml`: the build dependency `zip = "2"` is `zip = "9.0.2"` and the dev dependency on zip
   is removed. Every version of `zip` 2.x is yanked on crates.io, so a fresh dependency resolution
   of the original crate fails.
2. `http_extract.rs` line 37: `file.name()` returns a `Result` in zip 9.

Remove this copy and use the crates.io version when Microsoft publishes a release that resolves.
