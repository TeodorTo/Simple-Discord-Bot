' start_hidden.vbs
Set WshShell = CreateObject("WScript.Shell")
Dim batPath
batPath = "C:\Users\Jupiter Soft HP\Desktop\New folder\Simple-Discord-Bot\start-bot.bat"
WshShell.Run chr(34) & batPath & chr(34), 0, False
Set WshShell = Nothing