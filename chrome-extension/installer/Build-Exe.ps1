# ============================================================
#  Build-Exe.ps1  — Builds a self-contained installer EXE
#  All extension files are embedded as Base64 inside the EXE
#  so it works standalone with no external files needed.
#
#  Usage:  powershell -ExecutionPolicy Bypass -File Build-Exe.ps1
# ============================================================

Write-Host ""
Write-Host "  ReactERP Extension — Installer Builder" -ForegroundColor White
Write-Host "  ========================================" -ForegroundColor DarkGray
Write-Host ""

# ── Install ps2exe if not already present ────────────────────────────────────
if (-not (Get-Command Invoke-PS2EXE -ErrorAction SilentlyContinue)) {
    Write-Host "  Installing ps2exe module..." -ForegroundColor Cyan
    Install-Module ps2exe -Scope CurrentUser -Force -AllowClobber
    Import-Module ps2exe
}

$ScriptDir = Split-Path $MyInvocation.MyCommand.Path
$ExtRoot   = Resolve-Path "$ScriptDir\.."

# ── Read and Base64-encode every extension file ───────────────────────────────
Write-Host "  Encoding extension files..." -ForegroundColor Cyan

function Get-B64($path) {
    if (Test-Path $path) {
        return [Convert]::ToBase64String([IO.File]::ReadAllBytes($path))
    }
    return ""
}

$files = @{
    "manifest.json"   = Get-B64 "$ExtRoot\manifest.json"
    "background.js"   = Get-B64 "$ExtRoot\background.js"
    "content.js"      = Get-B64 "$ExtRoot\content.js"
    "popup.html"      = Get-B64 "$ExtRoot\popup.html"
    "popup.js"        = Get-B64 "$ExtRoot\popup.js"
    "sidepanel.html"  = Get-B64 "$ExtRoot\sidepanel.html"
    "sidepanel.js"    = Get-B64 "$ExtRoot\sidepanel.js"
}

# Build the $FilesData hashtable literal to embed in the script
$filesLiteral = "@{`n"
foreach ($kv in $files.GetEnumerator()) {
    $filesLiteral += "    '$($kv.Key)' = '$($kv.Value)'`n"
}
$filesLiteral += "}"

# ── Generate the self-contained install script ────────────────────────────────
Write-Host "  Generating self-contained script..." -ForegroundColor Cyan

$generatedScript = @"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

`$ExtName    = "ReactERP Screen Recorder"
`$InstallDir = "`$env:LOCALAPPDATA\ReactERP\ChromeExtension"
`$RedwoodRed = [System.Drawing.Color]::FromArgb(199, 70, 52)
`$White      = [System.Drawing.Color]::White
`$LightGray  = [System.Drawing.Color]::FromArgb(247, 247, 247)

# All extension files embedded as Base64
`$FilesData  = $filesLiteral

function Show-Welcome {
    `$form = New-Object System.Windows.Forms.Form
    `$form.Text            = `$ExtName
    `$form.Size            = New-Object System.Drawing.Size(480, 360)
    `$form.StartPosition   = "CenterScreen"
    `$form.FormBorderStyle = "FixedDialog"
    `$form.MaximizeBox     = `$false
    `$form.MinimizeBox     = `$false
    `$form.BackColor       = `$White

    `$header           = New-Object System.Windows.Forms.Panel
    `$header.Dock      = "Top"
    `$header.Height    = 80
    `$header.BackColor = `$RedwoodRed

    `$title            = New-Object System.Windows.Forms.Label
    `$title.Text       = `$ExtName
    `$title.Font       = New-Object System.Drawing.Font("Segoe UI", 16, [System.Drawing.FontStyle]::Bold)
    `$title.ForeColor  = `$White
    `$title.Location   = New-Object System.Drawing.Point(20, 12)
    `$title.Size       = New-Object System.Drawing.Size(420, 32)

    `$sub              = New-Object System.Windows.Forms.Label
    `$sub.Text         = "Chrome Extension Installer  v1.0.0"
    `$sub.Font         = New-Object System.Drawing.Font("Segoe UI", 9)
    `$sub.ForeColor    = [System.Drawing.Color]::FromArgb(255,220,210)
    `$sub.Location     = New-Object System.Drawing.Point(20, 46)
    `$sub.Size         = New-Object System.Drawing.Size(420, 20)
    `$header.Controls.AddRange(@(`$title, `$sub))

    `$info             = New-Object System.Windows.Forms.Label
    `$info.Text        = "This installer will copy the ReactERP Screen Recorder extension`nto your computer and guide you through loading it in Chrome.`n`nFeatures:`n  Record any web page or Oracle Fusion navigation`n  Automatically capture every click as a numbered step`n  Screenshot at each step`n  Generate User Manual (HTML - ready to share)`n  Generate UAT Script (HTML - with pass/fail checkboxes)`n  Password protected side panel`n`nInstall location:`n  `$InstallDir"
    `$info.Font        = New-Object System.Drawing.Font("Segoe UI", 9)
    `$info.ForeColor   = [System.Drawing.Color]::FromArgb(30,30,30)
    `$info.Location    = New-Object System.Drawing.Point(20, 96)
    `$info.Size        = New-Object System.Drawing.Size(440, 200)

    `$btnInstall           = New-Object System.Windows.Forms.Button
    `$btnInstall.Text      = "Install"
    `$btnInstall.Size      = New-Object System.Drawing.Size(100, 34)
    `$btnInstall.Location  = New-Object System.Drawing.Point(260, 290)
    `$btnInstall.BackColor = `$RedwoodRed
    `$btnInstall.ForeColor = `$White
    `$btnInstall.FlatStyle = "Flat"
    `$btnInstall.Font      = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
    `$btnInstall.FlatAppearance.BorderSize = 0
    `$btnInstall.DialogResult = [System.Windows.Forms.DialogResult]::OK

    `$btnCancel           = New-Object System.Windows.Forms.Button
    `$btnCancel.Text      = "Cancel"
    `$btnCancel.Size      = New-Object System.Drawing.Size(80, 34)
    `$btnCancel.Location  = New-Object System.Drawing.Point(370, 290)
    `$btnCancel.FlatStyle = "Flat"
    `$btnCancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel

    `$form.Controls.AddRange(@(`$header, `$info, `$btnInstall, `$btnCancel))
    `$form.AcceptButton = `$btnInstall
    `$form.CancelButton = `$btnCancel
    return `$form.ShowDialog()
}

