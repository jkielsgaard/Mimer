Foundry Local's native libraries (about 90 MB) go in this folder. They are not kept in git: run
scripts/fetch-foundry-native.sh (Linux) or scripts/fetch-foundry-native.ps1 (Windows) to download
them. The release build does that before it builds Mimer, and this folder is then packed into the
installer, the AppImage and the Store package. Without them Mimer still works; Settings → Built-in AI
says that Foundry Local is not included in this build.
