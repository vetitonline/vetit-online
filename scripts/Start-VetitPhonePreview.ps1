# Compatible with Windows PowerShell 5.1. Run without administrator privileges.
[CmdletBinding()]
param(
    [string]$ExistingCheckout = 'C:\Users\DELL\vetit-online',
    [string]$WifiAddress = 'auto',
    [ValidateRange(1024, 65535)][int]$MetroPort = 8081
)

function Invoke-VetitGit {
    param([string[]]$Arguments)
    $savedPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $output = @(& $script:VetitGit @Arguments 2>&1)
        $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = $savedPreference }
    if ($code -ne 0) { throw "Git failed (exit $code). $($output -join [Environment]::NewLine)" }
    return ($output -join "`n").Trim()
}

function Test-VetitNodeVersion {
    param([string]$Version)
    if ($Version -notmatch '^v?(\d+)\.(\d+)\.(\d+)$') { return $false }
    $number = [version]($Version.TrimStart('v'))
    return (($number.Major -eq 22 -and $number -ge [version]'22.13.0') -or
        ($number.Major -eq 24 -and $number -ge [version]'24.3.0'))
}

function Find-VetitNode {
    $candidates = @()
    $command = Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command) { $candidates += $command.Source }
    foreach ($directory in @(
        $(if ($env:ProgramFiles) { Join-Path $env:ProgramFiles 'nodejs' }),
        $(if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA 'Programs\nodejs' }),
        $env:NVM_SYMLINK,
        $(if ($env:USERPROFILE) { Join-Path $env:USERPROFILE 'scoop\apps\nodejs-lts\current' })
    )) {
        if ($directory) { $candidates += Join-Path $directory 'node.exe' }
    }
    foreach ($candidate in @($candidates | Select-Object -Unique)) {
        if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
        $version = (& $candidate --version 2>$null | Out-String).Trim()
        if ($LASTEXITCODE -eq 0 -and (Test-VetitNodeVersion $version)) { return $candidate }
    }
    return $null
}

function Find-VetitReadyCheckout {
    param([string[]]$Candidates, [string]$Branch, [string]$RemoteTip)
    foreach ($candidate in @($Candidates | Select-Object -Unique)) {
        if (-not (Test-Path -LiteralPath (Join-Path $candidate '.git'))) { continue }
        try {
            $origin = Invoke-VetitGit -Arguments @('-C', $candidate, 'remote', 'get-url', 'origin')
            if ($origin -notmatch '^(https://github\.com/|git@github\.com:)vetitonline/vetit-online(?:\.git)?/?$') { continue }
            $currentBranch = Invoke-VetitGit -Arguments @('-C', $candidate, 'branch', '--show-current')
            $head = Invoke-VetitGit -Arguments @('-C', $candidate, 'rev-parse', 'HEAD')
            $status = Invoke-VetitGit -Arguments @('-C', $candidate, 'status', '--porcelain=v1', '--untracked-files=all')
            # Never switch branches, pull, stash or install into a recovery/dirty/older checkout.
            if ($currentBranch -eq $Branch -and $head -eq $RemoteTip -and -not $status) { return $candidate }
        } catch { Write-Host "Leaving an unreadable candidate untouched: $candidate" }
    }
    return $null
}

