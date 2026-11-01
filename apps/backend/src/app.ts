// تعريف مسارات الـ API — Hono. يعمل محلياً على Node ولاحقاً على Cloudflare Workers بنفس الكود.
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { DEV_ADMIN_CODE, Role, type LoginResult } from "@khiam/shared";
import { store } from "./store";
import { hub } from "./realtime";

export const app = new Hono();

app.use("*", cors());

const token = (id: string) => Buffer.from(`${id}:${Date.now()}`).toString("base64url");

// ---------- health / system check ----------
app.get("/api/health", (c) =>
  c.json({
    ok: true,
    service: "khiam-backend",
    mode: "local-memory",
    clients: hub.count(),
    employees: store.employees.length,
    time: new Date().toISOString(),
  }),
);

// ---------- test page (لمعاينة شريط الإكستنشن بدون ميتا) ----------
app.get("/", (c) => c.html(`<!doctype html><meta charset=utf-8><body style="font-family:sans-serif;background:#0f141c;color:#e5e7eb;padding:40px"><h2>Khiam backend شغّال ✅</h2><p>الداشبورد: <a style=color:#818cf8 href="http://localhost:5173">localhost:5173</a> · صفحة تجربة الإكستنشن: <a style=color:#818cf8 href="/test">/test</a></p>`));
app.get("/test", (c) =>
  c.html(`<!doctype html><html lang=ar dir=rtl><head><meta charset=utf-8><title>Meta Business Suite — الوارد (تجربة)</title>
  <style>body{font-family:Tahoma,sans-serif;background:#0b0f17;color:#e5e7eb;margin:0;padding:60px 24px}
  .box{max-width:640px;margin:auto;background:#111827;border:1px solid #273243;border-radius:12px;padding:20px}
  textarea{width:100%;height:90px;background:#1b2432;border:1px solid #273243;border-radius:8px;color:#fff;padding:10px;font-size:14px}
  h3{color:#fff}</style></head><body>
  <div class=box>
  <h3>صفحة تجربة — محاكاة صندوق وارد</h3>
  <p>سجّل الدخول من أيقونة الإضافة (كود مثل K1002)، هيظهر الشريط فوق. اكتب هنا واضغط Enter = يترن ويتسجّل رد.</p>
  <textarea placeholder="اكتب ردًا واضغط Enter…"></textarea>
  </div></body></html>`),
);

// ---------- auth ----------
app.post("/api/auth/login", async (c) => {
  const { code, whatsapp } = await c.req.json<{ code: string; whatsapp?: string }>();
  if (code?.toUpperCase() === DEV_ADMIN_CODE) {
    const admin = store.employees.find((e) => e.role === Role.ADMIN) ?? store.employees[0];
    const result: LoginResult = { token: token("admin"), employee: { ...admin, role: Role.ADMIN }, consentRequired: false };
    return c.json(result);
  }
  const emp = store.findByCode(code);
  if (!emp) return c.json({ error: "كود غير صحيح" }, 404);
  if (!emp.active) return c.json({ error: "الحساب معطّل" }, 403);
  if (whatsapp && !emp.whatsapp) store.updateEmployee(emp.id, { whatsapp });
  const result: LoginResult = {
    token: token(emp.id),
    employee: emp,
    consentRequired: emp.consentAt == null,
  };
  return c.json(result);
});

app.post("/api/auth/consent", async (c) => {
  const { employeeId } = await c.req.json<{ employeeId: string }>();
  const emp = store.setConsent(employeeId);
  if (!emp) return c.json({ error: "not found" }, 404);
  return c.json(emp);
});

// ---------- employees ----------
app.get("/api/employees", (c) =>
  c.json({
    employees: store.employees,
    live: Object.fromEntries(store.live),
  }),
);

app.post("/api/employees", async (c) => {
  const body = await c.req.json<{ code: string; name: string; whatsapp: string; role?: string }>();
  if (!body.code || !body.name) return c.json({ error: "code and name required" }, 400);
  return c.json(store.addEmployee(body), 201);
});

app.patch("/api/employees/:id", async (c) => {
  const patch = await c.req.json();
  const emp = store.updateEmployee(c.req.param("id"), patch);
  if (!emp) return c.json({ error: "not found" }, 404);
  return c.json(emp);
});

app.delete("/api/employees/:id", (c) => {
  const ok = store.removeEmployee(c.req.param("id"));
  return c.json({ ok });
});

// مراقبة فائقة / لايف / spotlight
app.post("/api/employees/:id/flags", async (c) => {
  const id = c.req.param("id");
  const patch = await c.req.json<{ liveWatching?: boolean; spotlight?: boolean; superMonitor?: boolean }>();
  if (patch.superMonitor !== undefined) store.updateEmployee(id, { superMonitor: patch.superMonitor });
  const live = store.setLiveFlags(id, { liveWatching: patch.liveWatching, spotlight: patch.spotlight });
  return c.json(live);
});

// ---------- presence / heartbeat ----------
app.post("/api/presence", async (c) => {
  const body = await c.req.json<{
    employeeId: string;
    status?: string;
    typing?: boolean;
    typingWpm?: number;
    currentWindow?: string;
    currentConversation?: string | null;
    mouseMoved?: boolean;
    extensionConnected?: boolean;
    agentConnected?: boolean;
  }>();
  const live = store.heartbeat(body.employeeId, body as any);
  return c.json(live);
});

