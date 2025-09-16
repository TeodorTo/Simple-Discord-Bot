@echo off
REM Спира само Node.js процеси, които изпълняват index.js в твоя bot folder

set "BOT_PATH=C:\Users\Jupiter Soft HP\Desktop\New folder\Simple-Discord-Bot"

for /f "tokens=2 delims=," %%P in ('tasklist /FI "IMAGENAME eq node.exe" /V /FO CSV ^| findstr /I /C:"%BOT_PATH%\index.js"') do (
    set "PID=%%~P"
    echo Killing PID !PID!
    taskkill /F /PID !PID!
)

pause
