# نشر Khiam Ops أونلاين

> هدف النشر: الإدارة والموظفون يوصلوا للنظام من أي مكان، **24/7 ومستقل عن جهازك الشخصي**.

---

## 0. المعمارية — اقرأها الأول (بتحدّد كل القرارات)

الباك **stateful**: الحالة اللحظية في ذاكرة العملية + **لقطة دائمة في Supabase** (يحمّلها عند الإقلاع، فيصمد مع إعادة التشغيل/النشر). يعني:

- ❌ **مايصلحش serverless** (Cloudflare Workers / Pages Functions) من غير إعادة كتابة كبيرة.
- ❌ **"رفع مجلد لـ Cloudflare Pages"** للملفات الثابتة بس — مش للباك. فمفيش مجلد ترفعه للباك.
- ✅ **الباك يشتغل كعملية Node دائمة** (حاوية) **ويقدّم الداشبورد المبنيّ من نفس الأصل** (single origin) — بلا CORS ولا رفع منفصل.
- ✅ **البيانات تعيش في Supabase** — حتى لو الحاوية اتعاد نشرها، الداتا ما تضيعش.

**الخدمات السحابية (كلها مربوطة بالفعل في `.env`):**

| الخدمة | لازمة؟ | الدور |
|---|---|---|
| **Supabase** | ✅ **نعم** | التخزين الدائم + أوامر لحظية — بدونها الداتا تضيع مع كل ريستارت |
| **Cloudflare R2** | ✅ مستحسن | تخزين لقطات الشاشة |
| **Groq** | اختياري | تقييم الردود (fallback محلي شغّال بدونه) |
| **Upstash / WAHA** | ❌ مؤجّلة/اختيارية | التوسّع الأفقي / واتساب تلقائي |

---

## 1. النشر السحابي (Render / Railway) — 24/7 بلا جهازك ✅ (الموصى به)

يشغّل الباك على السحابة باستمرار، يعطيك رابط https مباشر، ومستقل تمامًا عن جهازك. الداتا في Supabase فتصمد مع أي إعادة نشر.

> **متطلّب أساسي:** الكود لازم يبقى على **GitHub** (ريبو **خاص** — مفيش أسرار في الكود، `.env` متجاهَل).
> لو ريبوك محلي، أنشئ ريبو خاص على GitHub وادفع له:
> ```bash
> git remote add origin https://github.com/<حسابك>/khiam-ops.git
> git push -u origin main
> ```

### أ) Render (الأبسط — Blueprint جاهز: `render.yaml`)
1. أنشئ حساب على **render.com** واربط GitHub.
2. **New ← Blueprint** ← اختر الريبو → Render يقرأ `render.yaml` ويجهّز الخدمة تلقائيًا.
3. املا الأسرار (اللي `sync:false`): `ADMIN_CODE` + مفاتيح Supabase/Groq/R2 (انسخها من `apps/backend/.env`). `AUTH_SECRET` يتولّد تلقائيًا.
4. **Deploy** → بعد دقائق البناء، رابطك: `https://khiam-ops.onrender.com` (الداشبورد + الـAPI من نفس الرابط).
5. تأكّد: افتح `https://<رابطك>/api/health` → لازم `supabase:true`.

> **الباقة:** `render.yaml` مضبوط على **starter (~7$/شهر = 24/7 بلا نوم)** — ده اللي يحقّق طلبك.
> للبدء مجانًا: غيّر `plan: starter` إلى `plan: free` — بس الخدمة تنام بعد 15 دقيقة خمول وتصحى على أول طلب (الداتا ما تضيعش، تتحمّل من Supabase؛ مناسب لو نبضات الموظفين وقت العمل بتبقيه صاحي).

### ب) Railway (بديل — `railway.json` جاهز)
1. أنشئ حساب على **railway.app** ← **New Project ← Deploy from GitHub** ← اختر الريبو (يقرأ `railway.json` ويبني بالـDockerfile).
2. في **Variables** حط متغيّرات الإنتاج كلها (NODE_ENV=production، AUTH_SECRET، ADMIN_CODE، Supabase/Groq/R2 — من `.env`).
3. **Settings ← Networking ← Generate Domain** → رابط https.
4. Railway يشتغل باستمرار (فوترة بالاستخدام ~5$/شهر) — مناسب لـ24/7. (بديل بلا GitHub: `railway up` عبر الـCLI.)

> **المهم في الاتنين:** لا تضع `PORT` يدويًا — المنصّة تحقنه والباك يقرأه ويربط `0.0.0.0` تلقائيًا. و`/api/health` هو فحص الصحة.

---

## 2. بديل محلي: Cloudflare Tunnel من جهاز دائم التشغيل (مجاني)

