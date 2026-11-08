// مُحاكي نشاط — يحرّك الموظفين التجريبيين عشان الداشبورد يبان حي قبل ربط الإكستنشن الحقيقي.
// يُفعّل بـ SIMULATE=1 (افتراضي في التطوير). أوقفه بـ SIMULATE=0.
import { ActivityType, BreakType, Channel, EmployeeStatus, QueuePriority } from "@khiam/shared";
import { store } from "./store";
import { evaluateLocal } from "./ai";

const SAMPLE_CONVOS: { role: "customer" | "agent"; text: string }[][] = [
  [{ role: "customer", text: "السلام عليكم، القميص ده متوفر مقاس L؟" }, { role: "agent", text: "وعليكم السلام أهلاً بحضرتك 😊 أيوة متوفر L، تحب نجهزه؟" }],
  [{ role: "customer", text: "بكام الهودي ده والتوصيل كام؟" }, { role: "agent", text: "الهودي 450 جنيه والتوصيل 60 للقاهرة 👍" }],
  [{ role: "customer", text: "ممكن اعرف الخامة إيه؟" }, { role: "agent", text: "قطن" }],
  [{ role: "customer", text: "عايز اطلب الجاكيت ده مقاس XL" }, { role: "agent", text: "" }],
  [{ role: "customer", text: "في عروض النهاردة؟" }, { role: "agent", text: "لأ مفيش" }],
  [{ role: "customer", text: "المنتج ده حلو قوي، سعره كام؟" }, { role: "agent", text: "تسلم ذوقك 🙏 سعره 299 جنيه ومتوفر كل المقاسات" }],
];

// رسائل عملاء تدخل طابور ميتا
const CUSTOMER_MSGS = [
  "السلام عليكم، المنتج ده متوفر؟",
  "بكام الأوردر مع التوصيل؟",
  "عايز أعرف المقاسات المتاحة",
  "ممكن صور أكتر للمنتج؟",
  "الأوردر وصل امتى؟",
  "عايز أرجّع القطعة، إزاي؟",
  "في خصم لو أخدت قطعتين؟",
  "التوصيل بيوصل المنصورة؟",
  "لسه مستني الرد من امبارح 😠",
  "تمام هأكّد الأوردر",
];
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
// أولوية الطابور: الأغلب عادية، بعضها مهمة، القليل VIP
const pickPriority = () => (chance(0.08) ? QueuePriority.VIP : chance(0.2) ? QueuePriority.HIGH : QueuePriority.NORMAL);
let custSeq = 100;
function enqueueCustomer() {
  custSeq++;
  store.enqueueTask({
    channel: pick(CHANNELS),
    customerRef: `عميل #${custSeq}`,
    preview: pick(CUSTOMER_MSGS),
    priority: pickPriority(),
    link: "https://business.facebook.com/latest/inbox",
  });
}

export function startSimulator(): void {
  if (process.env.SIMULATE !== "1") return; // المحاكي يعمل فقط بتفعيل صريح SIMULATE=1 (يمنع تشغيله بالغلط)
  if (process.env.NODE_ENV === "production") {
    console.warn("⚠️ SIMULATE=1 مُتجاهَل في الإنتاج — حماية بيانات الموظفين الحقيقيين من التلويث");
    return;
  }

  // بذرة أولية لطابور ميتا (محادثات منتظرة)
  for (let i = 0; i < 8; i++) enqueueCustomer();

  // بدء شيفت لمعظم الموظفين (يستلم كل واحد محادثته تلقائيًا في الوضع الإجباري)
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

      // تقييم الردود بالمُقيّم (heuristic محلي الآن، Groq عند توفّر المفتاح)
      if (chance(0.06)) {
        const convo = pick(SAMPLE_CONVOS);
        const ev = evaluateLocal({ messages: convo });
        store.addReview({
          employeeId: e.id,
          conversationRef: `عميل #${100 + Math.floor(Math.random() * 400)}`,
          verdict: ev.verdict,
          score: ev.score,
          aiNotes: ev.notes,
          sampleText: convo.map((m) => `${m.role === "agent" ? "الموظف" : "العميل"}: ${m.text}`).join("\n"),
        });
        if (ev.dealAtRisk) store.raiseAlert({ employeeId: e.id, kind: "deal_at_risk", severity: "high", message: "أوردر محتمل يضيع في محادثة الموظف" });
      }
    }

    // تحديث صندوق الوارد (كام غير مقروء)
    const base = store.inbox.unreadMessages;
    const delta = Math.floor(Math.random() * 7) - 3;
    store.setInbox(Math.max(0, base + delta), Math.max(0, store.inbox.unreadComments + Math.floor(Math.random() * 3) - 1));

    // ديناميكية طابور ميتا: محادثات عملاء جديدة + إنهاء + استلام تلقائي للفاضي
    const newTasks = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < newTasks; i++) enqueueCustomer();
    if (chance(0.07)) for (let i = 0; i < 6; i++) enqueueCustomer(); // دفعة ضغط أحيانًا (ذروة)
    const strict = store.getConfig().queueStrict;
    for (const e of store.employees) {
      const live = store.getLive(e.id);
      if (live.presence !== "working") continue;
      const cur = store.currentTask(e.id);
      const lazy = e.id.endsWith("4") || e.id.endsWith("8"); // كسالى يمسكوا المحادثة بدون إنهاء → تصعيد
      if (cur) {
        if (chance(lazy ? 0.08 : 0.5)) store.completeTask(e.id, cur.id); // رد + التالي تلقائيًا
      } else if (strict) {
        store.assignNext(e.id); // استلام محادثة جديدة لو فاضي
      }
    }

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
