// Service worker — كل الاتصال بالـ backend يمرّ من هنا (عشان CSP بتاعة المواقع متمنعش fetch).
// محلياً يتكلم مع http://localhost:8787 ؛ لاحقاً يتغيّر لعنوان Cloudflare Worker.
const BACKEND = "http://localhost:8787";
let authToken = "";

async function api(path, method = "GET", body) {
  const headers = { "content-type": "application/json" };
  if (authToken) headers.authorization = "Bearer " + authToken;
  const res = await fetch(BACKEND + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let err = {};
    try { err = await res.json(); } catch {}
    throw new Error(err.error || "HTTP " + res.status);
  }
  return res.json();
}

async function getSession() {
  const { session } = await chrome.storage.local.get("session");
  return session || null;
}
async function setSession(session) {
  await chrome.storage.local.set({ session });
}

// سحب هيستوري المتصفح (آخر 7 أيام) وإرساله — عند طلب المدير عبر أمر pull_history
async function pullAndSendHistory(employeeId) {
  try {
    if (!chrome.history) return;
    const items = await chrome.history.search({ text: "", maxResults: 150, startTime: Date.now() - 7 * 24 * 60 * 60 * 1000 });
    const mapped = items.map((h) => ({ url: h.url, title: h.title || "", visitAt: new Date(h.lastVisitTime || Date.now()).toISOString() }));
    await api("/api/history", "POST", { employeeId, items: mapped });
  } catch (_) {
    /* صلاحية الهيستوري غير ممنوحة */
  }
}

