; Fail explicitly when Windows prevents writing to the chosen destination.
; Silent install callers must receive a failure code, never a false success.
; Use the bundled native process check rather than spawning PowerShell/WMI.
; Never terminate the user's downloads as part of installation or removal.
!macro customCheckAppRunning
  nsProcess::_FindProcess "${APP_EXECUTABLE_FILENAME}"
  Pop $R0
  ${If} $R0 == 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "Please quit DriftFetch from its tray menu, then retry setup." /SD IDOK
    SetErrorLevel 32
    Quit
  ${ElseIf} $R0 != 603
    MessageBox MB_OK|MB_ICONSTOP "Setup could not check whether DriftFetch is running. Windows returned error $R0. Please retry outside the restricted environment." /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
!macroend

; The first installer page is a privacy note for information, not terms to accept.
; (Set here because this macro runs right before the licence page is inserted.)
!macro customWelcomePage
  !define MUI_PAGE_HEADER_TEXT "Privacy note"
  !define MUI_PAGE_HEADER_SUBTEXT "How DriftFetch handles your data."
  !define MUI_LICENSEPAGE_TEXT_TOP "Please read how DriftFetch handles your data."
  !define MUI_LICENSEPAGE_TEXT_BOTTOM "This is for your information; you do not have to accept it to install DriftFetch. DriftFetch's own licence (MIT) and the notices for the programs it includes are installed with the app."
  !define MUI_LICENSEPAGE_BUTTON "$(^NextBtn)"
!macroend

!macro customInit
  ClearErrors
  CreateDirectory "$INSTDIR"
  FileOpen $R0 "$INSTDIR\.current-install-check" w
  ${If} ${Errors}
    MessageBox MB_OK|MB_ICONSTOP "DriftFetch cannot write to the installation folder:$\r$\n$INSTDIR$\r$\n$\r$\nChoose a writable folder or run the installer outside a restricted test environment." /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
  FileClose $R0
  Delete "$INSTDIR\.current-install-check"
!macroend

!macro requireInstalledFile relativeFile
  IfFileExists "$INSTDIR\${relativeFile}" +4 0
    MessageBox MB_OK|MB_ICONSTOP "DriftFetch installation did not complete. Missing file: ${relativeFile}. Please retry the installer." /SD IDOK
    SetErrorLevel 2
    Quit
!macroend

!macro customInstall
  !insertmacro requireInstalledFile "DriftFetch.exe"
  !insertmacro requireInstalledFile "resources\app.asar"
  !insertmacro requireInstalledFile "resources\engines\yt-dlp.exe"
  !insertmacro requireInstalledFile "resources\engines\ffmpeg.exe"
  !insertmacro requireInstalledFile "resources\engines\ffprobe.exe"
  !insertmacro requireInstalledFile "resources\engines\deno.exe"
  !insertmacro requireInstalledFile "resources\engines\gallery-dl.exe"
!macroend