// ---------- shifts / breaks ----------
app.post("/api/shift/start", async (c) => {
  const { employeeId } = await c.req.json<{ employeeId: string }>();
  return c.json(store.startShift(employeeId));
});
app.post("/api/shift/end", async (c) => {
  const { employeeId, handoverNotes } = await c.req.json<{ employeeId: string; handoverNotes?: string }>();
  const s = store.endShift(employeeId, handoverNotes ?? null);
  return s ? c.json(s) : c.json({ error: "no active shift" }, 404);
});
app.post("/api/break/start", async (c) => {
  const { employeeId, type } = await c.req.json<{ employeeId: string; type: string }>();
  return c.json(store.startBreak(employeeId, type));
});
app.post("/api/break/end", async (c) => {
  const { employeeId } = await c.req.json<{ employeeId: string }>();
  const b = store.endBreak(employeeId);
  return b ? c.json(b) : c.json({ error: "no active break" }, 404);
});

// ---------- activity / counters ----------
app.post("/api/activity", async (c) => {
  const body = await c.req.json<{ employeeId: string; type: string; channel: string; ref?: string }>();
  return c.json(store.addActivity(body), 201);
});
app.get("/api/counters", (c) => {
  const date = c.req.query("date") ?? undefined;
  return c.json({ date: date ?? new Date().toISOString().slice(0, 10), counters: store.allCounters(date) });
});
app.get("/api/leaderboard", (c) => {
  const date = c.req.query("date") ?? undefined;
  return c.json(store.leaderboard(date));
});

// ---------- reviews / points ----------
app.get("/api/reviews", (c) => c.json(store.reviews));
app.post("/api/reviews", async (c) => {
  const body = await c.req.json();
  return c.json(store.addReview(body), 201);
});
app.get("/api/points", (c) => c.json(store.points));
app.post("/api/points", async (c) => {
  const body = await c.req.json<{ employeeId: string; delta: number; reason: string }>();
  return c.json(store.addPoint({ ...body, source: "manual" }), 201);
});

// ---------- violations ----------
app.get("/api/violations", (c) => c.json(store.violations));
app.post("/api/violations", async (c) => {
  const body = await c.req.json();
  return c.json(store.addViolation(body), 201);
});
app.post("/api/violations/:id/ack", async (c) => {
  const { reply } = await c.req.json<{ reply?: string }>();
  const v = store.ackViolation(c.req.param("id"), reply ?? null);
  return v ? c.json(v) : c.json({ error: "not found" }, 404);
});

// ---------- notifications ----------
app.get("/api/notifications", (c) => {
  const to = c.req.query("to");
  const list = to ? store.notifications.filter((n) => n.to === to || n.to === "all") : store.notifications;
  return c.json(list);
});
app.post("/api/notifications", async (c) => {
  const body = await c.req.json();
  return c.json(store.addNotification(body), 201);
});
app.post("/api/notifications/:id/reply", async (c) => {
  const { reply } = await c.req.json<{ reply: string }>();
  const n = store.replyNotification(c.req.param("id"), reply);
  return n ? c.json(n) : c.json({ error: "not found" }, 404);
});

// ---------- chat ----------
app.get("/api/chat", (c) => {
  const me = c.req.query("me") ?? "";
  const withId = c.req.query("with") ?? undefined;
  return c.json(store.chatFor(me, withId));
});
app.post("/api/chat", async (c) => {
  const body = await c.req.json<{ from: string; to: string; body: string }>();
  return c.json(store.addChat(body), 201);
});

// ---------- inbox ----------
app.get("/api/inbox", (c) => c.json(store.inbox));
app.post("/api/inbox", async (c) => {
  const { unreadMessages, unreadComments } = await c.req.json<{ unreadMessages: number; unreadComments: number }>();
  return c.json(store.setInbox(unreadMessages, unreadComments));
});

// ---------- alerts ----------
app.get("/api/alerts", (c) => c.json(store.alerts.filter((a) => !a.resolvedAt)));
app.post("/api/alerts/:id/resolve", (c) => {
  const a = store.resolveAlert(c.req.param("id"));
  return a ? c.json(a) : c.json({ error: "not found" }, 404);
});

// ---------- snapshot (الحالة الكاملة لأول تحميل) ----------
app.get("/api/snapshot", (c) =>
  c.json({
    employees: store.employees,
    live: Object.fromEntries(store.live),
    leaderboard: store.leaderboard(),
    inbox: store.inbox,
    alerts: store.alerts.filter((a) => !a.resolvedAt),
    violations: store.violations.slice(-50),
    notifications: store.notifications.slice(-50),
  }),
);

// ---------- realtime SSE ----------
app.get("/api/stream", (c) => {
  const role = (c.req.query("role") as "admin" | "employee") ?? "admin";
  const employeeId = c.req.query("employeeId") ?? undefined;
  return streamSSE(c, async (stream) => {
    const id = crypto.randomUUID();
    const queue: string[] = [];
    let wake: (() => void) | null = null;

    hub.add({
      id,
      role,
      employeeId,
      send: (data) => {
        queue.push(data);
        wake?.();
      },
    });

    stream.onAbort(() => {
      hub.remove(id);
      wake?.();
    });

    await stream.writeSSE({ event: "hello", data: JSON.stringify({ clients: hub.count() }) });

    let alive = true;
    stream.onAbort(() => (alive = false));
    while (alive) {
      if (queue.length === 0) {
        await new Promise<void>((r) => {
          wake = r;
          setTimeout(r, 15000);
        });
        wake = null;
      }
      while (queue.length) {
        const data = queue.shift()!;
        const parsed = JSON.parse(data);
        await stream.writeSSE({ event: parsed.event, data });
      }
      await stream.writeSSE({ event: "ping", data: "{}" });
    }
  });
});
