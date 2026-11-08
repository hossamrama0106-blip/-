# نشر Khiam Ops أونلاين

> هدف النشر: الإدارة والموظفون يوصلوا للنظام من أي مكان (بدل المحلي).

---

## 0. المعمارية — اقرأها الأول (بتحدّد كل القرارات)

الباك **stateful**: الحالة اللحظية في ذاكرة العملية + **لقطة دائمة في Supabase** (يحمّلها عند الإقلاع، فيصمد مع إعادة التشغيل). يعني:

- ❌ **مايصلحش serverless** (Cloudflare Workers / Pages Functions) من غير إعادة كتابة كبيرة.
- ❌ **"رفع مجلد لـ Cloudflare Pages"** بيشتغل للملفات الثابتة بس — مش للباك. فمفيش مجلد ترفعه للباك.
- ✅ **الباك يشتغل كعملية Node دائمة** (حاوية أو `pnpm start`) **ويقدّم الداشبورد المبنيّ من نفس الأصل** (single origin) — فمفيش CORS ولا رفع منفصل للداشبورد.
- ✅ **البيانات تعيش في Supabase** — حتى لو الحاوية اتعاد تشغيلها/نشرها، الداتا ما تضيعش.

**الخدمات السحابية المطلوبة (كلها مربوطة بالفعل في `.env`):**

| الخدمة | لازمة؟ | الدور |
|---|---|---|
| **Supabase** | ✅ **نعم** | التخزين الدائم (لقطة الحالة) + أوامر لحظية (Realtime) — بدونها الداتا تضيع مع كل ريستارت |
| **Cloudflare R2** | ✅ مستحسن | تخزين لقطات الشاشة (بدونه تفضل في الذاكرة وتتفضّى) |
| **Groq** | اختياري | تقييم الردود بالـAI (فيه fallback محلي شغّال بدونه) |
| **Upstash Redis** | ❌ مؤجّل | للتوسّع الأفقي (أكثر من ~30 موظف/عدّة عمليات) — مش محتاجينه دلوقتي |
| **WAHA** | اختياري | إرسال واتساب تلقائي (بدونه رابط wa.me اليدوي) |

---

## 1. الطريقة الموصى بها: Cloudflare Tunnel من جهاز دائم التشغيل (مجاني، بحساب Cloudflare اللي عندك)

ده الأنسب: مجاني، HTTPS تلقائي، يستخدم حسابك في Cloudflare، ومحتاجش فتح بورت في الراوتر.

**تحتاج:** جهاز يفضل شغّال وقت العمل (PC مكتبي / ميني-PC / أو VPS رخيص ~5$/شهر زي Hetzner).

**الخطوات:**

1. **شغّل الباك على الجهاز** (بـ Docker — أنظف طريقة):
   ```bash
   # من جذر المشروع
   docker build -f apps/backend/Dockerfile -t khiam-ops .
   docker run -d --name khiam -p 8787:8787 --env-file apps/backend/.env --restart unless-stopped khiam-ops
   ```
   أو بدون Docker (Node 24): `cd apps/backend && pnpm install && pnpm --filter @khiam/dashboard build && NODE_ENV=production pnpm start`

2. **ثبّت cloudflared** ووصّله بحسابك: `cloudflared tunnel login`
3. **أنشئ نفقًا واربطه بدومين عندك:**
   ```bash
   cloudflared tunnel create khiam
   cloudflared tunnel route dns khiam ops.YOURDOMAIN.com
   cloudflared tunnel run --url http://localhost:8787 khiam
   ```
   (للتجربة السريعة بدون دومين: `cloudflared tunnel --url http://localhost:8787` → بيديك رابط `*.trycloudflare.com` مؤقت.)
4. **رابطك النهائي** = `https://ops.YOURDOMAIN.com` → الداشبورد والـAPI كلهم من هنا.

> المدير يفتح الرابط ويدخل بيوزر/باسوورد. الموظفون يحطّوا نفس الرابط في الإكستنشن (قسم 4).

---

## 2. البديل: حاوية على مضيف يشغّل Node

لو مش عايز Tunnel، انشر صورة Docker على مضيف دائم التشغيل:
- **VPS** (Hetzner/Contabo/DigitalOcean): `docker run` زي فوق + reverse proxy (Caddy/Nginx) لـ HTTPS، أو خلّي Cloudflare proxy قدّام الدومين.
- **منصّات حاويات** (Render/Railway/Fly.io): ارفع الصورة. ⚠️ الباقات المجانية بتنام عند الخمول — مش مناسب لمراقبة مستمرة؛ استخدم خطة دائمة التشغيل.

HTTPS إجباري للإنتاج (الإكستنشن والمتصفح). Cloudflare Tunnel/Proxy بيوفّره تلقائيًا.

---

## 3. متغيّرات البيئة للإنتاج (في `apps/backend/.env` أو `--env-file`)

