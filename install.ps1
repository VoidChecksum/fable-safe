# fable-safe — Windows installer (PowerShell)
#
# One-liner:
#   irm https://raw.githubusercontent.com/VoidChecksum/fable-safe/main/install.ps1 | iex
#
# What this does:
#   1. Checks for bun; installs it if missing.
#   2. Checks for git; fails with a helpful message if missing.
#   3. Clones / pulls fable-safe into $InstallDir (%LOCALAPPDATA%\fable-safe by default).
#   4. Runs `bun install`.
#   5. Tries `bun link` for a global `fable-safe` command; falls back to a .cmd wrapper.
#   6. Invokes the setup wizard so you can choose what to wire up.

$ErrorActionPreference = "Stop"
$RepoUrl   = "https://github.com/VoidChecksum/fable-safe.git"
$InstallDir = $env:FABLE_SAFE_DIR ?? "$env:LOCALAPPDATA\fable-safe"

# ── Colour helpers ───────────────────────────────────────────────────────────
function Header { param($s) Write-Host "`n$s" -ForegroundColor Cyan }
function Ok     { param($s) Write-Host "  [OK] $s" -ForegroundColor Green }
function Warn   { param($s) Write-Host "  [!]  $s" -ForegroundColor Yellow }
function Fail   { param($s) Write-Host "`n[ERR] $s" -ForegroundColor Red; exit 1 }

Header "fable-safe — Windows installer"
Header "────────────────────────────────"

# ── 1. git ───────────────────────────────────────────────────────────────────
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Fail "git is required but not found.`nInstall it from https://git-scm.com/download/win and re-run."
}

# ── 2. bun ───────────────────────────────────────────────────────────────────
if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
  Header "bun not found — installing..."
  # Official bun installer for Windows
  irm bun.sh/install.ps1 | iex
  # Reload PATH for this session
  $env:Path = "$env:USERPROFILE\.bun\bin;$env:Path"
  if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
    Fail "bun install succeeded but 'bun' is still not on PATH.`nOpen a new shell and re-run this script."
  }
}
$bunVer = (bun --version 2>&1)
Ok "bun $bunVer"

# ── 3. Clone or update ───────────────────────────────────────────────────────
if (Test-Path "$InstallDir\.git") {
  Header "Updating existing checkout at $InstallDir..."
  git -C $InstallDir pull --ff-only --quiet
  $sha = (git -C $InstallDir rev-parse --short HEAD 2>&1)
  Ok "Updated to $sha"
} else {
  Header "Cloning into $InstallDir..."
  New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
  git clone --quiet --depth 1 $RepoUrl $InstallDir
  $sha = (git -C $InstallDir rev-parse --short HEAD 2>&1)
  Ok "Cloned $sha"
}

# ── 4. Install dependencies ──────────────────────────────────────────────────
Header "Installing dependencies..."
& bun install --cwd $InstallDir --frozen-lockfile --silent
Ok "Dependencies installed"

# ── 5. Global CLI ────────────────────────────────────────────────────────────
Header "Linking global CLI..."
$linkResult = & bun link --cwd $InstallDir 2>&1
$linked = (Get-Command fable-safe -ErrorAction SilentlyContinue) -ne $null
if (-not $linked) {
  # Fallback: create a .cmd wrapper in %USERPROFILE%\.local\bin
  $binDir = "$env:USERPROFILE\.local\bin"
  New-Item -ItemType Directory -Force -Path $binDir | Out-Null
  $wrapperPath = "$binDir\fable-safe.cmd"
  "@echo off`r`nbun run `"$InstallDir\src\cli.ts`" %*" | Set-Content -Path $wrapperPath -Encoding ASCII
  Ok "Wrapper created at $wrapperPath"
  # Check if binDir is on PATH
  $pathDirs = $env:Path -split ";"
  if ($pathDirs -notcontains $binDir) {
    Warn "$binDir is not on your PATH."
    Warn "Add it permanently by running:"
    Warn "  [System.Environment]::SetEnvironmentVariable('Path', `$env:Path + ';$binDir', 'User')"
    # Add for this session
    $env:Path = "$binDir;$env:Path"
    Ok "Added to PATH for this session."
  }
} else {
  Ok "'fable-safe' available globally via bun link"
}

# ── 6. Setup wizard ──────────────────────────────────────────────────────────
Header "Running setup wizard..."
Write-Host ""
& bun run "$InstallDir\src\cli.ts" setup

Write-Host ""
Header "Done. Quick-start:"
Write-Host "  fable-safe `"fs reverse engineer the binary`"   # one-shot rewrite"
Write-Host "  /fs                                             # toggle auto-rewrite in Claude Code"
Write-Host "  fable-safe status                              # check what's installed"
Write-Host "  fable-safe --help                              # all options"
Write-Host ""
