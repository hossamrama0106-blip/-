# Khiam Ops OS

منظومة متابعة فريق خدمة العملاء (Meta Business Suite + Instagram + WhatsApp Web + Operix).
مراقبة **معلنة بموافقة** (transparent / consent-based) — مش تجسس خفي. التفاصيل في [خطة-العمل.md](./خطة-العمل.md).

## الهيكل (monorepo)

```
packages/
  shared/      نموذج البيانات + الأنواع + ثوابت (مصدر الحقيقة للعقود بين كل الأطراف)
apps/
  backend/     Hono API — محلي الآن (in-memory)، لاحقاً → Cloudflare Worker + Supabase/Upstash
  dashboard/   داشبورد الإدارة (Vite + React + Tailwind) — Cloudflare Pages لاحقاً
  extension/   إكستنشن كروم (WXT) — محقون جوّه Meta/WhatsApp/Operix
agent/         Windows Agent (Python) — شاشة/ماوس/نوافذ
```

## التشغيل المحلي

```bash
pnpm install
pnpm backend      # يشغّل الـ API على http://localhost:8787
pnpm dashboard    # يشغّل الداشبورد على http://localhost:5173
pnpm extension    # يبني الإكستنشن للتحميل في كروم (dev)
```

> حالياً كل حاجة شغّالة محلياً ببيانات تجريبية (mock) في ذاكرة الـ backend — من غير أي حسابات خارجية.
> لائحة اللي مطلوب منك لربط الخدمات الحقيقية: [المطلوب-منك.md](./المطلوب-منك.md).

## المراحل

- [x] النواة: الهيكل + الطبقة المشتركة + الـ backend المحلي (realtime + محاكي)
- [x] الداشبورد (جانب الإدارة): إدارة بالاستثناء + عدّادات + مقارنة/ترتيب + تنبيهات + تحكم بالموظف + وضع بسيط
- [x] إكستنشن كروم للموظف: الشريط الثابت + أزرار الشيفت + الشات + نغمة Enter + heartbeat ([apps/extension](./apps/extension/README.md))
- [x] برنامج ويندوز: نافذة/ماوس/خمول/تصنيف برامج + لقطات WebP بموافقة ([agent](./agent/README.md))
- [ ] الذكاء الاصطناعي (Groq) + الوضع الليلي ← التالي
- [ ] ربط الخدمات الحقيقية + النشر

راجع [المطلوب-منك.md](./المطلوب-منك.md) لما تيجي تربط الخدمات الحقيقية.
