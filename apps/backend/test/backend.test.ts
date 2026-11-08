import test from "node:test";
import assert from "node:assert/strict";
import { signToken, verifyToken } from "../src/auth";
import { evaluateLocal, classifyComment } from "../src/ai";
import { store } from "../src/store";

// ---------- auth ----------
test("auth: توكن صحيح يُقرأ ويرجّع الهوية", () => {
  const t = signToken("emp_x", "employee");
  const id = verifyToken(t);
  assert.equal(id?.id, "emp_x");
  assert.equal(id?.role, "employee");
});

test("auth: توكن معبوث/فارغ يُرفض", () => {
  const t = signToken("emp_x", "admin");
  assert.equal(verifyToken(t.slice(0, -2) + "zz"), null);
  assert.equal(verifyToken("garbage"), null);
  assert.equal(verifyToken(""), null);
  assert.equal(verifyToken(null), null);
});

// ---------- ai ----------
test("ai: رد جيد يأخذ تقييم مرتفع", () => {
  const r = evaluateLocal({
    messages: [
      { role: "customer", text: "سعره كام؟" },
      { role: "agent", text: "أهلاً بحضرتك 😊 سعره 299 ومتوفر كل المقاسات" },
    ],
  });
  assert.equal(r.verdict, "good");
  assert.ok(r.score >= 75);
});

test("ai: عدم الرد على عميل شاري = bad + dealAtRisk", () => {
  const r = evaluateLocal({ messages: [{ role: "customer", text: "عايز اشتري الجاكيت ده" }] });
  assert.equal(r.verdict, "bad");
  assert.equal(r.dealAtRisk, true);
});

// ---------- store ----------
test("store: الرد يزوّد العدّاد", () => {
  const before = store.getCounters("emp_002").msgs;
  store.addActivity({ employeeId: "emp_002", type: "reply", channel: "messenger" });
  assert.equal(store.getCounters("emp_002").msgs, before + 1);
});

test("store: كاشف التهرب يسجّل مخالفة بعد 3 فتحات بدون رد", () => {
  const before = store.violations.filter((v) => v.employeeId === "emp_007" && v.type === "تهرب من عميل").length;
  for (let i = 0; i < 3; i++) store.addActivity({ employeeId: "emp_007", type: "open_no_reply", channel: "messenger" });
  const after = store.violations.filter((v) => v.employeeId === "emp_007" && v.type === "تهرب من عميل").length;
  assert.ok(after > before);
});

test("store: التنظيف الذاتي يحدّ المخالفات إلى 500", () => {
  for (let i = 0; i < 600; i++) store.addViolation({ employeeId: "emp_001", type: "test", reason: "x" });
  store.purge();
  assert.ok(store.violations.length <= 500);
});

test("store: الرادار الليلي معطّلًا يرجّع enabled=false", () => {
  store.setNightMode(false);
  assert.equal(store.nightScan().enabled, false);
});

test("store: إضافة/حذف موظف", () => {
  const e = store.addEmployee({ code: "ZZTEST", name: "اختبار", whatsapp: "+200" });
  assert.ok(store.findEmployee(e.id));
  assert.equal(store.removeEmployee(e.id), true);
  assert.equal(store.findEmployee(e.id), null);
});

// ---------- queue (طابور ميتا الإجباري) ----------
test("queue: الإسناد يحترم الأولوية (vip قبل normal)", () => {
  store.queue.length = 0;
  store.startShift("emp_010");
  store.releaseEmployeeTasks("emp_010");
  store.enqueueTask({ customerRef: "QT1-n", priority: "normal" });
  const vip = store.enqueueTask({ customerRef: "QT1-v", priority: "vip" });
  const got = store.assignNext("emp_010");
  assert.equal(got?.id, vip.id);
  assert.equal(store.currentTask("emp_010")?.id, vip.id);
});