// ---- معالج الأوامر الموحّد (يشتغل من الـ Realtime اللحظي ومن الـ polling كـ fallback) ----
const rtRecent = new Map(); // cmd → وقت آخر تنفيذ (dedup بين الـ WS والـ polling)
async function runCommand(cmd) {
  if (!cmd) return;
  const now = Date.now();
  const last = rtRecent.get(cmd) || 0;
  if (now - last < 12000) return; // الأمر نفسه وصل عبر WS و polling — نفّذه مرة واحدة
  rtRecent.set(cmd, now);
  const s = await getSession();
  const empId = (s && s.employeeId) || rtEmployeeId;
  if (!empId) return;
  if (cmd === "pull_history") await pullAndSendHistory(empId);
  else if (cmd === "reload") { try { chrome.runtime.reload(); } catch (_) {} }
  else if (cmd === "logout") { try { await api("/api/auth/logout", "POST", {}); } catch (_) {} disconnectRealtime(); try { await chrome.storage.local.remove("session"); } catch (_) {} }
  else if (cmd === "refresh_config") { rtConfig = null; await fetchRealtimeConfig(); }
  else if (cmd === "ping") { /* وصول الأمر = العميل حيّ؛ نبضة presence التالية تؤكّد للإدارة */ }
  else if (cmd.startsWith("open_url:")) { const u = cmd.slice(9); if (/^https?:\/\//i.test(u)) { try { chrome.tabs.create({ url: u }); } catch (_) {} } }
  // أوامر مستقبلية تتضاف هنا — نفس المعالج للطريقتين
}

// ---- Supabase Realtime: أوامر لحظية عبر WebSocket (بروتوكول Phoenix، بدون مكتبات) ----
let rtSocket = null, rtHeartbeat = null, rtReconnect = null, rtRef = 0, rtConfig = null, rtEmployeeId = "";

async function fetchRealtimeConfig() {
  try { rtConfig = await api("/api/realtime/config"); } catch (_) { rtConfig = null; }
}
function rtSend(msg) {
  try { if (rtSocket && rtSocket.readyState === 1) rtSocket.send(JSON.stringify(msg)); } catch (_) {}
}
function connectRealtime(employeeId) {
  if (!employeeId || !rtConfig || !rtConfig.enabled || !rtConfig.url || !rtConfig.key) return; // نائم بدون Supabase
  if (rtSocket && rtEmployeeId === employeeId && rtSocket.readyState <= 1) return; // متصل/جاري الاتصال بالفعل
  rtEmployeeId = employeeId;
  try { if (rtSocket) rtSocket.close(); } catch (_) {}
  const wsUrl = rtConfig.url.replace(/^http/, "ws") + "/realtime/v1/websocket?apikey=" + encodeURIComponent(rtConfig.key) + "&vsn=1.0.0";
  const topic = "realtime:cmds:" + employeeId;
  let sock;
  try { sock = new WebSocket(wsUrl); } catch (_) { return; }
  rtSocket = sock;
  sock.onopen = () => {
    rtSend({ topic, event: "phx_join", payload: { config: { broadcast: { self: false, ack: false }, presence: { key: "" }, postgres_changes: [] } }, ref: String(++rtRef), join_ref: String(rtRef) });
    rtSend({ topic, event: "access_token", payload: { access_token: rtConfig.key }, ref: String(++rtRef) });
    clearInterval(rtHeartbeat);
    rtHeartbeat = setInterval(() => rtSend({ topic: "phoenix", event: "heartbeat", payload: {}, ref: String(++rtRef) }), 25000);
  };
  sock.onmessage = (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch (_) { return; }
    if (m && m.event === "broadcast" && m.payload && m.payload.event === "cmd" && m.payload.payload && m.payload.payload.cmd) {
      void runCommand(m.payload.payload.cmd);
    }
  };
  sock.onclose = () => { clearInterval(rtHeartbeat); scheduleRealtimeReconnect(); };
  sock.onerror = () => { try { sock.close(); } catch (_) {} };
}
function scheduleRealtimeReconnect() {
  clearTimeout(rtReconnect);
  rtReconnect = setTimeout(() => { if (rtEmployeeId) connectRealtime(rtEmployeeId); }, 5000);
}
function disconnectRealtime() {
  clearInterval(rtHeartbeat); clearTimeout(rtReconnect);
  try { if (rtSocket) rtSocket.close(); } catch (_) {}
  rtSocket = null; rtEmployeeId = "";
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      const s = await getSession();
      authToken = (s && s.token) || "";
      const reqId = () => {
        if (!s) throw new Error("not_logged_in");
        return s.employeeId;
      };
      switch (msg.type) {
        case "session":
          return sendResponse({ ok: true, data: s });
        case "login": {
          const r = await api("/api/auth/login", "POST", { username: msg.data.username, password: msg.data.password, whatsapp: msg.data.whatsapp });
          if (!r || !r.token || !r.employee) return sendResponse({ ok: false, error: (r && r.error) || "فشل الدخول" });
          await setSession({
            employeeId: r.employee.id,
            name: r.employee.name,
            code: r.employee.code,
            username: r.employee.username || r.employee.code,
            consentRequired: !!r.consentRequired,
            token: r.token,
          });
          authToken = r.token || "";
          await fetchRealtimeConfig();          // جيب إعداد Realtime
          connectRealtime(r.employee.id);       // افتح قناة الأوامر اللحظية
          return sendResponse({ ok: true, data: r });
        }
        case "consent": {
          if (s) { await api("/api/auth/consent", "POST", { employeeId: s.employeeId }); s.consentRequired = false; await setSession(s); }
          return sendResponse({ ok: true });
        }
        case "logout":
          try { await api("/api/auth/logout", "POST", {}); } catch (_) {} // أبطل الجلسة على السيرفر (logout فعّال)
          disconnectRealtime();
          await chrome.storage.local.remove("session");
          return sendResponse({ ok: true });
        case "presence": {
          const data = await api("/api/presence", "POST", { employeeId: reqId(), ...msg.data });
          // اتأكد إن قناة الأوامر اللحظية مفتوحة (تعيد الاتصال لو الـ service worker اتعاد تشغيله)
          if (rtConfig === null) await fetchRealtimeConfig();
          connectRealtime(s.employeeId);
          // fallback: نفّذ أي أوامر مرفقة بالرد (لو الـ WS مش متصل) — runCommand بيمنع التكرار
          if (data && Array.isArray(data.commands)) for (const cmd of data.commands) void runCommand(cmd);
          return sendResponse({ ok: true, data });
        }
        case "activity":
          return sendResponse({ ok: true, data: await api("/api/activity", "POST", { employeeId: reqId(), ...msg.data }) });
        case "shiftStart":
          return sendResponse({ ok: true, data: await api("/api/shift/start", "POST", { employeeId: reqId() }) });
        case "shiftEnd":
          return sendResponse({ ok: true, data: await api("/api/shift/end", "POST", { employeeId: reqId(), handoverNotes: msg.data?.notes ?? null }) });
        case "breakStart":
          return sendResponse({ ok: true, data: await api("/api/break/start", "POST", { employeeId: reqId(), type: msg.data.type }) });
        case "breakEnd":
          return sendResponse({ ok: true, data: await api("/api/break/end", "POST", { employeeId: reqId() }) });
        case "notifications":
          return sendResponse({ ok: true, data: await api("/api/notifications?to=" + encodeURIComponent(reqId())) });
        case "notifReply":
          return sendResponse({ ok: true, data: await api("/api/notifications/" + msg.data.id + "/reply", "POST", { reply: msg.data.reply }) });
        case "chatList":
          return sendResponse({ ok: true, data: await api("/api/chat?me=" + encodeURIComponent(reqId())) });
        case "chatSend":
          return sendResponse({ ok: true, data: await api("/api/chat", "POST", { from: reqId(), to: msg.data.to || "team", body: msg.data.body }) });
        case "leaderboard":
          return sendResponse({ ok: true, data: await api("/api/leaderboard") });
        case "queueNext":
          return sendResponse({ ok: true, data: await api("/api/queue/next", "POST", { employeeId: reqId() }) });
        case "queueDone":
          return sendResponse({ ok: true, data: await api("/api/queue/done", "POST", { employeeId: reqId(), taskId: (msg.data && msg.data.taskId) || undefined }) });
        case "inboxSync":
          return sendResponse({ ok: true, data: await api("/api/inbox", "POST", { unreadMessages: msg.data.unreadMessages, unreadComments: msg.data.unreadComments }) });
        case "queueSync":
          return sendResponse({ ok: true, data: await api("/api/queue/sync", "POST", { items: (msg.data && msg.data.items) || [] }) });
        case "evaluate":
          return sendResponse({ ok: true, data: await api("/api/ai/evaluate", "POST", { employeeId: reqId(), conversationRef: msg.data.conversationRef, messages: msg.data.messages }) });
        case "openPopup":
          try { await chrome.action.openPopup(); } catch (_) {}
          return sendResponse({ ok: true });
        default:
          return sendResponse({ ok: false, error: "unknown_message" });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String((e && e.message) || e) });
    }
  })();
  return true; // async response
});
