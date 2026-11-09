@echo off
chcp 65001 >nul
echo ============================================
echo   بناء مثبّت Khiam Ops (KhiamOps-Setup.exe)
echo ============================================
echo.
if not exist "%~dp0dist\KhiamAgent.exe" (
  echo ! لم يُبنَ KhiamAgent.exe بعد — شغّل build_exe.bat الأول.
  pause
  exit /b 1
)
set "ISCC=%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" set "ISCC=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" (
  echo ! Inno Setup غير مثبّت. ثبّته من: https://jrsoftware.org/isdl.php
  echo   او عبر:  winget install JRSoftware.InnoSetup
  pause
  exit /b 1
)
"%ISCC%" "%~dp0khiam_installer.iss"
echo.
echo تمّ:  %~dp0Output\KhiamOps-Setup.exe
pause
