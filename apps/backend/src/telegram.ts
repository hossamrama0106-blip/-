// إشعارات تيليجرام الفورية للمدير — نائم بدون TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID.
//  • تنبيهات حرجة فور حدوثها (إكستنشن مقطوع، قراءة ميتا متوقفة، تكدّس، تهرّب…).
//  • ملخص يومي تلقائي منتصف الليل (توقيت محلي UTC+2 افتراضيًا).
// الإعداد: أنشئ بوت من @BotFather → خُد التوكن، وابعت رسالة للبوت ثم خُد chat_id من
// https://api.telegram.org/bot<TOKEN>/getUpdates، وحُط الاتنين كمتغيّرات بيئة في Render.
import { store } from "./store";
import type { Alert } from "@khiam/shared";

const token = () => (process.env.TELEGRAM_BOT_TOKEN || "").trim();
const chatId = () => (process.env.TELEGRAM_CHAT_ID || "").trim();
export function telegramEnabled(): boolean {
  return !!(token() && chatId());
}

const TZ_OFFSET_MIN = Number(process.env.TZ_OFFSET_MINUTES ?? 120);
const esc = (s: unknown) => String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] as string);

async function tgApi(method: string, payload: Record<string, unknown>): Promise<boolean> {
  if (!telegramEnabled()) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId(), ...payload }),
      signal: AbortSignal.timeout(10000),
    });
    return res.ok;
  } catch {
    return false; // الشبكة/التوكن غلط → تجاهل بهدوء (لا يعطّل النظام)
  }
}
export const tgSend = (text: string) => tgApi("sendMessage", { text, parse_mode: "HTML", disable_web_page_preview: true });

const KIND_AR: Record<string, string> = {
  idle: "خمول",
  queue_pressure: "ضغط الوارد",
  cherry_pick: "تهرّب من عميل",
  games: "ألعاب",
  fake_activity: "نشاط وهمي",
  deal_at_risk: "أوردر في خطر",
  ext_offline: "الإكستنشن مقطوع أثناء الشيفت",
  scrape_fail: "قراءة ميتا متوقفة",
  unanswered_comment: "تعليق بدون رد",
  piled_messages: "تكدّس رسائل",
  slow_reply: "محادثة منتظرة",
  angry_customer: "عميل غاضب",
  custom: "تنبيه",
};
// الحرجة فقط تروح للموبايل (مش كل تنبيه صغير يزنّ)
const CRITICAL = new Set(["ext_offline", "scrape_fail", "piled_messages", "deal_at_risk", "fake_activity", "cherry_pick", "angry_customer"]);

export function alertText(a: Alert): string {
  const emo = a.severity === "high" ? "🔴" : a.severity === "low" ? "🟡" : "🟠";
  const who = a.employeeId ? store.findEmployee(a.employeeId)?.name ?? "" : "";
  const lines = [`${emo} <b>${esc(KIND_AR[a.kind] ?? a.kind)}</b>${who ? " — " + esc(who) : ""}`, esc(a.message)];
  if (a.link) lines.push(`🔗 ${esc(a.link)}`);
  return lines.join("\n");
}

export async function sendDailySummary(): Promise<boolean> {
  const r = store.dailyReport();
  const t = r.team;
  const fastestId = store.leaderboard().highlights.fastest;
  const fastest = fastestId ? store.findEmployee(fastestId)?.name ?? "—" : "—";
  const text = [
    `🌙 <b>ملخص يوم ${esc(r.date)}</b>`,
    `👥 موظفون: ${t.employees}`,
    `💬 رسائل: ${t.msgs}`,
    `📝 تعليقات: ${t.comments}`,
    `🛒 أوردرات: ${t.orders}`,
    `✅ محادثات منجزة: ${t.tasksDone}`,
    `⚡ الأسرع ردًّا: ${esc(fastest)}`,
    `⚠️ مخالفات: ${t.violations}`,
  ].join("\n");
  return tgSend(text);
}

function msToNextLocalMidnight(): number {
  const dayMs = 24 * 3600 * 1000;
  const local = Date.now() + TZ_OFFSET_MIN * 60000;
  const next = (Math.floor(local / dayMs) + 1) * dayMs; // أقرب منتصف ليل محلي قادم
  return Math.max(1000, next - local);
}
function scheduleDailySummary(): void {
  const run = () => setTimeout(async () => { await sendDailySummary(); run(); }, msToNextLocalMidnight());
  run(); // يعيد الجدولة لمنتصف الليل التالي كل مرة (بلا انحراف تراكمي)
}

export function startTelegram(): void {
  if (!telegramEnabled()) {
    console.log("📨 تيليجرام نائم (ضع TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID لتفعيله)");
    return;
  }
  store.onNewAlert((a) => { if (CRITICAL.has(a.kind)) void tgSend(alertText(a)); });
  scheduleDailySummary();
  void tgSend("✅ Khiam Ops — بوت التنبيهات اشتغل. هيوصلك هنا أي تنبيه حرج + ملخص يومي منتصف الليل.");
  console.log("📨 تيليجرام نشط — تنبيهات فورية + ملخص يومي");
}
