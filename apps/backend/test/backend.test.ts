import test from "node:test";
import assert from "node:assert/strict";
import { signToken, verifyToken } from "../src/auth";
import { evaluateLocal } from "../src/ai";
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
