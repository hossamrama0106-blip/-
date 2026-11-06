// ثبات البيانات — لقطة JSON كاملة للحالة.
//  • لو Supabase مربوط (SUPABASE_URL + SERVICE_ROLE_KEY): اللقطة تعيش في السحابة (ops_snapshot)،
//    والملف المحلي يفضل مرآة/احتياطي offline.
//  • من غير Supabase: الملف المحلي الذرّي بس (زي ما كان) — البيانات ما تضيعش مع إعادة التشغيل.
// نفس واجهة serialize/load في الـ store، فالتبديل شفّاف.
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { store } from "./store";
import { supabaseEnabled, fetchSnapshot, pushSnapshot } from "./supabase";

const FILE = process.env.DATA_FILE || resolve(process.cwd(), ".data", "store.json");
const TMP = FILE + ".tmp";
let lastJson = ""; // آخر لقطة اتكتبت محليًا (لتخطّي الكتابة بدون تغيير)
let lastPushed = ""; // آخر لقطة اتدفعت لـ Supabase بنجاح

/** حمّل اللقطة المحفوظة — Supabase أولًا (لو مربوط) ثم الملف المحلي كاحتياطي. يُستدعى مرة عند الإقلاع. */
export async function hydrate(): Promise<void> {
  if (supabaseEnabled()) {
    const snap = await fetchSnapshot();
    if (snap && typeof snap === "object" && Object.keys(snap).length) {
      store.load(snap);
      lastJson = lastPushed = JSON.stringify(store.serialize());
      console.log("☁️  حُمّلت البيانات من Supabase");
      return;
    }
    console.log("☁️  Supabase مربوط — لا توجد لقطة سحابية بعد (أول تشغيل / بداية نظيفة)");
    // نكمّل لتحميل الملف المحلي لو موجود (هجرة أول مرة من المحلي للسحابة).
  }
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

/** احفظ لقطة الآن: ملف محلي ذرّي (ملف مؤقت ثم rename) + دفعة Supabase أفضل-جهد لو مربوط. */
export function save(): void {
  let obj: Record<string, unknown>;
  let json: string;
  try {
    obj = store.serialize();
    json = JSON.stringify(obj);
  } catch (e) {
    console.warn("⚠️ تعذّر تجهيز اللقطة:", (e as Error).message);
    return;
  }
  // (1) محلي — ذرّي، سريع، يشتغل offline
  if (json !== lastJson) {
    try {
      mkdirSync(dirname(FILE), { recursive: true });
      writeFileSync(TMP, json, "utf8");
      renameSync(TMP, FILE);
      lastJson = json;
    } catch (e) {
      console.warn("⚠️ تعذّر حفظ البيانات محليًا:", (e as Error).message);
    }
  }
  // (2) سحابي — لا يعطّل الحلقة، يتخطّى لو مفيش تغيير عن آخر دفعة ناجحة
  if (supabaseEnabled() && json !== lastPushed) {
    const stamp = json;
    void pushSnapshot(obj).then((ok) => {
      if (ok) lastPushed = stamp;
    });
  }
}

/** ابدأ الثبات: تحميل عند الإقلاع (ينتظر Supabase) + حفظ دوري + حفظ عند الخروج. */
export async function startPersistence(intervalMs = Number(process.env.SAVE_INTERVAL_MS) || 8000): Promise<void> {
  await hydrate();
  setInterval(save, intervalMs);
  const flush = () => {
    try {
      save();
    } catch {
      /* ignore */
    }
  };
  process.on("SIGINT", () => {
    flush();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    flush();
    process.exit(0);
  });
  process.on("beforeExit", flush);
}
