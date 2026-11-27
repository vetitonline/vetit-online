$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot '..\scripts\Start-VetitPhonePreview.ps1'
$parseErrors = $null
$tokens = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($scriptPath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -ne 0) { throw ($parseErrors | Out-String) }
. $scriptPath

function Assert-Equal($Actual, $Expected, $Message) {
    if ($Actual -ne $Expected) { throw "${Message}: expected '$Expected', got '$Actual'" }
}

$script:VetitGit = (Get-Command git -ErrorAction Stop).Source
$actualHead = Invoke-VetitGit -Arguments @('-C', (Join-Path $PSScriptRoot '..'), 'rev-parse', 'HEAD')
if ($actualHead -notmatch '^[0-9a-f]{40}$') { throw 'Read-only Git invocation failed' }
$caught = $false
try { $null = Invoke-VetitGit -Arguments @('this-is-not-a-git-command') } catch { $caught = $true }
Assert-Equal $caught $true 'Native Git errors must stop instead of falling back'
Write-Host 'PASS: real read-only Git invocation and failure handling'

foreach ($version in @('v22.13.0', '22.22.0', '24.3.0', 'v24.11.1')) {
    Assert-Equal (Test-VetitNodeVersion $version) $true "Supported Node $version"
}
foreach ($version in @('18.20.0', '22.12.0', '24.2.0', '26.0.0', 'invalid')) {
    Assert-Equal (Test-VetitNodeVersion $version) $false "Unsupported Node $version"
}
Write-Host 'PASS: Node compatibility checks (9 cases)'

$root = Join-Path ([IO.Path]::GetTempPath()) ('vetit-bootstrap-tests-' + [guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $root
$script:fakeCheckouts = @{}
$tip = 'a' * 40
$branch = 'codex/marketplace-accounts-2026-11-06'
foreach ($name in @('recovery', 'wrong-repo', 'older', 'dirty', 'ready')) {
    $path = Join-Path $root $name
    $null = New-Item -ItemType Directory -Path (Join-Path $path '.git')
    $script:fakeCheckouts[$path] = @{
        Origin = 'https://github.com/vetitonline/vetit-online.git'
        Branch = $branch; Head = $tip; Status = ''
    }
}
$script:fakeCheckouts[(Join-Path $root 'recovery')].Branch = 'codex/development-readiness-2026-10-21'
$script:fakeCheckouts[(Join-Path $root 'recovery')].Status = '?? recovery-backup.bundle'
$script:fakeCheckouts[(Join-Path $root 'wrong-repo')].Origin = 'https://github.com/example/other.git'
$script:fakeCheckouts[(Join-Path $root 'older')].Head = 'b' * 40
$script:fakeCheckouts[(Join-Path $root 'dirty')].Status = '?? irreplaceable-backup.zip'
$script:gitReads = @()
function Invoke-VetitGit {
    param([string[]]$Arguments)
    if ($Arguments[0] -eq 'ls-remote') { return "$tip`trefs/heads/$branch" }
    if ($Arguments[0] -ne '-C') { throw 'Unexpected Git mutation or request in selection test' }
    $row = $script:fakeCheckouts[$Arguments[1]]
    $command = $Arguments[2..($Arguments.Length - 1)] -join ' '
    $script:gitReads += $command
    switch ($command) {
        'remote get-url origin' { return $row.Origin }
        'branch --show-current' { return $row.Branch }
        'rev-parse HEAD' { return $row.Head }
        'status --porcelain=v1 --untracked-files=all' { return $row.Status }
        default { throw "Unexpected Git command: $command" }
    }
}
$candidates = @('recovery', 'wrong-repo', 'older', 'dirty', 'ready') | ForEach-Object { Join-Path $root $_ }
Assert-Equal (Find-VetitReadyCheckout -Candidates $candidates -Branch $branch -RemoteTip $tip) (Join-Path $root 'ready') 'Choose only the clean exact remote tip'
Assert-Equal (Find-VetitReadyCheckout -Candidates $candidates[0..3] -Branch $branch -RemoteTip $tip) $null 'No unsafe fallback'
Assert-Equal $script:fakeCheckouts[(Join-Path $root 'recovery')].Status '?? recovery-backup.bundle' 'Recovery files preserved'
Assert-Equal $script:fakeCheckouts[(Join-Path $root 'dirty')].Status '?? irreplaceable-backup.zip' 'Untracked files preserved'
Write-Host 'PASS: checkout selection rejects dirty, recovery, wrong-origin and stale checkouts'

$source = Get-Content -LiteralPath $scriptPath -Raw
foreach ($forbidden in @('git reset', 'git clean', 'git stash', 'git checkout', 'Remove-Item', 'Set-ExecutionPolicy', 'Invoke-Expression')) {
    if ($source.Contains($forbidden)) { throw "Forbidden operation: $forbidden" }
}
if (-not $source.Contains('--frozen-lockfile')) { throw 'Missing frozen dependency installation' }
if (-not $source.Contains("`$MyInvocation.InvocationName -ne '.'")) { throw 'Missing safe dot-source guard' }
Write-Host 'PASS: script parses, dot-sources without starting services and contains no destructive commands'

# Exercise the missing-Node path without network, clone, installation or preview startup.
function Get-Command { param($Name, $ErrorAction) return [pscustomobject]@{Source = 'synthetic-git.exe'} }
function Find-VetitNode { return $null }
$ExistingCheckout = Join-Path $root 'recovery'
$before = @(Get-ChildItem -LiteralPath $root -Recurse | ForEach-Object { $_.FullName }) -join "`n"
$previousOs = $env:OS
try {
    $env:OS = 'Windows_NT'
    Start-VetitPhonePreview
} finally { [Environment]::SetEnvironmentVariable('OS', $previousOs, 'Process') }
$after = @(Get-ChildItem -LiteralPath $root -Recurse | ForEach-Object { $_.FullName }) -join "`n"
Assert-Equal $after $before 'Missing Node must not create or change checkouts'
Write-Host 'PASS: missing Node stops safely with official installation instructions'
Write-Host 'All Windows bootstrap checks passed. Test scratch directories were preserved.'
