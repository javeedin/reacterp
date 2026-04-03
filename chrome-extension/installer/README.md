# ReactERP Chrome Extension — Installer

Two ways to create the `.exe` installer. Pick whichever is easiest.

---

## Option A — NSIS (Recommended, most professional)

1. Download and install **NSIS** (free, 3 MB):  
   https://nsis.sourceforge.io/Download

2. Right-click `installer.nsi` → **Compile NSIS Script**  
   *(or run: `makensis installer.nsi`)*

3. Output: `ReactERP-Extension-Setup.exe` — a standard Windows installer  
   with a wizard, uninstaller entry in Control Panel, etc.

---

## Option B — PowerShell → EXE (No extra software needed)

1. Open PowerShell in this folder

2. Run:
   ```powershell
   powershell -ExecutionPolicy Bypass -File Build-Exe.ps1
   ```
   This automatically installs `ps2exe` from PSGallery and compiles
   `install.ps1` into `ReactERP-Extension-Setup.exe`.

3. Output: `ReactERP-Extension-Setup.exe` — a standalone GUI installer
   that works on any Windows machine (no PowerShell or .NET required on target)

---

## What the installer does

1. Copies extension files to `%LOCALAPPDATA%\ReactERP\ChromeExtension\`
2. Creates a Desktop shortcut to the folder
3. Registers in Windows "Programs and Features" (so it shows in Control Panel)
4. Offers to open `chrome://extensions` and walks the user through **Load Unpacked**

## What the user does after running the installer (one time only)

1. Open Chrome → `chrome://extensions`
2. Enable **Developer Mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the folder shown (also pasted to clipboard by the installer)
5. Done — pin the extension from Chrome's puzzle-piece icon

> **Why Developer Mode?**  
> Chrome only allows extensions outside the Web Store if Developer Mode is on.  
> Publishing to the Chrome Web Store (~$5 one-time fee) removes this requirement
> and lets users install with a single click from the Store page.
