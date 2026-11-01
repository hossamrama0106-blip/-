// مُحاكي نشاط — يحرّك الموظفين التجريبيين عشان الداشبورد يبان حي قبل ربط الإكستنشن الحقيقي.
// يُفعّل بـ SIMULATE=1 (افتراضي في التطوير). أوقفه بـ SIMULATE=0.
import { ActivityType, BreakType, Channel, EmployeeStatus } from "@khiam/shared";
import { store } from "./store";

const CHANNELS = [Channel.MESSENGER, Channel.INSTAGRAM, Channel.WHATSAPP, Channel.COMMENTS];
const WINDOWS = [
  "Meta Business Suite — الوارد",
  "Instagram Direct",
  "WhatsApp Web",
  "Operix — إنشاء أوردر",
  "YouTube — مقطع مسلي",
  "صفحة التعليقات",
];
const pick = <T>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
const chance = (p: number) => Math.random() < p;

export function startSimulator(): void {
  if (process.env.SIMULATE === "0") return;

  // بدء شيفت لمعظم الموظفين
  for (const e of store.employees) {
    if (chance(0.8)) store.startShift(e.id);
  }

  // heartbeats + نشاط دوري
  setInterval(() => {
    for (const e of store.employees) {
      const live = store.getLive(e.id);
      if (live.presence === "not_started" || live.presence === "shift_ended") continue;

      // بعض الموظفين "يتكاسلون" (مايبعتوش heartbeat) عشان تظهر التنبيهات
      const lazy = e.id.endsWith("4") || e.id.endsWith("8");
      if (lazy && chance(0.6)) continue;

      const onSocial = chance(0.12);
      const win = onSocial ? pick(["YouTube — مقطع مسلي"]) : pick(WINDOWS);
      store.heartbeat(e.id, {
        typing: !onSocial && chance(0.35),
        typingWpm: 25 + Math.floor(Math.random() * 45),
        currentWindow: win,
        currentConversation: !onSocial && chance(0.5) ? `عميل #${100 + Math.floor(Math.random() * 400)}` : null,
        mouseMoved: chance(lazy ? 0.2 : 0.9),
        extensionConnected: true,
        agentConnected: chance(0.85),
      });

      // نشاط رسائل/تعليقات/أوردرات
      if (!onSocial && chance(0.5)) {
        const r = Math.random();
        const type =
          r < 0.6 ? ActivityType.REPLY : r < 0.85 ? ActivityType.COMMENT : r < 0.95 ? ActivityType.ORDER : ActivityType.OPEN_NO_REPLY;
        store.addActivity({ employeeId: e.id, type, channel: pick(CHANNELS), ref: `ref_${Math.floor(Math.random() * 9999)}` });
      }

      // تقييم AI عشوائي (محاكاة Groq)
      if (chance(0.06)) {
        const r = Math.random();
        const verdict = r < 0.55 ? "good" : r < 0.8 ? "ok" : "bad";
        store.addReview({
          employeeId: e.id,
          conversationRef: `عميل #${100 + Math.floor(Math.random() * 400)}`,
          verdict,
          score: verdict === "good" ? 85 + Math.floor(Math.random() * 15) : verdict === "ok" ? 60 + Math.floor(Math.random() * 20) : 20 + Math.floor(Math.random() * 30),
          aiNotes: verdict === "bad" ? "رد مقتضب ولم يجب على سؤال العميل" : "رد واضح ومهذب",
          sampleText: "— عايز المقاس ده متوفر؟\n— اهلا بحضرتك، تمام متوفر 👍",
        });
      }
    }

    // تحديث صندوق الوارد (كام غير مقروء)
    const base = store.inbox.unreadMessages;
    const delta = Math.floor(Math.random() * 7) - 3;
    store.setInbox(Math.max(0, base + delta), Math.max(0, store.inbox.unreadComments + Math.floor(Math.random() * 3) - 1));

    // بريك عشوائي
    for (const e of store.employees) {
      const live = store.getLive(e.id);
      if (live.presence === "working" && chance(0.02)) store.startBreak(e.id, pick([BreakType.PRAYER, BreakType.WC, BreakType.BREAK]));
      else if ((live.presence === "break" || live.presence === "prayer" || live.presence === "wc") && chance(0.3)) store.endBreak(e.id);
    }
  }, 3000);

  // لمسة أولى: ضبط صندوق وارد مبدئي
  store.setInbox(12, 5);
  // مخالفة توضيحية
  const sample = store.employees.find((e) => e.id.endsWith("4"));
  if (sample) {
    store.addViolation({
      employeeId: sample.id,
      type: "تهرب من عميل",
      severity: "medium",
      reason: "فتح محادثة عميل وخرج بدون رد 3 مرات",
    });
  }

  console.log("🧪 simulator running (set SIMULATE=0 to disable)");
}
