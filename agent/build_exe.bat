@echo off
chcp 65001 >nul
echo ============================================
echo   بناء KhiamAgent.exe (برنامج ويندوز مستقل)
echo ============================================
echo.
where python >nul 2>nul
if errorlevel 1 (
  echo ! ثبّت Python اولا من https://python.org ثم اعد تشغيل هذا الملف.
  pause
  exit /b 1
)
echo [1/2] تثبيت PyInstaller + مكتبات اللقطات...
python -m pip install --upgrade pyinstaller mss pillow
echo.
echo [2/2] بناء البرنامج...
python -m PyInstaller --onefile --windowed --name KhiamAgent --distpath "%~dp0dist" --workpath "%~dp0build_tmp" --specpath "%~dp0build_tmp" "%~dp0khiam_agent.py"
echo.
echo ============================================
echo   تمّ:  %~dp0dist\KhiamAgent.exe
echo   وزّعه للموظفين — يشتغل بالدبل-كليك بدون بايثون.
echo   لمثبّت كامل (قائمة ابدأ + أيقونة + تشغيل تلقائي):
echo   افتح khiam_installer.iss ببرنامج Inno Setup واضغط Compile.
echo ============================================
pause
