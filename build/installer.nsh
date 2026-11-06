; 朝暮 Morrow · NSIS 安装/卸载定制
; 1) 默认安装到 D:\朝暮（D 盘不存在时退回系统默认目录）
; 2) 卸载时询问是否「纯净卸载」：同时删除本地数据、登录项与相关注册表

!macro preInit
  ${If} ${FileExists} "D:\*.*"
    SetRegView 64
    WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "D:\朝暮"
    WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "D:\朝暮"
  ${EndIf}
!macroend

!macro customUnInstall
  IfSilent skip_clean_uninstall
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "是否同时删除朝暮的所有本地数据？$\r$\n$\r$\n包括日程、设置、备份、开机启动项与相关注册表。$\r$\n选择「否」只卸载程序，保留数据。" \
    IDNO skip_clean_uninstall

  RMDir /r "$APPDATA\朝暮"
  RMDir /r "$APPDATA\日历"
  RMDir /r "$LOCALAPPDATA\朝暮"
  RMDir /r "$LOCALAPPDATA\Programs\朝暮"
  RMDir /r "$LOCALAPPDATA\Temp\朝暮"

  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "朝暮"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Morrow"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "morrow-calendar"

  DeleteRegKey HKCU "Software\朝暮"
  DeleteRegKey HKCU "Software\yaolongda\Morrow"
  DeleteRegKey HKCU "Software\com.yaolongda.morrow"
  DeleteRegKey HKCU "Software\Classes\com.yaolongda.morrow"

  skip_clean_uninstall:
!macroend
