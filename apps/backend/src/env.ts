// تحميل متغيّرات .env مبكرًا — قبل أي import يقرأ process.env (auth/store/supabase…).
// بدون أي مكتبة: نستخدم process.loadEnvFile المدمج في Node 20.12+/24. لو مفيش .env نكمّل بهدوء.
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env");
try {
  const load = (process as { loadEnvFile?: (p: string) => void }).loadEnvFile;
  if (typeof load === "function" && existsSync(envPath)) {
    load.call(process, envPath);
  }
} catch (e) {
  console.warn("⚠️ تعذّر تحميل .env:", (e as Error).message);
}