لو عندك جهاز/VPS يفضل شغّال: شغّل الباك (Docker) ووصّله بنفق:
```bash
docker build -f apps/backend/Dockerfile -t khiam-ops .
docker run -d --name khiam -p 8787:8787 --env-file apps/backend/.env --restart unless-stopped khiam-ops
cloudflared tunnel --url http://localhost:8787   # رابط مؤقت، أو اربطه بدومينك عبر: tunnel create/route dns/run
```
⚠️ بيوقف لو الجهاز اتقفل — لكده السحابي (قسم 1) أنسب لطلبك.

## 3. بديل: حاوية على مضيف تديره (VPS)

`docker run` زي فوق على VPS (Hetzner/Contabo/DigitalOcean) + Cloudflare proxy/Caddy لـ HTTPS.

---

## 4. متغيّرات البيئة للإنتاج (في لوحة المنصّة أو `apps/backend/.env`)

```ini
NODE_ENV=production        # يفرض التحقق الصارم من الأسرار + يوقف المحاكي
# أمان — لازم ثابتة وقوية (الباك fail-closed بدونها):
AUTH_SECRET=<64 حرف عشوائي: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
ADMIN_CODE=<كود مدير سري قوي — للطوارئ/البووتستراب>
# السحابة (مربوطة بالفعل عندك — انسخها من .env المحلي):
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_ANON_KEY=...
GROQ_API_KEY=... GROQ_MODEL=openai/gpt-oss-120b
R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_BUCKET=khiam-screenshots
# اختياري: TZ_OFFSET_MINUTES=120 (توقيت القاهرة لحدود اليوم) · RATE_* (حدود المعدّل، شوف .env.example)
# لا تضع PORT — المنصّة تحقنه.
```
> **SIMULATE لا تضعها = 1** في الإنتاج (تُتجاهَل تلقائيًا مع NODE_ENV=production).

---

## 5. ضبط الإكستنشن للموظفين (رابط الباك)

الإكستنشن يقرأ الرابط من: **تخزين المتصفح** ← **`DEFAULT_BACKEND`** في `apps/extension/background.js`.
- **(أ) الأسهل:** عدّل `DEFAULT_BACKEND` لرابط الإنتاج (مثلاً `https://khiam-ops.onrender.com`) **مرة** قبل التحزيم (قسم 7)، ثم وزّع.
- **(ب) بدون تعديل كود:** كل جهاز: أيقونة الإضافة ← **⚙ إعدادات الخادم** ← الرابط ← حفظ.

> `host_permissions` فيه `https://*/*` فأي رابط إنتاج يشتغل بلا تعديل مانيفست (كروم يطلب إذن المواقع عند التحميل — متوقّع لأداة داخلية معلنة).

## 6. ضبط البرنامج (Windows Agent)

`agent/config.json` (من `config.example.json`): `backend` = رابط الإنتاج + `username`/`password`. أو:
```bash
python khiam_agent.py --backend https://khiam-ops.onrender.com --username mrsam511 --password ****
```

## 7. تحزيم حزمة الموظف

```bash
node scripts/pack-employee.mjs   # → release/khiam-employee-pack.zip (extension + agent + install.bat + README.txt)
```

---

## 8. التصفير والبووتستراب

النظام **متصفّر بالفعل** على 3 حسابات (مدير/قائد/موظف) واللقطة النضيفة في **Supabase** — فأول إقلاع سحابي بيحمّلها ويقوم بالـ3 حسابات مباشرةً (مش 12 تجريبي).

**لإعادة تصفير** (بعد النشر، بتوكن مدير):
```bash
curl -X POST https://<رابطك>/api/system/reset \
  -H "authorization: Bearer <توكن المدير>" -H "content-type: application/json" \
  -d '{"confirm":"RESET","accounts":[
    {"username":"mrabdullah1994","password":"<قوي>","name":"عبدالله","role":"admin"},
    {"username":"hasanen0111","password":"<قوي>","name":"حسنين","role":"lead"},
    {"username":"mrsam511","password":"<قوي>","name":"حسام","role":"employee"}]}'
```
> ⚠️ الباسووردات المبدئية = اليوزرنيم (ضعيفة) — **غيّرها لقوية عند الإطلاق**. باقي الموظفين يضيفهم المدير من الداشبورد.

---

## 9. تشيك-ليست الإطلاق

- [ ] الكود على GitHub (ريبو خاص)
- [ ] الخدمة منشورة (Render/Railway) + رابط https شغّال
- [ ] `NODE_ENV=production` + `AUTH_SECRET` + `ADMIN_CODE` + مفاتيح Supabase/R2/Groq في متغيّرات المنصّة
- [ ] `https://<رابطك>/api/health` يرجّع `supabase:true`
- [ ] الداشبورد يفتح والدخول شغّال
- [ ] رابط الإنتاج مضبوط في الإكستنشن (DEFAULT_BACKEND أو ⚙) + حزمة الموظف اتوزّعت
- [ ] باسووردات الحسابات اتغيّرت لقوية
