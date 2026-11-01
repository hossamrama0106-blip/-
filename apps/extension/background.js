// Service worker — كل الاتصال بالـ backend يمرّ من هنا (عشان CSP بتاعة المواقع متمنعش fetch).
// محلياً يتكلم مع http://localhost:8787 ؛ لاحقاً يتغيّر لعنوان Cloudflare Worker.
const BACKEND = "http://localhost:8787";

async function api(path, method = "GET", body) {
  const res = await fetch(BACKEND + path, {
    method,
    headers: { "content-type": "application/json" },
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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      const s = await getSession();
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
          });
          return sendResponse({ ok: true, data: r });
        }
        case "consent": {
          if (s) { await api("/api/auth/consent", "POST", { employeeId: s.employeeId }); s.consentRequired = false; await setSession(s); }
          return sendResponse({ ok: true });
        }
        case "logout":
          await chrome.storage.local.remove("session");
          return sendResponse({ ok: true });
        case "presence":
          return sendResponse({ ok: true, data: await api("/api/presence", "POST", { employeeId: reqId(), ...msg.data }) });
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
