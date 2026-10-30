; Bộ cài convertSRS cho Windows (NSIS, giao diện MUI2, tiếng Việt).
; Biên dịch bằng scripts/make-installer.js — chạy được trên Linux/macOS/Windows, không cần Wine:
; trình gỡ cài đặt được tạo ngay trên máy người dùng lúc cài (WriteUninstaller).
; Tham số truyền vào: VERSION, APPDIR (thư mục win-unpacked), OUTFILE, ICON

Unicode true
SetCompressor /SOLID lzma
SetCompressorDictSize 64

!define APPNAME "convertSRS"
!define EXENAME "convertSRS.exe"
!define PUBLISHER "Nguyễn Sỹ Quang"
!define PROGID "convertSRS.Markdown"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}"

Name "${APPNAME}"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\Programs\${APPNAME}"
InstallDirRegKey HKCU "Software\${APPNAME}" "InstallLocation"
RequestExecutionLevel user
BrandingText "${APPNAME} ${VERSION}"

VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=0 "ProductName" "${APPNAME}"
VIAddVersionKey /LANG=0 "FileDescription" "Bộ cài ${APPNAME}"
VIAddVersionKey /LANG=0 "CompanyName" "${PUBLISHER}"
VIAddVersionKey /LANG=0 "LegalCopyright" "© 2026 ${PUBLISHER}"
VIAddVersionKey /LANG=0 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=0 "ProductVersion" "${VERSION}"

!include "MUI2.nsh"
!include "FileFunc.nsh"

!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Cài đặt ${APPNAME} ${VERSION}"
!define MUI_WELCOMEPAGE_TEXT "${APPNAME} đọc tài liệu SRS viết bằng Markdown, hiển thị sơ đồ Mermaid và xuất PDF / TXT.$\r$\n$\r$\nSau khi cài, bạn có thể nhấp đúp file .md để mở bằng ${APPNAME}.$\r$\n$\r$\nNhấn Tiếp để tiếp tục."
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXENAME}"
!define MUI_FINISHPAGE_RUN_TEXT "Chạy ${APPNAME}"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Vietnamese"
!insertmacro MUI_LANGUAGE "English"

Function .onInit
  StrCpy $LANGUAGE ${LANG_VIETNAMESE}
FunctionEnd

Function un.onInit
  StrCpy $LANGUAGE ${LANG_VIETNAMESE}
FunctionEnd

; Đóng convertSRS đang chạy trước khi ghi đè / gỡ file
!macro CLOSE_APP
  nsExec::Exec 'taskkill /IM "${EXENAME}" /T /F'
  Pop $0
  Sleep 800
!macroend

Section "convertSRS" SecMain
  SectionIn RO
  !insertmacro CLOSE_APP
  SetOutPath "$INSTDIR"
  ; Cập nhật phiên bản: xoá bản cũ để không còn sót file
  RMDir /r "$INSTDIR\resources"
  RMDir /r "$INSTDIR\locales"
  File /r "${APPDIR}\*.*"

  WriteUninstaller "$INSTDIR\Uninstall ${APPNAME}.exe"
  WriteRegStr HKCU "Software\${APPNAME}" "InstallLocation" "$INSTDIR"

  ; Shortcut
  CreateShortcut "$SMPROGRAMS\${APPNAME}.lnk" "$INSTDIR\${EXENAME}" "" "$INSTDIR\${EXENAME}" 0
  CreateShortcut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\${EXENAME}" "" "$INSTDIR\${EXENAME}" 0

  ; Gắn với file Markdown: hiện trong "Mở bằng"; làm mặc định nếu máy chưa có ứng dụng mặc định cho .md
  WriteRegStr HKCU "Software\Classes\${PROGID}" "" "Tài liệu Markdown"
  WriteRegStr HKCU "Software\Classes\${PROGID}\DefaultIcon" "" "$INSTDIR\${EXENAME},0"
  WriteRegStr HKCU "Software\Classes\${PROGID}\shell\open\command" "" '"$INSTDIR\${EXENAME}" "%1"'
  WriteRegStr HKCU "Software\Classes\Applications\${EXENAME}" "FriendlyAppName" "${APPNAME}"
  WriteRegStr HKCU "Software\Classes\Applications\${EXENAME}\shell\open\command" "" '"$INSTDIR\${EXENAME}" "%1"'
  !macro ASSOC EXT
    WriteRegStr HKCU "Software\Classes\.${EXT}\OpenWithProgids" "${PROGID}" ""
    WriteRegStr HKCU "Software\Classes\Applications\${EXENAME}\SupportedTypes" ".${EXT}" ""
    ReadRegStr $0 HKCU "Software\Classes\.${EXT}" ""
    StrCmp $0 "" 0 +2
      WriteRegStr HKCU "Software\Classes\.${EXT}" "" "${PROGID}"
  !macroend
  !insertmacro ASSOC "md"
  !insertmacro ASSOC "markdown"
  !insertmacro ASSOC "mdown"
  !insertmacro ASSOC "mkd"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'

  ; Gỡ cài đặt trong Settings > Apps
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINSTKEY}" "Publisher" "${PUBLISHER}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\${EXENAME},0"
  WriteRegStr HKCU "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "UninstallString" '"$INSTDIR\Uninstall ${APPNAME}.exe"'
  WriteRegStr HKCU "${UNINSTKEY}" "QuietUninstallString" '"$INSTDIR\Uninstall ${APPNAME}.exe" /S'
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "${UNINSTKEY}" "EstimatedSize" "$0"
SectionEnd

Section "Uninstall"
  !insertmacro CLOSE_APP
  Delete "$SMPROGRAMS\${APPNAME}.lnk"
  Delete "$DESKTOP\${APPNAME}.lnk"
  RMDir /r "$INSTDIR"

  !macro UNASSOC EXT
    DeleteRegValue HKCU "Software\Classes\.${EXT}\OpenWithProgids" "${PROGID}"
    ReadRegStr $0 HKCU "Software\Classes\.${EXT}" ""
    StrCmp $0 "${PROGID}" 0 +2
      DeleteRegValue HKCU "Software\Classes\.${EXT}" ""
  !macroend
  !insertmacro UNASSOC "md"
  !insertmacro UNASSOC "markdown"
  !insertmacro UNASSOC "mdown"
  !insertmacro UNASSOC "mkd"
  DeleteRegKey HKCU "Software\Classes\${PROGID}"
  DeleteRegKey HKCU "Software\Classes\Applications\${EXENAME}"
  DeleteRegKey HKCU "${UNINSTKEY}"
  DeleteRegKey HKCU "Software\${APPNAME}"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  ; Giữ lại dữ liệu người dùng (%APPDATA%\convertSRS: giao diện, tuỳ chọn in…)
SectionEnd
