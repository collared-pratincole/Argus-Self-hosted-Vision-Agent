; installer/add-cli.nsh — NSIS 自定义脚本（极简版）
; 仅负责把 aiir.exe 从 resources/ 复制到 bin/
; PATH 写入由 Electron 应用首次启动时在 main.js 中用 JS 完成（更可控）
; 被 electron-builder 的 build.nsis.include 字段加载

!macro customInstall
  CreateDirectory "$INSTDIR\bin"
  IfFileExists "$INSTDIR\resources\aiir.exe" 0 +3
    CopyFiles /SILENT "$INSTDIR\resources\aiir.exe" "$INSTDIR\bin\aiir.exe"
    Delete "$INSTDIR\resources\aiir.exe"
!macroend

!macro customUnInstall
  Delete "$INSTDIR\bin\aiir.exe"
  RMDir "$INSTDIR\bin"
!macroend
