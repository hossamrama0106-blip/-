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
          const r = await api("/api/auth/login", "POST", { code: msg.data.code, whatsapp: msg.data.whatsapp });
          await setSession({
            employeeId: r.employee.id,
            name: r.employee.name,
            code: r.employee.code,
            consentRequired: !!r.consentRequired,
            token: r.token,
          });
          authToken = r.token || "";
          return sendResponse({ ok: true, data: r });
        }
        case "consent": {
          if (s) { await api("/api/auth/consent", "POST", { employeeId: s.employeeId }); s.consentRequired = false; await setSession(s); }
          return sendResponse({ ok: true });
        }
        case "logout":
          try { await api("/api/auth/logout", "POST", {}); } catch (_) {} // أبطل الجلسة على السيرفر (logout فعّال)
          await chrome.storage.local.remove("session");
          return sendResponse({ ok: true });
        case "presence": {
          const data = await api("/api/presence", "POST", { employeeId: reqId(), ...msg.data });
          if (data && Array.isArray(data.commands) && data.commands.includes("pull_history")) {
            void pullAndSendHistory(s.employeeId);
          }
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