function Install-Extension {
    try {
        if (-not (Test-Path `$InstallDir))       { New-Item -ItemType Directory -Path `$InstallDir -Force | Out-Null }
        if (-not (Test-Path "`$InstallDir\icons")) { New-Item -ItemType Directory -Path "`$InstallDir\icons" -Force | Out-Null }

        # Write each embedded file
        foreach (`$kv in `$FilesData.GetEnumerator()) {
            if (`$kv.Value -ne "") {
                `$bytes = [Convert]::FromBase64String(`$kv.Value)
                [IO.File]::WriteAllBytes("`$InstallDir\`$(`$kv.Key)", `$bytes)
            }
        }

        # Path reference file
        "ReactERP Chrome Extension`nInstalled at: `$InstallDir`n`nTo load in Chrome:`n1. Open chrome://extensions`n2. Enable Developer Mode (top-right toggle)`n3. Click Load unpacked`n4. Select: `$InstallDir" |
            Out-File "`$InstallDir\INSTALL_PATH.txt" -Encoding UTF8

        # Register in Programs & Features
        `$key = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\ReactERP-ChromeExt"
        New-Item -Path `$key -Force | Out-Null
        Set-ItemProperty `$key "DisplayName"     "ReactERP Screen Recorder (Chrome Extension)"
        Set-ItemProperty `$key "UninstallString" "powershell -Command `"Remove-Item '`$InstallDir' -Recurse -Force`""
        Set-ItemProperty `$key "Publisher"       "ReactERP"
        Set-ItemProperty `$key "DisplayVersion"  "1.0.0"
        Set-ItemProperty `$key "InstallLocation" `$InstallDir

        # Desktop shortcut to folder
        `$shell = New-Object -ComObject WScript.Shell
        `$sc = `$shell.CreateShortcut("`$env:USERPROFILE\Desktop\ReactERP Extension Folder.lnk")
        `$sc.TargetPath = `$InstallDir
        `$sc.Save()

        return `$true
    } catch {
        [System.Windows.Forms.MessageBox]::Show("Installation failed:`n`$_","Error","OK","Error") | Out-Null
        return `$false
    }
}

function Show-Success {
    `$form = New-Object System.Windows.Forms.Form
    `$form.Text            = "`$ExtName - Installed!"
    `$form.Size            = New-Object System.Drawing.Size(500, 430)
    `$form.StartPosition   = "CenterScreen"
    `$form.FormBorderStyle = "FixedDialog"
    `$form.MaximizeBox     = `$false
    `$form.BackColor       = `$White

    `$header           = New-Object System.Windows.Forms.Panel
    `$header.Dock      = "Top"
    `$header.Height    = 70
    `$header.BackColor = [System.Drawing.Color]::FromArgb(29,123,77)

    `$titleLbl         = New-Object System.Windows.Forms.Label
    `$titleLbl.Text    = "Installation Complete!"
    `$titleLbl.Font    = New-Object System.Drawing.Font("Segoe UI", 14, [System.Drawing.FontStyle]::Bold)
    `$titleLbl.ForeColor = `$White
    `$titleLbl.Location  = New-Object System.Drawing.Point(16, 18)
    `$titleLbl.Size      = New-Object System.Drawing.Size(460, 34)
    `$header.Controls.Add(`$titleLbl)

    `$steps = New-Object System.Windows.Forms.Label
    `$steps.Text = "Now load the extension in Chrome (one-time setup):`n`n  Step 1.  Open Google Chrome`n`n  Step 2.  In the address bar type:  chrome://extensions`n           and press Enter`n`n  Step 3.  Enable Developer Mode`n           (toggle in the top-right corner)`n`n  Step 4.  Click 'Load unpacked'`n`n  Step 5.  Select the folder shown below`n`n  Step 6.  Done! Pin 'ReactERP Screen Recorder' from`n           Chrome's puzzle-piece icon in the toolbar"
    `$steps.Font      = New-Object System.Drawing.Font("Segoe UI", 9)
    `$steps.ForeColor = [System.Drawing.Color]::FromArgb(20,20,20)
    `$steps.Location  = New-Object System.Drawing.Point(16, 80)
    `$steps.Size      = New-Object System.Drawing.Size(460, 255)

    `$pathBox          = New-Object System.Windows.Forms.TextBox
    `$pathBox.Text     = `$InstallDir
    `$pathBox.ReadOnly = `$true
    `$pathBox.Location = New-Object System.Drawing.Point(16, 342)
    `$pathBox.Size     = New-Object System.Drawing.Size(350, 24)
    `$pathBox.Font     = New-Object System.Drawing.Font("Consolas", 8)
    `$pathBox.BackColor = `$LightGray

    `$btnCopy          = New-Object System.Windows.Forms.Button
    `$btnCopy.Text     = "Copy Path"
    `$btnCopy.Size     = New-Object System.Drawing.Size(80, 24)
    `$btnCopy.Location = New-Object System.Drawing.Point(372, 342)
    `$btnCopy.FlatStyle = "Flat"
    `$btnCopy.Add_Click({ [System.Windows.Forms.Clipboard]::SetText(`$InstallDir) })

    `$btnOpen          = New-Object System.Windows.Forms.Button
    `$btnOpen.Text     = "Open Chrome Extensions"
    `$btnOpen.Size     = New-Object System.Drawing.Size(180, 34)
    `$btnOpen.Location = New-Object System.Drawing.Point(16, 376)
    `$btnOpen.BackColor = [System.Drawing.Color]::FromArgb(5,114,206)
    `$btnOpen.ForeColor = `$White
    `$btnOpen.FlatStyle = "Flat"
    `$btnOpen.FlatAppearance.BorderSize = 0
    `$btnOpen.Font     = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
    `$btnOpen.Add_Click({ Start-Process "chrome" "chrome://extensions" -ErrorAction SilentlyContinue })

    `$btnClose          = New-Object System.Windows.Forms.Button
    `$btnClose.Text     = "Finish"
    `$btnClose.Size     = New-Object System.Drawing.Size(80, 34)
    `$btnClose.Location = New-Object System.Drawing.Point(400, 376)
    `$btnClose.FlatStyle = "Flat"
    `$btnClose.DialogResult = [System.Windows.Forms.DialogResult]::OK

    `$form.Controls.AddRange(@(`$header, `$steps, `$pathBox, `$btnCopy, `$btnOpen, `$btnClose))
    `$form.AcceptButton = `$btnClose
    `$form.ShowDialog() | Out-Null
}

# Entry point
`$result = Show-Welcome
if (`$result -eq [System.Windows.Forms.DialogResult]::OK) {
    `$ok = Install-Extension
    if (`$ok) { Show-Success }
}
"@

# ── Write the generated script to a temp file and compile ─────────────────────
$tempScript = "$ScriptDir\_generated_install.ps1"
$generatedScript | Out-File $tempScript -Encoding UTF8

Write-Host "  Compiling to EXE (all files embedded)..." -ForegroundColor Cyan

$exePath = "$ScriptDir\ReactERP-Extension-Setup.exe"

Invoke-PS2EXE `
    -InputFile   $tempScript `
    -OutputFile  $exePath `
    -Title       "ReactERP Screen Recorder" `
    -Description "Installs ReactERP Screen Recorder Chrome Extension" `
    -Version     "1.0.0.0" `
    -Company     "ReactERP" `
    -noConsole `
    -requireAdmin:$false

# Clean up temp script
Remove-Item $tempScript -Force -ErrorAction SilentlyContinue

if (Test-Path $exePath) {
    Write-Host ""
    Write-Host "  Done!  Output: $exePath" -ForegroundColor Green
    Write-Host "  Distribute this single EXE - no other files needed." -ForegroundColor Gray
    Write-Host ""
} else {
    Write-Host "  Build failed. Check errors above." -ForegroundColor Red
}
