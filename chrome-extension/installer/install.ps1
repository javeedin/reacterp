# ============================================================
#  ReactERP Chrome Extension — PowerShell Installer
#  Run directly:   powershell -ExecutionPolicy Bypass -File install.ps1
#  Compile to EXE: see Build-Exe.ps1
# ============================================================
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ExtName    = "ReactERP Screen Recorder"
$InstallDir = "$env:LOCALAPPDATA\ReactERP\ChromeExtension"
$RedwoodRed = [System.Drawing.Color]::FromArgb(199, 70, 52)
$White      = [System.Drawing.Color]::White
$LightGray  = [System.Drawing.Color]::FromArgb(247, 247, 247)

# ── Determine source folder (works both as .ps1 and compiled .exe) ────────────
$ScriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path $MyInvocation.MyCommand.Path }
# If running from installer\ subfolder, extension files are one level up
$ExtSource = if (Test-Path "$ScriptDir\..\manifest.json") { Resolve-Path "$ScriptDir\.." }
             elseif (Test-Path "$ScriptDir\manifest.json") { $ScriptDir }
             else { $null }

# ── Welcome Dialog ────────────────────────────────────────────────────────────
function Show-Welcome {
    $form = New-Object System.Windows.Forms.Form
    $form.Text            = $ExtName
    $form.Size            = New-Object System.Drawing.Size(480, 360)
    $form.StartPosition   = "CenterScreen"
    $form.FormBorderStyle = "FixedDialog"
    $form.MaximizeBox     = $false
    $form.MinimizeBox     = $false
    $form.BackColor       = $White

    # Header bar
    $header           = New-Object System.Windows.Forms.Panel
    $header.Dock      = "Top"
    $header.Height    = 80
    $header.BackColor = $RedwoodRed

    $title            = New-Object System.Windows.Forms.Label
    $title.Text       = $ExtName
    $title.Font       = New-Object System.Drawing.Font("Segoe UI", 16, [System.Drawing.FontStyle]::Bold)
    $title.ForeColor  = $White
    $title.Location   = New-Object System.Drawing.Point(20, 12)
    $title.Size       = New-Object System.Drawing.Size(420, 32)

    $sub              = New-Object System.Windows.Forms.Label
    $sub.Text         = "Chrome Extension Installer  ·  v1.0.0"
    $sub.Font         = New-Object System.Drawing.Font("Segoe UI", 9)
    $sub.ForeColor    = [System.Drawing.Color]::FromArgb(255,220,210)
    $sub.Location     = New-Object System.Drawing.Point(20, 46)
    $sub.Size         = New-Object System.Drawing.Size(420, 20)

    $header.Controls.AddRange(@($title, $sub))

    # Features text
    $info             = New-Object System.Windows.Forms.Label
    $info.Text        = @"
This installer will copy the ReactERP Screen Recorder extension
to your computer and guide you through loading it in Chrome.

Features included:
  ✓  Record any web page or Oracle Fusion navigation
  ✓  Automatically capture every click as a numbered step
  ✓  Screenshot at each step
  ✓  Generate User Manual  (HTML — ready to share)
  ✓  Generate UAT Script  (HTML — with pass/fail checkboxes)
  ✓  Password protected side panel

Install location:
  $InstallDir
"@
    $info.Font        = New-Object System.Drawing.Font("Segoe UI", 9)
    $info.ForeColor   = [System.Drawing.Color]::FromArgb(30, 30, 30)
    $info.Location    = New-Object System.Drawing.Point(20, 96)
    $info.Size        = New-Object System.Drawing.Size(440, 200)

    # Buttons
    $btnInstall           = New-Object System.Windows.Forms.Button
    $btnInstall.Text      = "Install"
    $btnInstall.Size      = New-Object System.Drawing.Size(100, 34)
    $btnInstall.Location  = New-Object System.Drawing.Point(260, 288)
    $btnInstall.BackColor = $RedwoodRed
    $btnInstall.ForeColor = $White
    $btnInstall.FlatStyle = "Flat"
    $btnInstall.Font      = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
    $btnInstall.FlatAppearance.BorderSize = 0
    $btnInstall.DialogResult = [System.Windows.Forms.DialogResult]::OK

    $btnCancel           = New-Object System.Windows.Forms.Button
    $btnCancel.Text      = "Cancel"
    $btnCancel.Size      = New-Object System.Drawing.Size(80, 34)
    $btnCancel.Location  = New-Object System.Drawing.Point(360, 288)
    $btnCancel.FlatStyle = "Flat"
    $btnCancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel

    $form.Controls.AddRange(@($header, $info, $btnInstall, $btnCancel))
    $form.AcceptButton = $btnInstall
    $form.CancelButton = $btnCancel

    return $form.ShowDialog()
}

