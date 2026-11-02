// تعريف مسارات الـ API — Hono. يعمل محلياً على Node ولاحقاً على Cloudflare Workers بنفس الكود.
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { DEV_ADMIN_CODE, Role, type LoginResult } from "@khiam/shared";
import { store } from "./store";
import { hub } from "./realtime";
import { aiMode, evaluateReply } from "./ai";
import { signToken, verifyToken } from "./auth";

export const app = new Hono();

app.use(
  "*",
  cors({
    origin: (o) => (o && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o) ? o : ""),
    allowHeaders: ["content-type", "authorization"],
  }),
);

app.onError((err, c) => c.json({ error: String((err as any)?.message || err) }, 500));
app.notFound((c) => c.json({ error: "not_found" }, 404));

// بوّابة المصادقة والصلاحيات لكل /api (ما عدا health و login)
const OPEN = new Set(["/api/health", "/api/auth/login"]);
function bearer(c: any): string {
  const h = c.req.header("authorization") || "";
  if (h.startsWith("Bearer ")) return h.slice(7);
  return c.req.query("token") || "";
}
app.use("/api/*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (OPEN.has(path)) return next();
  const id = verifyToken(bearer(c));
  if (!id) return c.json({ error: "unauthorized" }, 401);
  const m = c.req.method;

  const adminOnly =
    path.startsWith("/api/employees") ||
    (path.startsWith("/api/screenshots") && m === "GET") ||
    path === "/api/snapshot" ||
    path === "/api/leaderboard" ||
    path === "/api/counters" ||
    path.startsWith("/api/alerts") ||
    path === "/api/ai/status" ||
    (path === "/api/violations" && m === "POST") ||
    (path === "/api/points" && m === "POST") ||
    (path === "/api/notifications" && m === "POST") ||
    (path === "/api/inbox" && m === "POST") ||
    (path === "/api/ai/night-mode" && m === "POST") ||
    path === "/api/timeline" ||
    (path === "/api/history" && m === "GET") ||
    path === "/api/settings" ||
    path === "/api/queue" ||
    (path === "/api/queue/enqueue" && m === "POST") ||
    (path.startsWith("/api/queue/") && (path.endsWith("/assign") || path.endsWith("/skip"))) ||
    (path === "/api/reviews" && !c.req.query("employeeId"));
  if (adminOnly && id.role !== "admin") return c.json({ error: "forbidden" }, 403);

  if (id.role !== "admin") {
    const SELF_POST = new Set([
      "/api/presence", "/api/activity", "/api/shift/start", "/api/shift/end",
      "/api/break/start", "/api/break/end", "/api/auth/consent", "/api/ai/evaluate", "/api/screenshots", "/api/history",
      "/api/queue/next", "/api/queue/done",
    ]);
    if (m === "POST" && SELF_POST.has(path)) {
      let body: any = {};
      try { body = await c.req.json(); } catch {}
      if (body.employeeId && body.employeeId !== id.id) return c.json({ error: "forbidden" }, 403);
    }
    if (m === "GET" && path === "/api/notifications" && c.req.query("to") !== id.id) return c.json({ error: "forbidden" }, 403);
    if (m === "GET" && path === "/api/chat" && c.req.query("me") !== id.id) return c.json({ error: "forbidden" }, 403);
    if (m === "GET" && path === "/api/reviews" && c.req.query("employeeId") !== id.id) return c.json({ error: "forbidden" }, 403);
    if (m === "GET" && path === "/api/queue/mine" && c.req.query("employeeId") !== id.id) return c.json({ error: "forbidden" }, 403);
  }
  await next();
});

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
    const result: LoginResult = { token: signToken(admin.id, "admin"), employee: { ...admin, role: Role.ADMIN }, consentRequired: false };
    return c.json(result);
  }
  const emp = store.findByCode(code);
  if (!emp) return c.json({ error: "كود غير صحيح" }, 404);
  if (!emp.active) return c.json({ error: "الحساب معطّل" }, 403);
  if (whatsapp && !emp.whatsapp) store.updateEmployee(emp.id, { whatsapp });
  const result: LoginResult = {
    token: signToken(emp.id, "employee"),
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
  const live = store.setLiveFlags(id, { liveWatching: patch.liveWatching, spotlight: patch.spotlight, superMonitor: patch.superMonitor });
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
  const commands = store.popCommands(body.employeeId);
  return c.json({
    ...live,
    commands,
    peak: store.peakStatus(),
    task: store.currentTask(body.employeeId),
    queueWaiting: store.waitingCount(),
    queueStrict: store.getConfig().queueStrict,
  });
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
app.get("/api/reviews", (c) => {
  const id = c.req.query("employeeId");
  return c.json(id ? store.reviewsFor(id) : store.reviews.slice(-50).reverse());
});
app.post("/api/reviews", async (c) => {
  const body = await c.req.json();
  return c.json(store.addReview(body), 201);
});
app.get("/api/points", (c) => c.json(store.points));
app.post("/api/points", async (c) => {
  const body = await c.req.json<{ employeeId: string; delta: number; reason: string }>();
  return c.json(store.addPoint({ ...body, source: "manual" }), 201);
});

// ---------- AI (تقييم الردود + الرادار الليلي) ----------
app.get("/api/ai/status", (c) => c.json({ mode: aiMode(), nightMode: store.nightMode }));
app.post("/api/ai/evaluate", async (c) => {
  const body = await c.req.json<{ employeeId: string; conversationRef?: string; messages: { role: string; text: string }[] }>();
  const result = await evaluateReply({ messages: body.messages, conversationRef: body.conversationRef });
  const review = store.addReview({
    employeeId: body.employeeId,
    conversationRef: body.conversationRef || "—",
    verdict: result.verdict,
    score: result.score,
    aiNotes: result.notes,
    sampleText: (body.messages || []).map((m) => `${m.role}: ${m.text}`).join("\n").slice(0, 400),
    evidenceUrl: (body as any).evidenceUrl ?? null,
  });
  if (result.dealAtRisk) {
    store.raiseAlert({ employeeId: body.employeeId, kind: "deal_at_risk", severity: "high", message: "أوردر محتمل يضيع — تدخّل الآن" });
  }
  return c.json({ review, result }, 201);
});
app.get("/api/ai/night-mode", (c) => c.json({ enabled: store.nightMode }));
app.post("/api/ai/night-mode", async (c) => {
  const { enabled } = await c.req.json<{ enabled: boolean }>();
  return c.json({ enabled: store.setNightMode(!!enabled) });
});

// ---------- violations ----------
app.get("/api/violations", (c) => c.json(store.violations));
app.post("/api/violations", async (c) => {
  const body = await c.req.json<any>();
  if (body.imageUrl && String(body.imageUrl).length > 900000) return c.json({ error: "image too large" }, 400);
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

// ---------- طابور ميتا الإجباري ----------
app.get("/api/queue", (c) => c.json(store.queueStats()));
app.post("/api/queue/enqueue", async (c) => {
  const body = await c.req.json<{ channel?: string; customerRef: string; preview?: string; link?: string; priority?: string }>();
  if (!body.customerRef) return c.json({ error: "customerRef required" }, 400);
  return c.json(store.enqueueTask(body), 201);
});
app.post("/api/queue/next", async (c) => {
  const { employeeId } = await c.req.json<{ employeeId: string }>();
  return c.json({ task: store.assignNext(employeeId), queueWaiting: store.waitingCount() });
});
app.post("/api/queue/done", async (c) => {
  const { employeeId, taskId } = await c.req.json<{ employeeId: string; taskId?: string }>();
  const r = store.completeTask(employeeId, taskId);
  return c.json({ ...r, queueWaiting: store.waitingCount() });
});
app.get("/api/queue/mine", (c) => c.json(store.currentTask(c.req.query("employeeId") ?? "")));
app.post("/api/queue/:id/assign", async (c) => {
  const { employeeId } = await c.req.json<{ employeeId: string }>();
  const t = store.assignTask(c.req.param("id"), employeeId);
  return t ? c.json(t) : c.json({ error: "not found" }, 404);
});
app.post("/api/queue/:id/skip", async (c) => {
  const { reason } = await c.req.json<{ reason?: string }>().catch(() => ({ reason: undefined }));
  const t = store.skipTask(c.req.param("id"), reason);
  return t ? c.json(t) : c.json({ error: "not found" }, 404);
});

// ---------- alerts ----------
app.get("/api/alerts", (c) => c.json(store.alerts.filter((a) => !a.resolvedAt)));
app.post("/api/alerts/:id/resolve", (c) => {
  const a = store.resolveAlert(c.req.param("id"));
  return a ? c.json(a) : c.json({ error: "not found" }, 404);
});

// ---------- screenshots ----------
app.post("/api/screenshots", async (c) => {
  const body = await c.req.json<{ employeeId: string; dataUrl: string; width?: number; height?: number; isViolation?: boolean; ocrText?: string | null }>();
  if (!body.dataUrl || body.dataUrl.length > 700000) return c.json({ error: "invalid or too large" }, 400);
  return c.json(store.addScreenshot(body), 201);
});
app.get("/api/screenshots", (c) => {
  const id = c.req.query("employeeId");
  if (!id) return c.json(store.screenshots.slice(-30).reverse());
  return c.json(store.screenshotsFor(id));
});
app.get("/api/screenshots/latest", (c) => {
  const id = c.req.query("employeeId") ?? "";
  return c.json(store.latestScreenshot(id));
});

// ---------- timeline / history / commands / settings ----------
app.get("/api/timeline", (c) => c.json(store.timelineFor(c.req.query("employeeId") ?? "", Number(c.req.query("limit") ?? 60))));
app.get("/api/history", (c) => c.json(store.historyFor(c.req.query("employeeId") ?? "", Number(c.req.query("limit") ?? 100))));
app.post("/api/history", async (c) => {
  const body = await c.req.json<{ employeeId: string; items: { url: string; title?: string; visitAt?: string }[] }>();
  return c.json({ added: store.addHistory(body.employeeId, body.items || []) }, 201);
});
app.post("/api/employees/:id/command", async (c) => {
  const { cmd } = await c.req.json<{ cmd: string }>();
  store.queueCommand(c.req.param("id"), cmd);
  return c.json({ ok: true });
});
app.get("/api/screenshots/:id", (c) => {
  const s = store.screenshots.find((x) => x.id === c.req.param("id"));
  return s ? c.json(s) : c.json({ error: "not_found" }, 404);
});
app.get("/api/settings", (c) => c.json(store.getConfig()));
app.post("/api/settings", async (c) => {
  const body = await c.req.json<{ googleSheetWebhook?: string; ntfyTopic?: string }>();
  return c.json(store.setConfig(body));
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
    reviews: store.reviews.slice(-30).reverse(),
    nightMode: store.nightMode,
    aiMode: aiMode(),
    peak: store.peakStatus(),
    queue: store.queueStats(),
  }),
);

// ---------- realtime SSE ----------
app.get("/api/stream", (c) => {
  const id = verifyToken(bearer(c));
  const role = id?.role === "admin" ? "admin" : "employee";
  const employeeId = id?.id;
  return streamSSE(c, async (stream) => {
    const id = crypto.randomUUID();
    const queue: string[] = [];
    let wake: (() => void) | null = null;

    hub.add({
      id,
      role,
      employeeId,
      send: (data) => {
        if (queue.length > 1000) queue.shift(); // حد أقصى للعميل البطيء (يمنع تضخّم الذاكرة)
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
