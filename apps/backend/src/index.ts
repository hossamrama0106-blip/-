// نقطة تشغيل الـ backend المحلي على Node.
import { serve } from "@hono/node-server";
import { app } from "./app";
import { store } from "./store";
import { startSimulator } from "./simulator";
import { startPersistence } from "./persistence";

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

  serve({ fetch: app.fetch, port: PORT }, (info) => {
    console.log(`🚀 Khiam backend (local) on http://localhost:${info.port}`);
    console.log(`   health: http://localhost:${info.port}/api/health`);
  });
}

void main();
