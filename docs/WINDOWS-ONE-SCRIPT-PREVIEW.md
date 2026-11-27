# Safe Dell laptop preview startup

Download `scripts/Start-VetitPhonePreview.ps1` to Downloads, then run this in Windows PowerShell:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\Downloads\Start-VetitPhonePreview.ps1"
```

The execution-policy option applies only to that process; the script does not change system policy and needs no administrator privileges to run. Review the script before running it. Node's official installer may separately request installation permission.

The default existing folder is `C:\Users\DELL\vetit-online`. The script reads only Git identity/status there and in sibling `vetit*` directories, never traversing or copying backups. The current recovery branch and all untracked files are left intact. A clean checkout is reused only when its origin is Vetit Online, branch is `codex/marketplace-accounts-2026-11-06`, and commit matches the live GitHub branch. Otherwise a unique sibling feature checkout is cloned. If cloning fails, its folder is preserved. Authentication/network failures stop clearly rather than falling back to an unverified checkout.

If Node is absent from PATH, common existing installation locations are checked. Supported Node 22.13+ and 24.3+ versions are recognized. If none is found, install official **Node 24 LTS with npm and Add to PATH**, then reopen PowerShell and rerun the same script. Node itself is not downloaded or installed by the script. The pinned pnpm CLI is installed, if missing, under `%LOCALAPPDATA%\VetitOnline\tools`, not into the recovery repository. Mobile dependencies are installed only in the selected clean feature checkout from its frozen lockfile if Expo is missing. Existing manifests/lockfiles and production settings are not edited. The checked TypeScript configuration is preserved by disabling Expo's automatic TypeScript setup for this process.

When ready, the script starts the existing fixture server and Expo Metro. Both phones must share the laptop's private Wi-Fi. The new QR and Expo link appear in the **same PowerShell window**. Open the printed `http://CURRENT-IP:4324/__device/health` URL on both phones first. On iPhone scan with Camera → Open in Expo Go; on Android scan within Expo Go. Expect Home, Shop, Services, Cart and Account. Allow Node through the firewall on private networks only.

If multiple private adapters are detected, use the current Wi-Fi IPv4 from `ipconfig`:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\Downloads\Start-VetitPhonePreview.ps1" -WifiAddress 192.168.1.35
```

That address is an example from the earlier network, not a claim it is still current. If Metro's port is occupied, append `-MetroPort 8090`. Port 4324 is reserved for the fixture API; the script never stops unrelated processes to free it. Stop this preview with Ctrl+C. The selected clean feature checkout path is printed for subsequent website development; no website server, hosted database, real provider, deployment or store submission is started.

This remains a synthetic public catalogue/cart/services preview, not private booking/account/payment acceptance. Expo Go must support project SDK 57; an incompatible client requires the separately approved signed-build route rather than a dependency upgrade. Cloud Linux cannot run the script on the laptop remotely. Local PowerShell parsing/logic tests do not certify Windows execution; Windows PowerShell 5.1 and Windows/Ubuntu PowerShell checks are included in CI, and physical phone testing remains manual.