function Start-VetitPhonePreview {
    $ErrorActionPreference = 'Stop'
    if ($env:OS -ne 'Windows_NT') { throw 'Run this script on the Windows laptop, not the cloud computer.' }
    if ($MetroPort -eq 4324) { throw 'Metro cannot use fixture API port 4324.' }
    $gitCommand = Get-Command git.exe -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $gitCommand) { throw 'Git was not found. Open the PowerShell window where Git already works and rerun this script.' }
    $script:VetitGit = $gitCommand.Source
    $repository = 'https://github.com/vetitonline/vetit-online.git'
    $branch = 'codex/marketplace-accounts-2026-11-06'
    $remote = Invoke-VetitGit -Arguments @('ls-remote', '--exit-code', '--heads', $repository, "refs/heads/$branch")
    $tip = ($remote -split '\s+')[0]
    if ($tip -notmatch '^[0-9a-f]{40}$') { throw 'Could not verify the GitHub branch tip. No checkout was changed.' }
    Write-Host "Verified GitHub branch: $branch at $tip"
    Write-Host "Recovery checkout and backups will remain untouched: $ExistingCheckout"

    $parent = Split-Path -Parent $ExistingCheckout
    if (-not (Test-Path -LiteralPath $parent -PathType Container)) { throw "Existing checkout parent was not found: $parent" }
    $candidates = @($ExistingCheckout)
    $candidates += @(Get-ChildItem -LiteralPath $parent -Directory -Filter 'vetit*' | ForEach-Object { $_.FullName })
    $checkout = Find-VetitReadyCheckout -Candidates $candidates -Branch $branch -RemoteTip $tip

    $node = Find-VetitNode
    if (-not $node) {
        Write-Host 'Node.js was not found, or its version is outside the supported Node 22.13+/24.3+ release lines.'
        Write-Host 'Install the official Windows x64 Node.js 24 LTS installer from https://nodejs.org/en/download (choose Node 24, with npm and Add to PATH).'
        Write-Host 'After installation, close PowerShell, open it again, and run this same script. No repository files have been changed.'
        return
    }
    Write-Host "Using Node.js: $node"
    if (-not $checkout) {
        # A unique new directory avoids overwriting any checkout or untracked backup.
        $checkout = Join-Path $parent ('vetit-online-phone-testing-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
        if (Test-Path -LiteralPath $checkout) { throw 'New destination already exists. Nothing was overwritten; rerun the script.' }
        Write-Host "Creating a separate feature checkout: $checkout"
        $null = Invoke-VetitGit -Arguments @('clone', '--single-branch', '--branch', $branch, '--', $repository, $checkout)
        $checkout = Find-VetitReadyCheckout -Candidates @($checkout) -Branch $branch -RemoteTip $tip
        if (-not $checkout) { throw 'The branch changed while cloning, or checkout validation failed. The new folder was preserved; rerun to recheck GitHub.' }
    }
    Write-Host "Selected clean checkout: $checkout"
    $launcher = Join-Path $checkout 'scripts\start-phone-preview.mjs'
    if (-not (Test-Path -LiteralPath $launcher -PathType Leaf)) { throw 'The verified branch does not contain the phone launcher. No branch was switched.' }
    $manifest = Get-Content -LiteralPath (Join-Path $checkout 'package.json') -Raw | ConvertFrom-Json
    if ($manifest.packageManager -notmatch '^pnpm@(\d+\.\d+\.\d+)$') { throw 'Repository pnpm version is not exactly pinned.' }
    $pnpmVersion = $Matches[1]
    $tools = Join-Path $env:LOCALAPPDATA ("VetitOnline\tools\pnpm-$pnpmVersion")
    $pnpm = Join-Path $tools 'node_modules\pnpm\bin\pnpm.cjs'
    $oldPath = $env:PATH
    $oldTypeScriptSetup = $env:EXPO_NO_TYPESCRIPT_SETUP
    try {
        $env:PATH = (Split-Path -Parent $node) + [IO.Path]::PathSeparator + $oldPath
        # The repository already has checked TypeScript config. Do not let Expo rewrite it.
        $env:EXPO_NO_TYPESCRIPT_SETUP = '1'
        if (-not (Test-Path -LiteralPath $pnpm -PathType Leaf)) {
            $npm = Join-Path (Split-Path -Parent $node) 'node_modules\npm\bin\npm-cli.js'
            if (-not (Test-Path -LiteralPath $npm -PathType Leaf)) { throw 'This Node installation has no bundled npm. Install official Node 24 with npm, then rerun.' }
            Write-Host "Installing pinned pnpm $pnpmVersion in user-local tools, outside all repositories."
            & $node $npm install --prefix $tools --no-save --package-lock=false --ignore-scripts "pnpm@$pnpmVersion"
            if ($LASTEXITCODE -ne 0) { throw 'User-local pnpm installation failed; repositories remain preserved.' }
        }
        $installedVersion = (& $node $pnpm --version | Out-String).Trim()
        if ($LASTEXITCODE -ne 0 -or $installedVersion -ne $pnpmVersion) { throw 'User-local pnpm version did not match the repository pin.' }
        $expo = Join-Path $checkout 'mobile\node_modules\expo\bin\cli'
        if (-not (Test-Path -LiteralPath $expo -PathType Leaf)) {
            Write-Host 'Installing existing mobile dependencies from the frozen lockfile in the selected clean checkout only.'
            & $node $pnpm --ignore-workspace --dir (Join-Path $checkout 'mobile') install --frozen-lockfile
            if ($LASTEXITCODE -ne 0) { throw 'Frozen mobile install failed. No reset, cleanup or dependency upgrade was attempted.' }
        }
        Write-Host 'Connect laptop and both phones to the SAME private Wi-Fi. Allow Node through Windows Firewall on PRIVATE networks only.'
        Write-Host 'The QR code and Expo link will appear HERE. iPhone: Camera -> Open in Expo Go. Android: Expo Go -> Scan QR code.'
        Write-Host 'If multiple adapters are listed, rerun this script with -WifiAddress YOUR_CURRENT_WIFI_IPV4. Keep this window open; Ctrl+C stops the preview.'
        Push-Location -LiteralPath $checkout
        try {
            & $node $launcher --host $WifiAddress --port $MetroPort
            if ($LASTEXITCODE -ne 0) { throw 'Preview startup failed. Keep the displayed error; all checkout and backup files were preserved.' }
        } finally { Pop-Location }
    } finally {
        $env:PATH = $oldPath
        [Environment]::SetEnvironmentVariable('EXPO_NO_TYPESCRIPT_SETUP', $oldTypeScriptSetup, 'Process')
    }
}

if ($MyInvocation.InvocationName -ne '.') {
    try { Start-VetitPhonePreview } catch { Write-Error $_; exit 1 }
}
