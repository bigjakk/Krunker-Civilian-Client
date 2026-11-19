# Included before MUI2/nsDialogs are loaded, so pages and functions must stay
# inside the custom* macros (electron-builder expands them after those includes).

!ifndef BUILD_UNINSTALLER
  !define MUI_FINISHPAGE_LINK "Krunker Civilian Client on GitHub"
  !define MUI_FINISHPAGE_LINK_LOCATION "https://github.com/bigjakk/Krunker-Civilian-Client"

  !macro customWelcomePage
    !insertmacro skipPageIfUpdated
    !define MUI_WELCOMEPAGE_TITLE "Krunker Civilian Client"
    !define MUI_WELCOMEPAGE_TEXT "Open-source Krunker client with uncapped FPS, resource swapper, matchmaker filters and userscripts.$\r$\n$\r$\nClick Next to install."
    !insertmacro MUI_PAGE_WELCOME
  !macroend

  # Updates keep the existing install's mode; with both kinds installed the page still asks
  !macro customInstallMode
    ${if} ${isUpdated}
    ${andIf} $hasPerUserInstallation != $hasPerMachineInstallation
      ${if} $hasPerUserInstallation == "1"
        StrCpy $isForceCurrentInstall "1"
      ${else}
        StrCpy $isForceMachineInstall "1"
      ${endIf}
    ${endIf}
  !macroend

  !macro hideDlgItem PARENT ID
    GetDlgItem $0 ${PARENT} ${ID}
    ShowWindow $0 ${SW_HIDE}
  !macroend

  # The hook just before the progress page: on updates that page becomes a small window styled like the splash
  !macro customPageAfterChangeDir
    !define MUI_PAGE_CUSTOMFUNCTION_SHOW updateProgressShow

    Function updateProgressShow
      ${ifNot} ${isUpdated}
        Return
      ${endIf}
      Push $0
      Push $1
      Push $2
      Push $3
      Push $4
      Push $5
      Push $6
      Push $R0

      ShowWindow $HWNDPARENT ${SW_HIDE}
      SendMessage $HWNDPARENT ${WM_SETTEXT} 0 "STR:Updating ${PRODUCT_NAME}"
      !insertmacro hideDlgItem $HWNDPARENT 1
      !insertmacro hideDlgItem $HWNDPARENT 2
      !insertmacro hideDlgItem $HWNDPARENT 3
      !insertmacro hideDlgItem $HWNDPARENT 1028
      !insertmacro hideDlgItem $HWNDPARENT 1034
      !insertmacro hideDlgItem $HWNDPARENT 1035
      !insertmacro hideDlgItem $HWNDPARENT 1036
      !insertmacro hideDlgItem $HWNDPARENT 1037
      !insertmacro hideDlgItem $HWNDPARENT 1038
      !insertmacro hideDlgItem $HWNDPARENT 1039
      !insertmacro hideDlgItem $HWNDPARENT 1046
      !insertmacro hideDlgItem $HWNDPARENT 1256
      SetCtlColors $HWNDPARENT 0xE2E2E2 0x0B0B10

      # Borderless 420x124, centred on the monitor's work area
      System::Call 'user32::GetWindowLongW(p $HWNDPARENT, i -16) i .r0'
      IntOp $0 $0 & 0xFF30FFFF
      System::Call 'user32::SetWindowLongW(p $HWNDPARENT, i -16, i r0)'
      System::Call 'user32::GetWindowLongW(p $HWNDPARENT, i -20) i .r0'
      IntOp $0 $0 & 0xFFFDFCFE
      System::Call 'user32::SetWindowLongW(p $HWNDPARENT, i -20, i r0)'
      System::Call 'user32::GetClassLongW(p $HWNDPARENT, i -26) i .r0'
      IntOp $0 $0 | 0x20000
      System::Call 'user32::SetClassLongW(p $HWNDPARENT, i -26, i r0)'
      System::Call 'user32::MonitorFromWindow(p $HWNDPARENT, i 2) p .r1'
      System::Call '*(i 40, i 0, i 0, i 0, i 0, i 0, i 0, i 0, i 0, i 0) p .r2'
      System::Call 'user32::GetMonitorInfoW(p r1, p r2)'
      System::Call '*$2(i, i, i, i, i, i .r3, i .r4, i .r5, i .r6)'
      System::Free $2
      IntOp $3 $3 + $5
      IntOp $3 $3 - 420
      IntOp $3 $3 / 2
      IntOp $4 $4 + $6
      IntOp $4 $4 - 124
      IntOp $4 $4 / 2
      System::Call 'user32::SetWindowPos(p $HWNDPARENT, p 0, i r3, i r4, i 420, i 124, i 0x24)'
      System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 33, *i 2, i 4)'

      FindWindow $R0 "#32770" "" $HWNDPARENT
      SetCtlColors $R0 0xE2E2E2 0x0B0B10
      System::Call 'user32::SetWindowPos(p R0, p 0, i 0, i 0, i 420, i 124, i 0x4)'
      !insertmacro hideDlgItem $R0 1006
      !insertmacro hideDlgItem $R0 1016
      !insertmacro hideDlgItem $R0 1027

      # Flat green bar on a dim track, like the splash's
      GetDlgItem $1 $R0 1004
      System::Call 'uxtheme::SetWindowTheme(p r1, w " ", w " ")'
      System::Call 'user32::GetWindowLongW(p r1, i -16) i .r0'
      IntOp $0 $0 & 0xFF7FFFFF
      IntOp $0 $0 | 1
      System::Call 'user32::SetWindowLongW(p r1, i -16, i r0)'
      System::Call 'user32::GetWindowLongW(p r1, i -20) i .r0'
      IntOp $0 $0 & 0xFFFDFDFF
      System::Call 'user32::SetWindowLongW(p r1, i -20, i r0)'
      SendMessage $1 ${PBM_SETBARCOLOR} 0 0x9DE52E
      SendMessage $1 ${PBM_SETBKCOLOR} 0 0x312D2D
      System::Call 'user32::SetWindowPos(p r1, p 0, i 24, i 96, i 372, i 4, i 0x24)'

      System::Call 'kernel32::GetModuleHandleW(p 0) p .r2'
      System::Call 'user32::LoadImageW(p r2, p 103, i 1, i 48, i 48, i 0) p .r3'
      System::Call 'user32::CreateWindowExW(i 0, w "STATIC", p 0, i 0x50000003, i 24, i 24, i 48, i 48, p R0, p 0, p 0, p 0) p .r1'
      SendMessage $1 ${STM_SETICON} $3 0
      SetCtlColors $1 0xE2E2E2 0x0B0B10

      CreateFont $2 "Segoe UI" 12 600
      System::Call 'user32::CreateWindowExW(i 0, w "STATIC", p 0, i 0x50004080, i 88, i 27, i 310, i 24, p R0, p 0, p 0, p 0) p .r1'
      SendMessage $1 ${WM_SETFONT} $2 1
      SendMessage $1 ${WM_SETTEXT} 0 "STR:Updating ${PRODUCT_NAME}"
      SetCtlColors $1 0xE2E2E2 0x0B0B10

      CreateFont $2 "Segoe UI" 9 400
      System::Call 'user32::CreateWindowExW(i 0, w "STATIC", p 0, i 0x50004080, i 88, i 54, i 310, i 18, p R0, p 0, p 0, p 0) p .r1'
      SendMessage $1 ${WM_SETFONT} $2 1
      SendMessage $1 ${WM_SETTEXT} 0 "STR:Installing v${VERSION}. The client reopens when it's done."
      SetCtlColors $1 0x858588 0x0B0B10

      ShowWindow $HWNDPARENT ${SW_SHOW}
      Pop $R0
      Pop $6
      Pop $5
      Pop $4
      Pop $3
      Pop $2
      Pop $1
      Pop $0
    FunctionEnd
  !macroend

  # Updates reopen the client and exit here instead of showing the finish page
  !macro customInstall
    ${if} ${isUpdated}
      HideWindow
      ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "--updated"
      !insertmacro quitSuccess
    ${endIf}
  !macroend
