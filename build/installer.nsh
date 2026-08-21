# Included before MUI2/nsDialogs are loaded, so pages and functions must stay
# inside the custom* macros (electron-builder expands them after those includes).

!ifndef BUILD_UNINSTALLER
  !define MUI_FINISHPAGE_LINK "Krunker Civilian Client on GitHub"
  !define MUI_FINISHPAGE_LINK_LOCATION "https://github.com/bigjakk/Krunker-Civilian-Client"

  !macro customWelcomePage
    !define MUI_WELCOMEPAGE_TITLE "Krunker Civilian Client"
    !define MUI_WELCOMEPAGE_TEXT "Open-source Krunker client with uncapped FPS, resource swapper, matchmaker filters and userscripts.$\r$\n$\r$\nClick Next to install."
    !insertmacro MUI_PAGE_WELCOME
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
      ${NSD_CreateCheckbox} 0 40u 100% 12u "Delete settings, saved accounts and logs"
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
