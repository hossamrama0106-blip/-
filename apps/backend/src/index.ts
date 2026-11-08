// نقطة تشغيل الـ backend المحلي على Node.
import "./env"; // لازم أول import — يحمّل .env قبل أي موديول يقرأ process.env
import { serve } from "@hono/node-server";
import { app } from "./app";
import { store } from "./store";
import { startSimulator } from "./simulator";
import { startPersistence } from "./persistence";
import { commentsEnabled, fetchComments, commentsPollMs } from "./comments";

const PORT = Number(process.env.PORT ?? 8787);

async function main() {
  // ثبات البيانات: حمّل اللقطة (Supabase لو مربوط، وإلا الملف) قبل أي كتابة — عشان الحفظ
  // الدوري ما يدهسش اللقطة السحابية ببيانات البذرة قبل ما التحميل يخلص.
  await startPersistence();

  // حلقة إعادة حساب الحالات والتنبيهات
  setInterval(() => store.tick(), 5000);

  // الرادار الليلي الآلي (يعمل فقط عند تفعيله من الداشبورد)
  setInterval(() => {
    const r = store.nightScan();
    if (r.raised) console.log(`🌙 رادار ليلي: صعّد ${r.raised} مخالفة/تنبيه`);
  }, 20000);

  // التنظيف الذاتي كل دقيقة (يمنع تضخّم الذاكرة)
  setInterval(() => store.purge(), 60000);

  startSimulator();

  // بوت التعليقات: يفحص تعليقات الصفحة دوريًا (نائم بدون META_PAGE_ACCESS_TOKEN)
  if (commentsEnabled()) {
    const pollComments = async () => {
      try {
        const cs = await fetchComments();
        if (cs.length) {
          const r = store.ingestComments(cs);
          if (r.added) console.log(`🤖 بوت التعليقات: رصد ${r.added} تعليق جديد (طابور ${r.enqueued})`);
        }
      } catch (e) {
        console.warn("⚠️ بوت التعليقات:", (e as Error).message);
      }
    };
    void pollComments();
    setInterval(pollComments, commentsPollMs());
    console.log("🤖 بوت التعليقات نشط (Meta Graph API)");
  } else {
    console.log("🤖 بوت التعليقات نائم (ضع META_PAGE_ACCESS_TOKEN لتفعيله)");
  }

  // ربط 0.0.0.0 ضروري على منصّات السحابة (Render/Railway)؛ المنصّة تحقن PORT وقت التشغيل.
  serve({ fetch: app.fetch, port: PORT, hostname: "0.0.0.0" }, (info) => {
    console.log(`🚀 Khiam backend on 0.0.0.0:${info.port}`);
    console.log(`   health: /api/health`);
  });
}

void main();
