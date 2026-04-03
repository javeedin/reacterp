; ============================================================
;  ReactERP Chrome Extension — NSIS Installer Script
;  Compile: makensis installer.nsi  → ReactERP-Extension-Setup.exe
;  Download NSIS free: https://nsis.sourceforge.io/
; ============================================================

!include "MUI2.nsh"
!include "LogicLib.nsh"

; ── General ──────────────────────────────────────────────────────────────────
Name                "ReactERP Screen Recorder"
OutFile             "ReactERP-Extension-Setup.exe"
InstallDir          "$LOCALAPPDATA\ReactERP\ChromeExtension"
InstallDirRegKey    HKCU "Software\ReactERP\ChromeExtension" "InstallDir"
RequestExecutionLevel user
Unicode             True
SetCompressor       lzma

; ── Version info (shows in Properties → Details) ─────────────────────────────
VIProductVersion    "1.0.0.0"
VIAddVersionKey     "ProductName"      "ReactERP Screen Recorder"
VIAddVersionKey     "ProductVersion"   "1.0.0"
VIAddVersionKey     "FileDescription"  "ReactERP Chrome Extension Installer"
VIAddVersionKey     "CompanyName"      "ReactERP"
VIAddVersionKey     "LegalCopyright"   "© 2026 ReactERP"

; ── MUI Pages ────────────────────────────────────────────────────────────────
!define MUI_ICON              "..\icons\icon48.png"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "ReactERP Screen Recorder"
!define MUI_WELCOMEPAGE_TEXT  "This wizard will install the ReactERP Screen Recorder extension for Google Chrome.$\r$\n$\r$\nFeatures:$\r$\n  • Record any screen / Oracle Fusion navigation$\r$\n  • Auto-capture each click and step$\r$\n  • Generate User Manuals (HTML)$\r$\n  • Generate UAT Scripts (HTML)$\r$\n  • Password protected$\r$\n$\r$\nClick Next to continue."

!define MUI_FINISHPAGE_TITLE  "Installation Complete!"
!define MUI_FINISHPAGE_TEXT   "ReactERP Screen Recorder has been installed.$\r$\n$\r$\nTo activate in Chrome:$\r$\n  1. Open Chrome$\r$\n  2. Go to chrome://extensions$\r$\n  3. Enable Developer mode (top right toggle)$\r$\n  4. Click 'Load unpacked'$\r$\n  5. Select: $INSTDIR$\r$\n$\r$\nChrome will remember this — you only do this once."
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT  "Open Chrome Extensions page now"
!define MUI_FINISHPAGE_RUN_FUNCTION "OpenChromeExtensions"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

; ── Installer ─────────────────────────────────────────────────────────────────
Section "Chrome Extension" SEC_EXT

  SetOutPath "$INSTDIR"

  ; Copy all extension files
  File "..\manifest.json"
  File "..\background.js"
  File "..\content.js"
  File "..\popup.html"
  File "..\popup.js"
  File "..\sidepanel.html"
  File "..\sidepanel.js"

  ; Copy icons
  SetOutPath "$INSTDIR\icons"
  File /nonfatal "..\icons\*.png"

  ; Save install dir
  WriteRegStr HKCU "Software\ReactERP\ChromeExtension" "InstallDir" "$INSTDIR"

  ; Write uninstaller
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  ; Add to Programs & Features (Control Panel)
  WriteRegStr   HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ReactERP-ChromeExt" \
                "DisplayName"     "ReactERP Screen Recorder (Chrome Extension)"
  WriteRegStr   HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ReactERP-ChromeExt" \
                "UninstallString" "$INSTDIR\Uninstall.exe"
  WriteRegStr   HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ReactERP-ChromeExt" \
                "Publisher"       "ReactERP"
  WriteRegStr   HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ReactERP-ChromeExt" \
                "DisplayVersion"  "1.0.0"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ReactERP-ChromeExt" \
                "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ReactERP-ChromeExt" \
                "NoRepair" 1

  ; Create a desktop shortcut to the install folder (for easy Load Unpacked)
  CreateShortcut "$DESKTOP\ReactERP Extension Folder.lnk" "$INSTDIR" "" "$INSTDIR" 0

  ; Show install path in a desktop text file for reference
  FileOpen  $0 "$INSTDIR\INSTALL_PATH.txt" w
  FileWrite $0 "ReactERP Chrome Extension installed at:$\r$\n"
  FileWrite $0 "$INSTDIR$\r$\n$\r$\n"
  FileWrite $0 "To load in Chrome:$\r$\n"
  FileWrite $0 "1. Open chrome://extensions$\r$\n"
  FileWrite $0 "2. Enable Developer Mode (toggle top-right)$\r$\n"
  FileWrite $0 "3. Click 'Load unpacked'$\r$\n"
  FileWrite $0 "4. Select this folder: $INSTDIR$\r$\n"
  FileClose $0

SectionEnd

; ── Finish page action ────────────────────────────────────────────────────────
Function OpenChromeExtensions
  ; Try to find Chrome and open extensions page
  ReadRegStr $0 HKCU "Software\Google\Chrome\BLBeacon" "version"
  ${If} $0 != ""
    ; Chrome found via registry — open it
    ExecShell "open" "chrome://extensions"
  ${Else}
    ; Fallback — just open extensions URL which Windows will handle
    ExecShell "open" "chrome://extensions"
  ${EndIf}

  ; Also show a message box with the path
  MessageBox MB_ICONINFORMATION|MB_OK \
    "Chrome Extensions page is opening.$\r$\n$\r$\nIn Chrome:$\r$\n  1. Enable Developer mode (top-right toggle)$\r$\n  2. Click 'Load unpacked'$\r$\n  3. Select folder:$\r$\n     $INSTDIR$\r$\n$\r$\nA shortcut to this folder is on your Desktop."
FunctionEnd

; ── Uninstaller ───────────────────────────────────────────────────────────────
Section "Uninstall"
  Delete "$INSTDIR\manifest.json"
  Delete "$INSTDIR\background.js"
  Delete "$INSTDIR\content.js"
  Delete "$INSTDIR\popup.html"
  Delete "$INSTDIR\popup.js"
  Delete "$INSTDIR\sidepanel.html"
  Delete "$INSTDIR\sidepanel.js"
  Delete "$INSTDIR\INSTALL_PATH.txt"
  Delete "$INSTDIR\icons\*.png"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir  "$INSTDIR\icons"
  RMDir  "$INSTDIR"
  Delete "$DESKTOP\ReactERP Extension Folder.lnk"
  DeleteRegKey HKCU "Software\ReactERP\ChromeExtension"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ReactERP-ChromeExt"
  MessageBox MB_ICONINFORMATION|MB_OK "ReactERP Screen Recorder has been removed.$\r$\nRemember to remove it from Chrome's extension list too."
SectionEnd
