@echo off
chcp 65001 >nul
setlocal
echo ============================================
echo    Khiam Ops - تثبيت حزمة الموظف
echo ============================================
echo.

echo [1/3] اعداد برنامج الويندوز (Agent)...
if exist "%~dp0agent\khiam_agent.py" (
  where python >nul 2>nul
  if %errorlevel%==0 (
    if not exist "%~dp0agent\config.json" (
      copy "%~dp0agent\config.example.json" "%~dp0agent\config.json" >nul
      echo     - تم انشاء agent\config.json  ^<^< عدّله وضع كود الموظف.
    ) else (
      echo     - config.json موجود بالفعل.
    )
    echo     - لتفعيل لقطات الشاشة ^(اختياري^):  pip install -r "%~dp0agent\requirements.txt"
  ) else (
    echo     ! Python غير مثبت. حمّله من https://python.org ثم اعد تشغيل هذا الملف.
  )
) else (
  echo     ! لم يتم العثور على مجلد agent.
)
echo.

echo [2/3] تحميل اضافة كروم:
echo     1^) افتح: chrome://extensions
echo     2^) فعّل: Developer mode ^(اعلى اليمين^)
echo     3^) اضغط: Load unpacked  واختر المجلد:
echo        "%~dp0apps\extension"
echo.

echo [3/3] تسجيل الدخول:
echo     اضغط ايقونة الاضافة ^> ادخل كود الموظف ورقم الواتساب ^> وافق على اشعار المتابعة.
echo.
echo     لتشغيل برنامج الويندوز:  python "%~dp0agent\khiam_agent.py" --code ^<الكود^>
echo.
echo ============================================
pause
