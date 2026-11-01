// نقطة تشغيل الـ backend المحلي على Node.
import { serve } from "@hono/node-server";
import { app } from "./app";
import { store } from "./store";
import { startSimulator } from "./simulator";

const PORT = Number(process.env.PORT ?? 8787);

// حلقة إعادة حساب الحالات والتنبيهات
setInterval(() => store.tick(), 5000);

startSimulator();

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`🚀 Khiam backend (local) on http://localhost:${info.port}`);
  console.log(`   health: http://localhost:${info.port}/api/health`);
});