# ── Install files ─────────────────────────────────────────────────────────────
function Install-Extension {
    if (-not $ExtSource) {
        [System.Windows.Forms.MessageBox]::Show(
            "Extension source files not found.`nPlease run this installer from the chrome-extension folder.",
            "Error", "OK", "Error") | Out-Null
        return $false
    }

    try {
        # Create install dir
        if (-not (Test-Path $InstallDir)) {
            New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
        }
        if (-not (Test-Path "$InstallDir\icons")) {
            New-Item -ItemType Directory -Path "$InstallDir\icons" -Force | Out-Null
        }

        # Copy extension files
        $files = @("manifest.json","background.js","content.js","popup.html","popup.js","sidepanel.html","sidepanel.js")
        foreach ($f in $files) {
            $src = Join-Path $ExtSource $f
            if (Test-Path $src) { Copy-Item $src "$InstallDir\$f" -Force }
        }

        # Copy icons
        $iconSrc = Join-Path $ExtSource "icons"
        if (Test-Path $iconSrc) {
            Get-ChildItem "$iconSrc\*.png" | ForEach-Object { Copy-Item $_.FullName "$InstallDir\icons\" -Force }
        }

        # Write path reference file
        @"
ReactERP Chrome Extension
==========================
Installed at: $InstallDir

To load in Chrome:
1. Open chrome://extensions
2. Enable Developer Mode (top-right toggle)
3. Click "Load unpacked"
4. Select this folder: $InstallDir

Version: 1.0.0
Installed: $(Get-Date -Format 'yyyy-MM-dd HH:mm')
"@ | Out-File "$InstallDir\INSTALL_PATH.txt" -Encoding UTF8

        # Register in Windows uninstall list
        $uninstKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\ReactERP-ChromeExt"
        New-Item -Path $uninstKey -Force | Out-Null
        Set-ItemProperty $uninstKey "DisplayName"     "$ExtName (Chrome Extension)"
        Set-ItemProperty $uninstKey "UninstallString" "powershell -Command `"Remove-Item '$InstallDir' -Recurse -Force`""
        Set-ItemProperty $uninstKey "Publisher"       "ReactERP"
        Set-ItemProperty $uninstKey "DisplayVersion"  "1.0.0"
        Set-ItemProperty $uninstKey "InstallLocation" $InstallDir

        # Desktop shortcut to folder (for easy access)
        $shell = New-Object -ComObject WScript.Shell
        $shortcut = $shell.CreateShortcut("$env:USERPROFILE\Desktop\ReactERP Extension Folder.lnk")
        $shortcut.TargetPath  = $InstallDir
        $shortcut.Description = "ReactERP Chrome Extension files"
        $shortcut.Save()

        return $true
    } catch {
        [System.Windows.Forms.MessageBox]::Show("Installation failed:`n$_", "Error", "OK", "Error") | Out-Null
        return $false
    }
}

# ── Success Dialog ────────────────────────────────────────────────────────────
function Show-Success {
    $form = New-Object System.Windows.Forms.Form
    $form.Text            = "$ExtName — Installed!"
    $form.Size            = New-Object System.Drawing.Size(500, 420)
    $form.StartPosition   = "CenterScreen"
    $form.FormBorderStyle = "FixedDialog"
    $form.MaximizeBox     = $false
    $form.BackColor       = $White

    # Green header
    $header           = New-Object System.Windows.Forms.Panel
    $header.Dock      = "Top"
    $header.Height    = 70
    $header.BackColor = [System.Drawing.Color]::FromArgb(29, 123, 77)

    $titleLbl         = New-Object System.Windows.Forms.Label
    $titleLbl.Text    = "✓  Installation Complete!"
    $titleLbl.Font    = New-Object System.Drawing.Font("Segoe UI", 14, [System.Drawing.FontStyle]::Bold)
    $titleLbl.ForeColor = $White
    $titleLbl.Location  = New-Object System.Drawing.Point(16, 18)
    $titleLbl.Size      = New-Object System.Drawing.Size(450, 34)
    $header.Controls.Add($titleLbl)

    # Steps
    $steps = New-Object System.Windows.Forms.Label
    $steps.Text = @"
Now load the extension in Chrome (one-time setup):

  Step 1.  Open Google Chrome

  Step 2.  In the address bar, type:
              chrome://extensions
           and press Enter

  Step 3.  Enable Developer Mode
           (toggle in the top-right corner of the page)

  Step 4.  Click "Load unpacked"

  Step 5.  In the folder picker, select:
              $InstallDir

  Step 6.  Done! Click the puzzle-piece icon in Chrome's toolbar
           and pin "ReactERP Screen Recorder"

A shortcut to the extension folder has been placed on your Desktop.
"@
    $steps.Font       = New-Object System.Drawing.Font("Segoe UI", 9)
    $steps.ForeColor  = [System.Drawing.Color]::FromArgb(20,20,20)
    $steps.Location   = New-Object System.Drawing.Point(16, 80)
    $steps.Size       = New-Object System.Drawing.Size(460, 250)

    # Path box
    $pathBox           = New-Object System.Windows.Forms.TextBox
    $pathBox.Text      = $InstallDir
    $pathBox.ReadOnly  = $true
    $pathBox.Location  = New-Object System.Drawing.Point(16, 336)
    $pathBox.Size      = New-Object System.Drawing.Size(350, 24)
    $pathBox.Font      = New-Object System.Drawing.Font("Consolas", 8)
    $pathBox.BackColor = $LightGray

    $btnCopy           = New-Object System.Windows.Forms.Button
    $btnCopy.Text      = "Copy Path"
    $btnCopy.Size      = New-Object System.Drawing.Size(80, 24)
    $btnCopy.Location  = New-Object System.Drawing.Point(372, 336)
    $btnCopy.FlatStyle = "Flat"
    $btnCopy.Add_Click({ [System.Windows.Forms.Clipboard]::SetText($InstallDir) })

    $btnOpen           = New-Object System.Windows.Forms.Button
    $btnOpen.Text      = "Open Chrome Extensions"
    $btnOpen.Size      = New-Object System.Drawing.Size(180, 34)
    $btnOpen.Location  = New-Object System.Drawing.Point(16, 366)
    $btnOpen.BackColor = [System.Drawing.Color]::FromArgb(5, 114, 206)
    $btnOpen.ForeColor = $White
    $btnOpen.FlatStyle = "Flat"
    $btnOpen.FlatAppearance.BorderSize = 0
    $btnOpen.Font      = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
    $btnOpen.Add_Click({ Start-Process "chrome" "chrome://extensions" -ErrorAction SilentlyContinue })

    $btnClose           = New-Object System.Windows.Forms.Button
    $btnClose.Text      = "Finish"
    $btnClose.Size      = New-Object System.Drawing.Size(80, 34)
    $btnClose.Location  = New-Object System.Drawing.Point(395, 366)
    $btnClose.FlatStyle = "Flat"
    $btnClose.DialogResult = [System.Windows.Forms.DialogResult]::OK

    $form.Controls.AddRange(@($header, $steps, $pathBox, $btnCopy, $btnOpen, $btnClose))
    $form.AcceptButton = $btnClose
    $form.ShowDialog() | Out-Null
}

# ── Entry point ───────────────────────────────────────────────────────────────
$result = Show-Welcome
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
    $ok = Install-Extension
    if ($ok) { Show-Success }
}
