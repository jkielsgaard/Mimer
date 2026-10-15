# Microsoft Store package (MSIX)

Microsoft signs an MSIX package itself when it is published in the Microsoft Store, so there is no certificate to buy and Windows does not show the "unknown publisher" warning. This page is how to build the package, try it, and send it in.

The package is built by `scripts/msix/Build-Msix.ps1` on Windows. The release workflow also builds it (as an artifact called `mimer-msix`) for every tag, without failing the release if the step has a problem.

## 1. Reserve the name and read the identity (once)

1. Make a free developer account at https://storedeveloper.microsoft.com (as an individual).
2. In Partner Center choose **Apps and games → New product → MSIX or PWA app** and reserve the name **Mimer** (or another, if it is taken).
3. Under **Product management → Product identity** copy three values:
   - **Package/Identity/Name**, for example `12345Jkielsgaard.Mimer`
   - **Package/Identity/Publisher**, for example `CN=0000-1111-…`
   - **Package/Properties/PublisherDisplayName**
4. In the GitHub repository, **Settings → Secrets and variables → Actions → Variables**, add `MSIX_IDENTITY_NAME`, `MSIX_PUBLISHER` and `MSIX_PUBLISHER_DISPLAY_NAME` with those values. (They are not secrets.) Without them the workflow uses placeholders, which is fine for test packages only.

## 2. Build a test package and try it (Windows)

On a Windows computer with the Windows SDK, Node, Rust and pnpm:

```powershell
pnpm install
pnpm tauri build
./scripts/msix/Build-Msix.ps1 -Version 0.8.1 -TestSign
```

This makes the folder `msix-out` with, among other files, `Mimer_0.8.1.0_x64.msix` (unsigned, for the Store), `Mimer_0.8.1.0_x64_test.msix` (signed with a test certificate), `mimer-test.cer` and `Install-TestMsix.ps1`.

**Windows Sandbox** (Windows 11 Pro, feature "Windows Sandbox" turned on): edit `scripts/msix/mimer-sandbox.wsb` so that `HostFolder` is the full path of `msix-out`, and double-click it. The sandbox installs Mimer; start it from the Start menu. Everything is gone when you close the sandbox.

**A virtual machine** (or any test computer): copy `msix-out` over, open PowerShell **as administrator** in that folder and run `.\Install-TestMsix.ps1`. Remove it with `.\Install-TestMsix.ps1 -Remove`. Do not do this on your everyday or work computer: the script makes Windows trust the test certificate.

If a Build-Msix step fails, `makeappx` says what is wrong with the manifest.

## 3. What to check in the Store version

- Mimer starts, opens a folder as a vault and saves a note (`Ctrl+S`), and the version history works.
- LM Studio works as the AI (the Mimer tab). The **Built-in AI** tab says that the built-in AI is not available in the Store version.
- Settings are kept after closing and starting again. Uninstalling (Settings → Apps) removes the app's own data but not your notes.

## 4. Send it in

1. In Partner Center open the app's **Submission**. Upload the **unsigned** `Mimer_<version>_x64.msix` from the workflow artifact or from step 2 (not the `_test` file).
2. Fill in the **Store listing**: description, at least one screenshot (`docs/screenshot.png` can be used), the icon, and the category (Productivity).
3. **Privacy policy URL**: `https://github.com/jkielsgaard/Mimer/blob/main/PRIVACY.md`.
4. **Properties → Age rating** questionnaire, and the **notes for certification**: say that the app is open source, that it needs no account, that "Raven" sends only what the user types to a cloud AI the user chooses, and how to try it (open any folder as a vault).
5. Under **Pricing and availability** choose **Free**. To keep it out of the public search, choose **Hide this product … available by direct link only** (Markets and visibility).
6. Submit. Certification usually takes some days. Microsoft may ask questions or reject the app: read the message, fix, and send a new package.

## Known risks

- **The built-in AI is switched off in the Store build** (`ENGINE_DOWNLOAD_IN_STORE_BUILD` in `src-tauri/src/engine/catalog.rs`), because the Store's rules about apps that download programs have not been checked. Change it to `true` only after reading them.
- **The Store's rules about AI apps** have not been checked either. Mimer lets the user chat with a model of their own choice and, with Raven, with a cloud AI.
- **WebView2**: Windows 11 has it. On Windows 10 the user may need to install the Edge WebView2 runtime.
- An organisation can still block the Store, or block Store apps that are not approved. Check that the Microsoft Store opens on the computer where you want to use Mimer.