!endif

!ifdef BUILD_UNINSTALLER
  Var unDeleteSettings
  Var unDeleteContent
  Var unDeleteSettingsBox
  Var unDeleteContentBox

  !macro customUnWelcomePage
    UninstPage custom un.removalPageCreate un.removalPageLeave

    Function un.removalPageCreate
      !insertmacro MUI_HEADER_TEXT "Uninstall ${PRODUCT_NAME}" "Choose what to remove"
      nsDialogs::Create 1018
      Pop $0
      ${NSD_CreateLabel} 0 0 100% 28u "${PRODUCT_NAME} will be uninstalled. Your settings and files are kept unless selected below."
      Pop $0
      ${NSD_CreateCheckbox} 0 40u 100% 12u "Delete settings, client stats, saved accounts and logs"
      Pop $unDeleteSettingsBox
      ${NSD_CreateCheckbox} 0 56u 100% 12u "Delete swapper files, userscripts and screenshots"
      Pop $unDeleteContentBox
      nsDialogs::Show
    FunctionEnd

    Function un.removalPageLeave
      ${NSD_GetState} $unDeleteSettingsBox $unDeleteSettings
      ${NSD_GetState} $unDeleteContentBox $unDeleteContent
    FunctionEnd
  !macroend

  !macro customUnInstall
    ${ifNot} ${isUpdated}
      DeleteRegKey HKCU "Software\Classes\kcc"
    ${endIf}
    ${if} $unDeleteSettings == 1
    ${orIf} $unDeleteContent == 1
      # electron user data is always per-user
      ${if} $installMode == "all"
        SetShellVarContext current
      ${endIf}
      ${if} $unDeleteSettings == 1
      ${andIf} $unDeleteContent == 1
        RMDir /r "$APPDATA\${APP_PACKAGE_NAME}"
      ${elseIf} $unDeleteContent == 1
        RMDir /r "$APPDATA\${APP_PACKAGE_NAME}\Krunker Civilian Client"
      ${else}
        # settings only: keep the user-content subfolder, remove the rest
        FindFirst $R1 $R2 "$APPDATA\${APP_PACKAGE_NAME}\*.*"
        ${Do}
          ${if} $R2 == ""
            ${ExitDo}
          ${endIf}
          ${if} $R2 != "."
          ${andIf} $R2 != ".."
          ${andIf} $R2 != "Krunker Civilian Client"
            ${if} ${FileExists} "$APPDATA\${APP_PACKAGE_NAME}\$R2\*.*"
              RMDir /r "$APPDATA\${APP_PACKAGE_NAME}\$R2"
            ${else}
              Delete "$APPDATA\${APP_PACKAGE_NAME}\$R2"
            ${endIf}
          ${endIf}
          FindNext $R1 $R2
        ${Loop}
        FindClose $R1
      ${endIf}
      ${if} $installMode == "all"
        SetShellVarContext all
      ${endIf}
    ${endIf}
  !macroend
!endif
