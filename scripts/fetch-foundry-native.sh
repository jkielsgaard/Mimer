#!/usr/bin/env bash
# Downloads Foundry Local's native libraries (about 90 MB on Linux) into src-tauri/foundry-native,
# where Mimer's build packs them and a development build finds them.
#
# It uses the Foundry Local SDK's own build step (it fetches the "Runtime" package from NuGet), run
# through the empty crate in scripts/foundry-native-fetch. Needs Rust and internet.
#
#   scripts/fetch-foundry-native.sh                 # the version pinned below
#   FOUNDRY_LOCAL_RUNTIME_VERSION=2.4.0 scripts/fetch-foundry-native.sh
set -euo pipefail

version="${FOUNDRY_LOCAL_RUNTIME_VERSION:-2.4.1}"
root="$(cd "$(dirname "$0")/.." && pwd)"
dest="$root/src-tauri/foundry-native"
manifest="$root/scripts/foundry-native-fetch/Cargo.toml"

echo "Fetching Foundry Local runtime $version ..."
target="$root/scripts/foundry-native-fetch/target/release/build"
out=""
# The SDK's build step only reports a failed download as a warning that cargo hides, so the
# libraries are looked for afterwards; on a miss its own messages are shown and it is tried again.
for attempt in 1 2 3; do
  FOUNDRY_LOCAL_RUNTIME_VERSION="$version" cargo build --release --manifest-path "$manifest"
  # Cargo has put the build output in `build/foundry-local-sdk-<hash>/out` and, since Rust 1.100, in
  # `build/foundry-local-sdk/<hash>/out`; both are found by looking for the library itself.
  found="$(find "$target" \( -name libfoundry_local.so -o -name libfoundry_local.dylib \) -path '*/out/*' | tail -n 1)"
  [ -n "$found" ] && out="$(dirname "$found")"
  [ -n "$out" ] && break
  echo "Attempt $attempt: the native libraries were not found. The SDK's build said:" >&2
  find "$target" -name output -path '*foundry-local-sdk*' -exec cat {} + >&2 || true
  cargo clean --release -p foundry-local-sdk --manifest-path "$manifest" || true
  sleep 15
done
if [ -z "$out" ]; then
  echo "The native libraries were not found in $target" >&2
  exit 1
fi

mkdir -p "$dest"
# Only the libraries, not the build's bookkeeping files.
find "$out" -maxdepth 1 -type f \( -name '*.so' -o -name '*.so.*' -o -name '*.dylib' \) -exec cp {} "$dest"/ \;
# The libraries ask for ONNX Runtime by its soname (libonnxruntime.so.1). The AppImage tool needs
# a file with that name to find (a copy: a link would not survive packing).
# Copied every time, so it never stays behind at an older version.
if [ -f "$dest/libonnxruntime.so" ]; then
  cp "$dest/libonnxruntime.so" "$dest/libonnxruntime.so.1"
fi
echo "Copied to $dest:"
ls -lh "$dest"
