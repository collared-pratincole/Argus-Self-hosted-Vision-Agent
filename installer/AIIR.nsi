; AIIR Windows Installer script (NSIS)
; ----------------------------------------------------
; 用 NSIS 编译此脚本会生成 AIIR-Setup.exe 标准安装包。
; 编译方法（任选其一）：
;   1) 右键此文件 -> Compile NSIS Script
;   2) makensis AIIR.nsi
;   3) 直接运行同目录下的 build_windows.bat（自动调 PyInstaller + NSIS）
; ----------------------------------------------------

!define APP_NAME        "AIIR"
!define APP_PUBLISHER   "AIIR Project"
!define APP_VERSION     "1.0.0"
!define APP_EXE         "AIIR.exe"
!define APP_REGKEY      "Software\AIIR"
!define APP_UNINST_KEY  "Software\Microsoft\Windows\CurrentVersion\Uninstall\AIIR"

; 从文件名提取版本号（可选）：用 ExeVersion 自动读取，这里固定 1.0.0
Name              "${APP_NAME} ${APP_VERSION}"
OutFile           "AIIR-Setup.exe"
Unicode           true
ShowInstDetails   show
ShowUnInstDetails show
RequestExecutionLevel admin
InstallDir        "$PROGRAMFILES64\${APP_NAME}"
InstallDirRegKey  HKLM "${APP_REGKEY}" "InstallDir"

; 现代化 UI
!include "MUI2.nsh"
!define MUI_ICON          "aiir.ico"
!define MUI_UNICON        "aiir.ico"
!define MUI_ABORTWARNING

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE        "LICENSE.txt"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro MUI_LANGUAGE "English"

; ---------- 安装 ----------
Section "AIIR (required)" SecMain
  SectionIn RO
  SetOutPath "$INSTDIR"
  File "AIIR.exe"
  File /nonfatal "aiir.ico"
  File /nonfatal "LICENSE.txt"
  File /nonfatal "README.txt"

  ; 写注册表
  WriteRegStr   HKLM "${APP_REGKEY}"     "InstallDir" "$INSTDIR"
  WriteRegStr   HKLM "${APP_UNINST_KEY}" "DisplayName"     "${APP_NAME}"
  WriteRegStr   HKLM "${APP_UNINST_KEY}" "DisplayVersion"  "${APP_VERSION}"
  WriteRegStr   HKLM "${APP_UNINST_KEY}" "Publisher"       "${APP_PUBLISHER}"
  WriteRegStr   HKLM "${APP_UNINST_KEY}" "DisplayIcon"     "$INSTDIR\${APP_EXE}"
  WriteRegStr   HKLM "${APP_UNINST_KEY}" "UninstallString" "$\"$INSTDIR\uninstall.exe$\""
  WriteRegStr   HKLM "${APP_UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegDWORD HKLM "${APP_UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKLM "${APP_UNINST_KEY}" "NoRepair" 1
  WriteUninstaller "$INSTDIR\uninstall.exe"

  ; 加入系统 PATH（让 AIIR 全局可用）
  EnVar::SetHKLM
  EnVar::AddValue "Path" "$INSTDIR"
  EnVar::Update

  ; 创建开始菜单快捷方式
  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortcut  "$SMPROGRAMS\${APP_NAME}\AIIR 命令行.lnk" "$INSTDIR\${APP_EXE}" "--help"
  CreateShortcut  "$SMPROGRAMS\${APP_NAME}\卸载 AIIR.lnk"   "$INSTDIR\uninstall.exe"

  ; 桌面快捷方式
  CreateShortcut "$DESKTOP\AIIR.lnk" "$INSTDIR\${APP_EXE}" "--help"

  ; 通知 shell PATH 已变更
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGUPDATE} 0 "Environment" /TIMEOUT=5000
SectionEnd

; ---------- 卸载 ----------
Section "Uninstall"
  ; 从 PATH 移除
  EnVar::SetHKLM
  EnVar::DeleteValue "Path" "$INSTDIR"
  EnVar::Update

  Delete "$INSTDIR\${APP_EXE}"
  Delete "$INSTDIR\aiir.ico"
  Delete "$INSTDIR\LICENSE.txt"
  Delete "$INSTDIR\README.txt"
  Delete "$INSTDIR\uninstall.exe"
  RMDir "$INSTDIR"

  Delete "$SMPROGRAMS\${APP_NAME}\AIIR 命令行.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\卸载 AIIR.lnk"
  RMDir  "$SMPROGRAMS\${APP_NAME}"
  Delete "$DESKTOP\AIIR.lnk"

  DeleteRegKey HKLM "${APP_UNINST_KEY}"
  DeleteRegKey HKLM "${APP_REGKEY}"
SectionEnd