test("queue: تم،التالي يُنهي المهمة ويُسند التالية تلقائيًا", () => {
  store.queue.length = 0;
  store.setConfig({ queueStrict: true }); // هذا الاختبار يغطّي وضع الإجبار التلقائي
  store.startShift("emp_011");
  store.releaseEmployeeTasks("emp_011");
  const t1 = store.enqueueTask({ customerRef: "QT2-a" });
  const t2 = store.enqueueTask({ customerRef: "QT2-b" });
  assert.equal(store.assignNext("emp_011")?.id, t1.id);
  // إسناد واحد في المرة: الاستدعاء الثاني يرجّع نفس المهمة
  assert.equal(store.assignNext("emp_011")?.id, t1.id);
  const doneBefore = store.tasksDoneToday("emp_011");
  const r = store.completeTask("emp_011");
  assert.equal(r.done?.id, t1.id);
  assert.equal(r.next?.id, t2.id);
  assert.equal(store.tasksDoneToday("emp_011"), doneBefore + 1);
});

test("queue: البريك يرجّع المهمة للطابور", () => {
  store.queue.length = 0;
  store.startShift("emp_012");
  store.releaseEmployeeTasks("emp_012");
  const t = store.enqueueTask({ customerRef: "QT3-a" });
  store.assignNext("emp_012");
  assert.equal(store.currentTask("emp_012")?.id, t.id);
  store.startBreak("emp_012", "break");
  assert.equal(store.currentTask("emp_012"), null);
  assert.equal(store.queue.find((x) => x.id === t.id)?.status, "waiting");
  store.endBreak("emp_012");
});

test("queue: الإحصائيات تعدّ المنتظر والمسند", () => {
  store.queue.length = 0;
  store.enqueueTask({ customerRef: "QT4-a" });
  store.enqueueTask({ customerRef: "QT4-b" });
  const s = store.queueStats();
  assert.equal(s.waiting, 2);
  assert.equal(s.assigned, 0);
});

// ---------- توزيع الطابور حسب القناة ----------
test("queue: queueByChannel يعدّ المنتظر لكل قناة", () => {
  store.queue.length = 0;
  store.enqueueTask({ customerRef: "WA1", channel: "whatsapp" });
  store.enqueueTask({ customerRef: "WA2", channel: "whatsapp" });
  store.enqueueTask({ customerRef: "IG1", channel: "instagram" });
  const by = store.queueByChannel();
  assert.equal(by.whatsapp?.waiting, 2);
  assert.equal(by.instagram?.waiting, 1);
  assert.equal(by.messenger, undefined); // لا يوجد ماسنجر في الطابور
});

// ---------- تقرير الأداء اليومي ----------
test("report: dailyReport يرجّع صفًّا لكل موظف + إجماليات متّسقة", () => {
  const r = store.dailyReport();
  // صف لكل موظف خاضع للمراقبة (استبعاد المدير/القائد)
  assert.equal(r.rows.length, store.employees.filter((e) => e.role === "employee").length);
  assert.equal(r.team.employees, r.rows.length);
  // إجمالي الرسائل = مجموع صفوف الموظفين (اتّساق التجميع)
  const sumMsgs = r.rows.reduce((a, x) => a + x.msgs, 0);
  assert.equal(r.team.msgs, sumMsgs);
  // بنية جودة الردود موجودة
  assert.ok(typeof r.team.reviews.good === "number");
  assert.ok(typeof r.byChannel === "object");
});

// ---------- بوت التعليقات ----------
test("comments: التصنيف يرفع أولوية نية الشراء والشكوى", () => {
  assert.equal(classifyComment("عايز اشتري الجاكيت ده بكام؟").priority, "vip");
  assert.equal(classifyComment("طلبي متأخر وفين فلوسي").priority, "high");
  assert.equal(classifyComment("تمام شكرا").priority, "normal");
});

test("comments: ingest يضيف للطابور بقناة التعليقات ويمنع التكرار", () => {
  store.queue.length = 0;
  store.comments.length = 0;
  const r1 = store.ingestComments([
    { id: "c1", text: "عايز اشتري ده", from: "عميل" },
    { id: "c2", text: "تعليق عادي" },
  ]);
  assert.equal(r1.added, 2);
  const r2 = store.ingestComments([{ id: "c1", text: "عايز اشتري ده", from: "عميل" }]); // تكرار
  assert.equal(r2.added, 0);
  assert.equal(r2.skipped, 1);
  const inQueue = store.queue.filter((t) => t.channel === "comments");
  assert.equal(inQueue.length, 2);
  assert.ok(inQueue.some((t) => t.priority === "vip")); // نية الشراء دخلت vip
});
