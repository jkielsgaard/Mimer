#!/usr/bin/env bash
# Downloads Foundry Local's native libraries (about 90 MB on Linux) into src-tauri/foundry-native,
# where Mimer's build packs them and a development build finds them.
#
# It uses the Foundry Local SDK's own build step (it fetches the "Runtime" package from NuGet), run
# through the small test program in spikes/foundry-local-test. Needs Rust and internet.
#
#   scripts/fetch-foundry-native.sh                 # the version pinned below
#   FOUNDRY_LOCAL_RUNTIME_VERSION=2.2.0 scripts/fetch-foundry-native.sh
set -euo pipefail

version="${FOUNDRY_LOCAL_RUNTIME_VERSION:-2.1.0}"
root="$(cd "$(dirname "$0")/.." && pwd)"
dest="$root/src-tauri/foundry-native"
manifest="$root/spikes/foundry-local-test/Cargo.toml"

echo "Fetching Foundry Local runtime $version ..."
FOUNDRY_LOCAL_RUNTIME_VERSION="$version" cargo build --release --manifest-path "$manifest"

target="$root/spikes/foundry-local-test/target/release/build"
out=""
for d in "$target"/foundry-local-sdk-*/out; do
  if [ -f "$d/libfoundry_local.so" ] || [ -f "$d/libfoundry_local.dylib" ]; then
    out="$d"
  fi
done
if [ -z "$out" ]; then
  echo "The native libraries were not found in $target" >&2
  exit 1
fi

mkdir -p "$dest"
# Only the libraries, not the build's bookkeeping files.
find "$out" -maxdepth 1 -type f \( -name '*.so' -o -name '*.so.*' -o -name '*.dylib' \) -exec cp {} "$dest"/ \;
echo "Copied to $dest:"
ls -lh "$dest"