```ini
NODE_ENV=production        # يفرض التحقق الصارم من الأسرار + يوقف المحاكي
PORT=8787
# أمان — لازم ثابتة وقوية (الباك fail-closed بدونها في الإنتاج):
AUTH_SECRET=<64 حرف عشوائي: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
ADMIN_CODE=<كود مدير سري قوي — للطوارئ/البووتستراب>
# السحابة (مربوطة بالفعل عندك):
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_ANON_KEY=...
GROQ_API_KEY=... GROQ_MODEL=openai/gpt-oss-120b
R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_BUCKET=khiam-screenshots
# اختياري:
# CORS_ORIGINS=https://ops.YOURDOMAIN.com   # فقط لو قدّمت الداشبورد من أصل مختلف (مش محتاجها مع single origin)
# TZ_OFFSET_MINUTES=120                      # توقيت العمل لحدود "اليوم" (افتراضي القاهرة +2)
# RATE_*                                      # حدود المعدّل (شوف .env.example — الافتراضي سخيّ)
```

> **مهم:** `SIMULATE` **لا تضعها = 1** في الإنتاج (المحاكي يُتجاهَل تلقائيًا لو NODE_ENV=production، لكن الأأمن حذفها/0).

---

## 4. ضبط الإكستنشن للموظفين (رابط الباك)

الإكستنشن يقرأ رابط الخادم من مكانين (بأولوية): **تخزين المتصفح** ← **`DEFAULT_BACKEND`** في `apps/extension/background.js`.

**طريقتان للتوزيع:**
- **(أ) الأسهل للكل:** عدّل سطر `DEFAULT_BACKEND` في `background.js` لرابط الإنتاج **مرة واحدة** قبل التحزيم، ثم وزّع الحزمة (قسم 6). كل الموظفين يشتغلوا فورًا.
- **(ب) مرن بدون تعديل كود:** كل جهاز يفتح أيقونة الإضافة ← **⚙ إعدادات الخادم** ← يحط الرابط ← حفظ.

> ملاحظة: `host_permissions` فيه `https://*/*` عشان أي رابط إنتاج يشتغل بلا تعديل مانيفست. كروم هيطلب إذن "قراءة البيانات على المواقع" عند التحميل — ده متوقّع لأداة داخلية معلنة.

## 5. ضبط البرنامج (Windows Agent)

في `agent/config.json` (انسخه من `config.example.json`): حط `backend` = رابط الإنتاج + `username`/`password` للموظف. أو شغّله:
```bash
python khiam_agent.py --backend https://ops.YOURDOMAIN.com --username mrsam511 --password ****
```

---

## 6. تحزيم حزمة الموظف (إكستنشن + برنامج)

شغّل من جذر المشروع:
```bash
node scripts/pack-employee.mjs
```
بيطلّع `release/khiam-employee-pack.zip` فيه: `extension/` (للتحميل في كروم Load unpacked) + `agent/` + `تثبيت.bat` + `اقرأني.txt`. وزّعه على الموظفين.

---

## 7. التصفير والبووتستراب

النظام **متصفّر بالفعل** على 3 حسابات حقيقية (مدير/قائد/موظف)، واللقطة النضيفة محفوظة في Supabase — فأول إقلاع للإنتاج بيحمّلها ويقوم بالـ3 حسابات مباشرةً (مش 12 تجريبي).

**لو احتجت إعادة تصفير** (حسابات جديدة من الصفر) — بعد نشر الباك، ادخل بالمدير ثم:
```bash
curl -X POST https://ops.YOURDOMAIN.com/api/system/reset \
  -H "authorization: Bearer <توكن المدير>" -H "content-type: application/json" \
  -d '{"confirm":"RESET","accounts":[
    {"username":"mrabdullah1994","password":"<باسوورد قوي>","name":"عبدالله","role":"admin"},
    {"username":"hasanen0111","password":"<باسوورد قوي>","name":"حسنين","role":"lead"},
    {"username":"mrsam511","password":"<باسوورد قوي>","name":"حسام","role":"employee"}
  ]}'
```
> ⚠️ الباسووردات المبدئية = اليوزرنيم (ضعيفة) — **غيّرها لباسووردات قوية عند الإطلاق**. المدير يضيف باقي الموظفين من الداشبورد (+ إضافة موظف).

---

## 8. تشيك-ليست الإطلاق

- [ ] الباك شغّال (حاوية/عملية) على مضيف دائم + HTTPS (Tunnel/Proxy)
- [ ] `NODE_ENV=production` + `AUTH_SECRET` + `ADMIN_CODE` قوية في `.env`
- [ ] `/api/health` يرجّع `supabase:true` (والداتا بتُحفظ)
- [ ] الداشبورد بيفتح من رابط الإنتاج والدخول شغّال
- [ ] رابط الإنتاج مضبوط في الإكستنشن (DEFAULT_BACKEND أو البوب)
- [ ] باسووردات الحسابات اتغيّرت لقوية
- [ ] حزمة الموظف اتوزّعت (إكستنشن + برنامج)
