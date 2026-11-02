// ثبات البيانات — لقطة JSON ذرّية على القرص. طبقة مرحلية لحين ربط Supabase (بنفس واجهة serialize/load).
// الهدف: البيانات ما تضيعش مع إعادة تشغيل السيرفر.
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { store } from "./store";

const FILE = process.env.DATA_FILE || resolve(process.cwd(), ".data", "store.json");
const TMP = FILE + ".tmp";
let lastJson = "";

/** حمّل اللقطة المحفوظة (إن وُجدت) — يُستدعى مرة عند الإقلاع قبل أي شيء */
export function hydrate(): void {
  try {
    if (!existsSync(FILE)) return;
    const raw = readFileSync(FILE, "utf8");
    if (!raw.trim()) return;
    store.load(JSON.parse(raw));
    lastJson = raw;
    console.log(`💾 حُمّلت البيانات من ${FILE}`);
  } catch (e) {
    console.warn(`⚠️ تعذّر تحميل ملف البيانات (${FILE}) — بدء نظيف:`, (e as Error).message);
  }
}

/** احفظ لقطة الآن (كتابة ذرّية: ملف مؤقت ثم rename). يتخطّى لو مفيش تغيير. */
export function save(): void {
  try {
    const json = JSON.stringify(store.serialize());
    if (json === lastJson) return;
    mkdirSync(dirname(FILE), { recursive: true });
    writeFileSync(TMP, json, "utf8");
    renameSync(TMP, FILE);
    lastJson = json;
  } catch (e) {
    console.warn("⚠️ تعذّر حفظ البيانات:", (e as Error).message);
  }
}

/** ابدأ الثبات: تحميل عند الإقلاع + حفظ دوري + حفظ عند الخروج */
export function startPersistence(intervalMs = Number(process.env.SAVE_INTERVAL_MS) || 8000): void {
  hydrate();
  setInterval(save, intervalMs);
  const flush = () => { try { save(); } catch { /* ignore */ } };
  process.on("SIGINT", () => { flush(); process.exit(0); });
  process.on("SIGTERM", () => { flush(); process.exit(0); });
  process.on("beforeExit", flush);
}
