# Khiam Ops — برنامج الويندوز (Agent)

يراقب ما لا يراه المتصفح: النافذة النشطة على مستوى الجهاز، خمول الماوس/الكيبورد، كشف الألعاب/البرامج الخارجية،
ولقطات الشاشة (بموافقة، اختيارية). يرسل كل ذلك للـ backend كـ heartbeat.

> **مراقبة معلنة بموافقة:** الموظف يوافق مرة واحدة عبر الإكستنشن، واللقطات لا تُلتقط إلا عند تفعيل الإدارة لـ"لايف"
> و`allowCapture=true`.

## التشغيل
النواة تعمل بدون أي تثبيت (stdlib فقط):
```bash
python khiam_agent.py --code K1003
```
أو بإعداد ثابت: انسخ `config.example.json` إلى `config.json` وعدّل الكود، ثم:
```bash
python khiam_agent.py
```

## لقطات الشاشة (اختياري)
تتطلب مكتبتين فقط:
```bash
pip install -r requirements.txt
```
وفعّلها بـ `--capture` أو `allowCapture:true` في `config.json`. تُضغط الصور إلى WebP وتُرفع فقط أثناء "لايف".

## ماذا يُرسل؟
| الإشارة | المصدر | الاستخدام في الداشبورد |
|---|---|---|
| عنوان النافذة النشطة | `GetForegroundWindow` | يفعل؟ محادثة؟ سوشيال؟ ألعاب؟ |
| اسم البرنامج (exe) | `QueryFullProcessImageName` | كشف الألعاب/البرامج الخارجية |
| الخمول (مللي ثانية) | `GetLastInputInfo` | تنبيه "متوقف > 5 دقائق" |
| حركة الماوس | `GetCursorPos` | نشط/خامل |
| لقطة شاشة WebP | `mss` + `Pillow` | لايف/مخالفات (بموافقة) |

## الإعدادات (config.json)
- `backend`: عنوان الـ API (محلياً `http://localhost:8787`، لاحقاً Cloudflare Worker).
- `code`: كود الموظف.
- `intervalSeconds`: كل كام ثانية يبعت heartbeat (افتراضي 10).
- `allowCapture`: السماح بلقطات الشاشة (افتراضي false).
- `captureIntervalSeconds` / `captureMaxWidth` / `captureQuality`: إعدادات اللقطة.

## لاحقاً
- تحزيم كـ `.exe` (PyInstaller) لتوزيعه على الموظفين دون تثبيت بايثون.
- رفع اللقطات إلى Cloudflare R2 بدل الـ backend.
- OCR محلي (Tesseract) للبحث داخل اللقطات.
