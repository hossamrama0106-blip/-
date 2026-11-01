// شريط Khiam Ops المحقون داخل مواقع العمل. Shadow DOM ثابت أعلى الصفحة ويصمد مع تحديثات الموقع.
(() => {
  "use strict";
  if (window.__khiamInjected) return;
  window.__khiamInjected = true;

  const HOST_ID = "khiam-ops-bar-host";
  const send = (type, data) =>
    new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type, data }, (r) => resolve(r || { ok: false, error: "no_response" }));
      } catch (e) {
        resolve({ ok: false, error: String(e) });
      }
    });

  // ---------- site/context ----------
  function detectSite() {
    const h = location.hostname;
    if (h.includes("business.facebook")) return "meta";
    if (h.includes("web.whatsapp")) return "whatsapp";
    if (h.includes("instagram")) return "instagram";
    if (h.includes("operix")) return "operix";
    if (h.includes("localhost")) return "test";
    return "other";
  }
  const SITE = detectSite();
  const CHANNEL = { meta: "messenger", whatsapp: "whatsapp", instagram: "instagram", operix: "operix", test: "messenger", other: "messenger" }[SITE];
  function isComments() {
    const t = (document.title + " " + location.href).toLowerCase();
    return t.includes("comment") || t.includes("تعليق") || t.includes("post");
  }

  // ---------- state ----------
  const state = {
    session: null,
    live: null,
    rank: null,
    total: 0,
    chatOpen: false,
    lastTypeAt: 0,
    keystrokes: [],
    lastActivityAt: 0,
    seenNotif: new Set(),
    spotlightBeeped: false,
  };

  // ---------- audio ----------
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {}
    }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  }
  function beep(freq = 660, dur = 0.08, vol = 0.05) {
    ensureAudio();
    if (!audioCtx) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g); g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + dur);
  }

  // ---------- shadow bar ----------
  let root, els;
  function mountBar() {
    let host = document.getElementById(HOST_ID);
    if (host) return;
    host = document.createElement("div");
    host.id = HOST_ID;
    host.style.cssText = "all:initial;position:fixed;top:0;left:0;right:0;height:36px;z-index:2147483647;";
    (document.documentElement || document.body).appendChild(host);
    root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; font-family: "Segoe UI", Tahoma, sans-serif; }
        .bar { direction: rtl; display:flex; align-items:center; gap:10px; height:36px; padding:0 12px;
               background:#0f141c; color:#e5e7eb; border-bottom:1px solid #273243; font-size:13px;
               box-shadow:0 2px 8px rgba(0,0,0,.3); }
        .brand { font-weight:800; color:#fff; letter-spacing:.3px; }
        .dot { width:9px;height:9px;border-radius:50%;display:inline-block; }
        .status { display:flex;align-items:center;gap:6px;color:#cbd5e1; }
        .spacer{ flex:1; }
        button { all:unset; cursor:pointer; padding:4px 10px;border-radius:7px;font-size:12px;font-weight:600;
                 background:#1b2432;color:#e5e7eb;border:1px solid #273243; transition:.15s; }
        button:hover{ background:#273243; }
        button.primary{ background:#6366f1;border-color:#6366f1;color:#fff; }
        button.warn{ background:#b45309;border-color:#b45309;color:#fff; }
        button.danger{ background:#b91c1c;border-color:#b91c1c;color:#fff; }
        .rank{ background:#111827;border:1px solid #273243;border-radius:999px;padding:3px 9px;color:#fbbf24;font-weight:700; }
        .spot{ display:none;align-items:center;gap:6px;background:#7f1d1d;color:#fecaca;padding:3px 9px;border-radius:7px;font-weight:700; }
        .spot.on{ display:flex; animation:pr 1.3s infinite; }
        .eye{ display:none;align-items:center;gap:5px;color:#fca5a5; }
        .eye.on{ display:flex; }
        @keyframes pr{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.6)}50%{box-shadow:0 0 0 7px rgba(239,68,68,0)}}
        .toast{ position:fixed;top:44px;left:12px;max-width:320px;background:#1b2432;border:1px solid #6366f1;
                color:#e5e7eb;padding:10px 12px;border-radius:10px;font-size:13px;margin-top:8px;box-shadow:0 6px 20px rgba(0,0,0,.4); }
        .toast .t{ font-weight:700;margin-bottom:3px;color:#a5b4fc; }
        .wrap{ direction:rtl; }
        .panel{ position:fixed;top:44px;left:12px;width:320px;max-height:60vh;background:#0f141c;border:1px solid #273243;
                border-radius:12px;display:none;flex-direction:column;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.5); }
        .panel.on{ display:flex; }
        .panel .head{ padding:10px 12px;border-bottom:1px solid #273243;font-weight:700;color:#fff; }
        .msgs{ flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:6px; }
        .m{ background:#1b2432;border-radius:8px;padding:6px 9px;font-size:12px;color:#e5e7eb; max-width:85%; }
        .m.me{ align-self:flex-start;background:#312e81; }
        .m .who{ font-size:10px;color:#94a3b8;margin-bottom:2px; }
        .inp{ display:flex;gap:6px;padding:8px;border-top:1px solid #273243; }
        .inp input{ all:unset;flex:1;background:#1b2432;border:1px solid #273243;border-radius:7px;padding:6px 9px;color:#fff;font-size:12px; }
        .consent{ display:none;direction:rtl;background:#0f141c;color:#e5e7eb;position:fixed;top:44px;left:12px;right:12px;max-width:520px;margin:8px auto;
                  border:1px solid #6366f1;border-radius:12px;padding:14px; }
        .consent.on{ display:block; }
      </style>
      <div class="wrap">
        <div class="bar">
          <span class="brand">Khiam Ops</span>
          <span class="status"><span class="dot" id="dot" style="background:#64748b"></span><span id="statusLabel">—</span></span>
          <span class="eye" id="eye">👁 مراقبة مباشرة</span>
          <span class="spacer"></span>
          <span class="spot" id="spot">🔴 الإدارة تتابع شاشتك الآن</span>
          <span class="rank" id="rank" style="display:none"></span>
          <span id="controls" style="display:flex;gap:8px;align-items:center"></span>
          <button id="chatBtn" title="الشات الداخلي">💬</button>
        </div>
        <div class="toast-area" id="toasts"></div>
        <div class="panel" id="panel">
          <div class="head">الشات الداخلي للفريق</div>
          <div class="msgs" id="msgs"></div>
          <div class="inp"><input id="chatInput" placeholder="اكتب رسالة للفريق…"><button class="primary" id="chatSend">إرسال</button></div>
        </div>
        <div class="consent" id="consent">
          <div style="font-weight:800;color:#fff;margin-bottom:6px">إشعار المتابعة</div>
          <div style="font-size:13px;line-height:1.7;color:#cbd5e1">
            هذا الجهاز مزوّد بنظام متابعة أداء (Khiam Ops) يسجّل عدد الرسائل والتعليقات والأوردرات وحالة العمل أثناء الشيفت،
            وقد تُلتقط لقطات شاشة أو بث مباشر للرقابة. بالضغط على "موافق" أنت تقرّ باطّلاعك على ذلك.
          </div>
          <div style="margin-top:10px;display:flex;gap:8px"><button class="primary" id="consentOk">موافق، ابدأ</button></div>
        </div>
      </div>`;
    els = {
      dot: root.getElementById("dot"),
      statusLabel: root.getElementById("statusLabel"),
      eye: root.getElementById("eye"),
      spot: root.getElementById("spot"),
      rank: root.getElementById("rank"),
      controls: root.getElementById("controls"),
      chatBtn: root.getElementById("chatBtn"),
      toasts: root.getElementById("toasts"),
      panel: root.getElementById("panel"),
      msgs: root.getElementById("msgs"),
      chatInput: root.getElementById("chatInput"),
      chatSend: root.getElementById("chatSend"),
      consent: root.getElementById("consent"),
      consentOk: root.getElementById("consentOk"),
    };
    els.chatBtn.addEventListener("click", toggleChat);
    els.chatSend.addEventListener("click", sendChat);
    els.chatInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.stopPropagation(); sendChat(); } });
    els.consentOk.addEventListener("click", async () => { await send("consent"); if (state.session) state.session.consentRequired = false; els.consent.classList.remove("on"); });
    render();
  }

  // ---------- status meta ----------
  const STATUS = {
    online: ["متصل ويعمل", "#22c55e"], typing: ["يكتب", "#38bdf8"], in_conversation: ["في محادثة", "#34d399"],
    comments_page: ["صفحة التعليقات", "#2dd4bf"], intermittent: ["متقطع", "#f59e0b"], idle: ["لا يتحرك", "#f59e0b"],
    social: ["سوشيال ميديا", "#ef4444"], games: ["ألعاب", "#ef4444"], entertainment: ["ترفيه", "#ef4444"],
    no_internet: ["النت مقطوع", "#f97316"], agent_disconnected: ["غير متصل", "#64748b"], offline: ["غير متصل", "#64748b"],
  };
  const PRESENCE = { not_started: "لم يبدأ", working: "يعمل", break: "بريك", prayer: "صلاة", wc: "حمام", shift_ended: "انتهى الشيفت" };

  function render() {
    if (!els) return;
    if (!state.session) {
      els.statusLabel.textContent = "سجّل الدخول";
      els.dot.style.background = "#64748b";
      els.controls.innerHTML = "";
      const b = document.createElement("button");
      b.className = "primary"; b.textContent = "تسجيل الدخول";
      b.addEventListener("click", () => send("openPopup"));
      els.controls.appendChild(b);
      return;
    }
    // consent gate
    if (state.session.consentRequired) els.consent.classList.add("on");

    const live = state.live;
    const st = (live && live.status) || "offline";
    const [label, color] = STATUS[st] || STATUS.offline;
    els.dot.style.background = color;
    const presence = (live && live.presence) || "not_started";
    els.statusLabel.textContent = `${state.session.name} · ${label}`;

    // rank
    if (state.rank) { els.rank.style.display = "inline-block"; els.rank.textContent = `ترتيبك: #${state.rank}/${state.total}`; }

    // spotlight / live indicators
    els.spot.classList.toggle("on", !!(live && live.spotlight));
    els.eye.classList.toggle("on", !!(live && live.liveWatching));
    if (live && live.spotlight && !state.spotlightBeeped) { beep(880, 0.15, 0.06); state.spotlightBeeped = true; }
    if (live && !live.spotlight) state.spotlightBeeped = false;

    // shift controls
    els.controls.innerHTML = "";
    const add = (txt, cls, fn) => { const b = document.createElement("button"); b.textContent = txt; if (cls) b.className = cls; b.addEventListener("click", fn); els.controls.appendChild(b); };
    if (presence === "not_started" || presence === "shift_ended") {
      add("ابدأ الشيفت", "primary", async () => { await send("shiftStart"); heartbeat(); });
    } else if (presence === "working") {
      add("استراحة", "warn", () => openBreakMenu());
      add("إنهاء الشيفت", "danger", async () => {
        const notes = prompt("ملاحظات تسليم الوردية (اختياري):", "");
        await send("shiftEnd", { notes });
        heartbeat();
      });
    } else {
      // break/prayer/wc
      const lbl = PRESENCE[presence] || "استراحة";
      add(`إنهاء (${lbl})`, "primary", async () => { await send("breakEnd"); heartbeat(); });
    }
  }

  function openBreakMenu() {
    const types = [["صلاة", "prayer"], ["حمام", "wc"], ["بريك", "break"]];
    const menu = document.createElement("span");
    menu.style.cssText = "display:flex;gap:6px";
    types.forEach(([t, v]) => {
      const b = document.createElement("button");
      b.textContent = t;
      b.addEventListener("click", async () => { await send("breakStart", { type: v }); heartbeat(); });
      menu.appendChild(b);
    });
    els.controls.innerHTML = "";
    els.controls.appendChild(menu);
  }

  // ---------- toasts ----------
  function toast(title, body, audio) {
    if (!els) return;
    if (audio) beep(740, 0.12, 0.06);
    const d = document.createElement("div");
    d.className = "toast";
    d.innerHTML = `<div class="t"></div><div class="b"></div>`;
    d.querySelector(".t").textContent = title;
    d.querySelector(".b").textContent = body;
    els.toasts.appendChild(d);
    setTimeout(() => d.remove(), 7000);
  }

  // ---------- chat ----------
  async function toggleChat() {
    state.chatOpen = !state.chatOpen;
    els.panel.classList.toggle("on", state.chatOpen);
    if (state.chatOpen) await loadChat();
  }
  async function loadChat() {
    const r = await send("chatList");
    if (!r.ok || !els) return;
    els.msgs.innerHTML = "";
    (r.data || []).slice(-50).forEach((m) => {
      const d = document.createElement("div");
      const mine = state.session && m.from === state.session.employeeId;
      d.className = "m" + (mine ? " me" : "");
      d.innerHTML = `<div class="who"></div><div class="bd"></div>`;
      d.querySelector(".who").textContent = mine ? "أنا" : m.from;
      d.querySelector(".bd").textContent = m.body;
      els.msgs.appendChild(d);
    });
    els.msgs.scrollTop = els.msgs.scrollHeight;
  }
  async function sendChat() {
    const v = els.chatInput.value.trim();
    if (!v) return;
    els.chatInput.value = "";
    await send("chatSend", { to: "team", body: v });
    loadChat();
  }

  // ---------- activity detection (Enter) ----------
  function isEditable(el) {
    if (!el) return false;
    const tag = (el.tagName || "").toLowerCase();
    return tag === "textarea" || tag === "input" || el.isContentEditable;
  }
  document.addEventListener(
    "keydown",
    (e) => {
      // typing signal + wpm
      if (isEditable(e.target)) {
        state.lastTypeAt = Date.now();
        if (e.key.length === 1) state.keystrokes.push(Date.now());
      }
      // Enter = رسالة/تعليق مُرسلة
      if (e.key === "Enter" && !e.shiftKey && isEditable(e.target)) {
        const now = Date.now();
        if (now - state.lastActivityAt < 1500) return; // debounce
        state.lastActivityAt = now;
        const comment = isComments();
        beep(comment ? 560 : 680, 0.07, 0.05);
        send("activity", { type: comment ? "comment" : "reply", channel: comment ? "comments" : CHANNEL, ref: location.pathname });
      }
    },
    true,
  );
  // أول تفاعل يفعّل الصوت
  document.addEventListener("pointerdown", ensureAudio, { once: true });

  // ---------- heartbeat + polling ----------
  function currentWpm() {
    const cut = Date.now() - 60000;
    state.keystrokes = state.keystrokes.filter((t) => t > cut);
    return Math.round(state.keystrokes.length / 5);
  }
  async function heartbeat() {
    if (!state.session) return;
    const typing = Date.now() - state.lastTypeAt < 4000;
    const r = await send("presence", {
      typing,
      typingWpm: currentWpm(),
      currentWindow: document.title || SITE,
      mouseMoved: state.mouseMoved === true,
      extensionConnected: true,
    });
    state.mouseMoved = false;
    if (r.ok && r.data) { state.live = r.data; render(); }
  }
  let mouseTimer = 0;
  document.addEventListener("mousemove", () => {
    const now = Date.now();
    if (now - mouseTimer > 1000) { mouseTimer = now; state.mouseMoved = true; }
  }, true);

  async function pollNotifications() {
    if (!state.session) return;
    const r = await send("notifications");
    if (!r.ok) return;
    (r.data || []).forEach((n) => {
      if (state.seenNotif.has(n.id)) return;
      state.seenNotif.add(n.id);
      const titles = { notice: "إشعار من الإدارة", message: "رسالة من الإدارة", violation: "⚠ مخالفة", broadcast_audio: "🔊 بث صوتي", spotlight: "🔴 عين الرقابة" };
      toast(titles[n.type] || "إشعار", n.body, n.type === "broadcast_audio" || n.type === "violation");
    });
  }

  async function refreshRank() {
    if (!state.session) return;
    const r = await send("leaderboard");
    if (!r.ok || !r.data) return;
    const rows = [...r.data.rows].sort((a, b) => (b.points * 10 + b.msgs + b.orders * 3) - (a.points * 10 + a.msgs + a.orders * 3));
    const idx = rows.findIndex((x) => x.employeeId === state.session.employeeId);
    state.rank = idx >= 0 ? idx + 1 : null;
    state.total = rows.length;
    render();
  }

  // ---------- boot ----------
  async function loadSession() {
    const r = await send("session");
    state.session = (r && r.ok) ? r.data : null;
    render();
  }

  function ensureMounted() {
    if (!document.getElementById(HOST_ID)) mountBar();
  }

  mountBar();
  loadSession().then(() => { heartbeat(); pollNotifications(); refreshRank(); });

  // loops
  setInterval(heartbeat, 10000);
  setInterval(pollNotifications, 7000);
  setInterval(refreshRank, 15000);
  setInterval(loadSession, 20000); // يلتقط تسجيل الدخول من البوب-أب
  setInterval(ensureMounted, 3000); // يصمد لو الموقع شال الشريط

  // إعادة الحقن لو الـ DOM اتغيّر بالكامل
  const mo = new MutationObserver(() => ensureMounted());
  mo.observe(document.documentElement, { childList: true, subtree: false });
})();
