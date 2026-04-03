# ============================================================
#  Build-Exe.ps1  — Compiles install.ps1 into a standalone .exe
#  Run this once on any Windows machine to produce the installer.
#
#  Usage:  powershell -ExecutionPolicy Bypass -File Build-Exe.ps1
# ============================================================

Write-Host ""
Write-Host "  ReactERP Extension — Installer Builder" -ForegroundColor White
Write-Host "  ========================================" -ForegroundColor DarkGray
Write-Host ""

# ── Install ps2exe if not already present ─────────────────────────────────────
if (-not (Get-Command Invoke-PS2EXE -ErrorAction SilentlyContinue)) {
    Write-Host "  Installing ps2exe module..." -ForegroundColor Cyan
    Install-Module ps2exe -Scope CurrentUser -Force -AllowClobber
    Import-Module ps2exe
}

# ── Copy extension files next to install.ps1 for bundling ────────────────────
$ScriptDir = Split-Path $MyInvocation.MyCommand.Path
$ExtRoot   = Resolve-Path "$ScriptDir\.."

$bundle = "$ScriptDir\bundle"
if (Test-Path $bundle) { Remove-Item $bundle -Recurse -Force }
New-Item -ItemType Directory "$bundle\icons" | Out-Null

Write-Host "  Copying extension files..." -ForegroundColor Cyan
Copy-Item "$ExtRoot\manifest.json"    "$bundle\"
Copy-Item "$ExtRoot\background.js"   "$bundle\"
Copy-Item "$ExtRoot\content.js"      "$bundle\"
Copy-Item "$ExtRoot\popup.html"      "$bundle\"
Copy-Item "$ExtRoot\popup.js"        "$bundle\"
Copy-Item "$ExtRoot\sidepanel.html"  "$bundle\"
Copy-Item "$ExtRoot\sidepanel.js"    "$bundle\"
if (Test-Path "$ExtRoot\icons") {
    Copy-Item "$ExtRoot\icons\*.png" "$bundle\icons\" -ErrorAction SilentlyContinue
}

# ── Compile ───────────────────────────────────────────────────────────────────
Write-Host "  Compiling to EXE..." -ForegroundColor Cyan

$exePath = "$ScriptDir\ReactERP-Extension-Setup.exe"

Invoke-PS2EXE `
    -InputFile   "$ScriptDir\install.ps1" `
    -OutputFile  $exePath `
    -Title       "ReactERP Screen Recorder" `
    -Description "Installs ReactERP Screen Recorder Chrome Extension" `
    -Version     "1.0.0.0" `
    -Company     "ReactERP" `
    -Copyright   "2026 ReactERP" `
    -noConsole `
    -requireAdmin:$false

if (Test-Path $exePath) {
    Write-Host ""
    Write-Host "  ✓ Done!  Output: $exePath" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Distribute this file to your users." -ForegroundColor Gray
    Write-Host "  They just double-click it — no PowerShell needed." -ForegroundColor Gray
} else {
    Write-Host "  ✗ Build failed. Check errors above." -ForegroundColor Red
}

# Clean up bundle
Remove-Item $bundle -Recurse -Force -ErrorAction SilentlyContinue
