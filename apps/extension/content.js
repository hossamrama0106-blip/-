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
  // هل هذه صفحة إنبوكس (نتوقّع منها قراءة محادثات)؟ — عشان ما نرفعش تنبيه فشل قراءة على صفحة مش إنبوكس
  function isInboxPage() {
    if (SITE === "whatsapp") return true;
    if (SITE === "meta") return /inbox|messaging|messages/i.test(location.href);
    return false;
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
    task: null, // المهمة الحالية من طابور ميتا
    queueWaiting: 0,
    queueStrict: true,
    taskOpen: false,
    scrapeRows: 0, // آخر عدد صفوف قُرئت (لصحة القارئ)
    scrapeAt: 0, // وقت آخر قراءة ناجحة
    names: {}, // id→اسم (لعرض أسماء الشات بدل الأرقام)
  };

  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function fmtAgo(iso) {
    if (!iso) return "";
    const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    const m = Math.floor(s / 60);
    return m ? `${m}د ${s % 60}ث` : `${s}ث`;
  }
  function fmtTime(iso) {
    try { return new Date(iso).toTimeString().slice(0, 5); } catch (_) { return ""; }
  }
  const CH_LABEL = { messenger: "ماسنجر", instagram: "انستجرام", whatsapp: "واتساب", comments: "تعليقات", operix: "أوبريكس" };

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
  // نداء صوتي: نطق نص الإدارة بالعربي عبر متصفح الموظف (بدون أي سيرفر)
  function speak(text) {
    try {
      if (!text || !window.speechSynthesis) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ar-EG";
      u.rate = 1;
      u.volume = 1;
      const voices = window.speechSynthesis.getVoices();
      const ar = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith("ar"));
      if (ar) u.voice = ar;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch (_) {}
  }
  // لاسلكي: تشغيل صوت حقيقي مُرسَل من الإدارة (data URL)
  function playVoice(url) {
    try {
      const a = new Audio(url);
      a.volume = 1;
      a.play().catch(() => {});
    } catch (_) {}
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
        .peak{ display:none;align-items:center;gap:5px;background:#ea580c;color:#fff;padding:3px 9px;border-radius:7px;font-weight:700; }
        .peak.on{ display:inline-flex; }
        .bar.peak-on{ background:#431407; }
        .task{ display:none;align-items:center;gap:6px;background:#0b2a4a;border:1px solid #1d4ed8;color:#bfdbfe;
               padding:3px 9px;border-radius:7px;font-weight:700;cursor:pointer;max-width:230px; }
        .task.on{ display:inline-flex; }
        .task.empty{ background:#111827;border-color:#273243;color:#94a3b8; }
        .task .ref{ overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
        button.done{ background:#16a34a;border-color:#16a34a;color:#fff; }
        .tpanel{ position:fixed;top:44px;left:12px;width:340px;background:#0f141c;border:1px solid #1d4ed8;border-radius:12px;
                 display:none;flex-direction:column;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.5); }
        .tpanel.on{ display:flex; }
        .tpanel .head{ padding:10px 12px;border-bottom:1px solid #273243;font-weight:700;color:#fff;display:flex;justify-content:space-between;align-items:center; }
        .tpanel .head .w{ font-size:11px;color:#93c5fd;font-weight:600; }
        .tbody{ padding:12px;display:flex;flex-direction:column;gap:8px; }
        .tbody .cust{ font-weight:800;color:#fff;font-size:15px;display:flex;align-items:center;gap:6px; }
        .tbody .prev{ background:#1b2432;border-radius:8px;padding:8px 10px;font-size:13px;color:#cbd5e1;line-height:1.6; }
        .tbody .meta{ font-size:11px;color:#94a3b8;display:flex;gap:12px; }
        .tbody .row{ display:flex;gap:8px;margin-top:2px; }
        .tbody .empty{ color:#94a3b8;font-size:13px; }
        .badge{ font-size:10px;padding:2px 7px;border-radius:999px;font-weight:700; }
        .badge.vip{ background:#7c2d12;color:#fed7aa; } .badge.high{ background:#78350f;color:#fde68a; } .badge.normal{ background:#1e293b;color:#cbd5e1; }
        .eye{ display:none;align-items:center;gap:5px;color:#fca5a5; }
        .eye.on{ display:flex; }
        @keyframes pr{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.6)}50%{box-shadow:0 0 0 7px rgba(239,68,68,0)}}
        .toast{ position:fixed;top:44px;left:12px;max-width:320px;background:#1b2432;border:1px solid #6366f1;
                color:#e5e7eb;padding:10px 12px;border-radius:10px;font-size:13px;margin-top:8px;box-shadow:0 6px 20px rgba(0,0,0,.4); }
        .toast .t{ font-weight:700;margin-bottom:3px;color:#a5b4fc; }
        .toast.big{ max-width:380px;border:2px solid #6366f1;background:#0f141c;padding:14px 16px; }
        .toast.big.vio{ border-color:#ef4444; } .toast.big.call{ border-color:#ef4444;animation:pr 1.1s infinite; }
        .toast.big .t{ font-size:15px; } .toast.big .b{ font-size:14px;line-height:1.6;margin-top:4px;color:#e5e7eb; }
        .nrow{ display:flex;gap:6px;margin-top:10px; } .ninp{ flex:1;background:#1b2432;border:1px solid #273243;border-radius:7px;padding:7px 10px;color:#fff;font-size:13px;outline:none; }
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
          <span class="task empty" id="taskChip">📋 الطابور</span>
          <button class="done" id="doneBtn" style="display:none">✅ تم، التالي</button>
          <span class="eye" id="eye">👁 مراقبة مباشرة</span>
          <span class="spacer"></span>
          <span class="spot" id="spot">🔴 الإدارة تتابع شاشتك الآن</span>
          <span class="peak" id="peak"></span>
          <span class="rank" id="rank" style="display:none"></span>
          <span id="controls" style="display:flex;gap:8px;align-items:center"></span>
          <button id="minBtn" title="تصغير الشريط">—</button>
          <button id="chatBtn" title="الشات الداخلي">💬</button>
        </div>
        <div class="toast-area" id="toasts"></div>
        <div class="panel" id="panel">
          <div class="head">الشات الداخلي للفريق</div>
          <div class="msgs" id="msgs"></div>
          <div class="inp"><input id="chatInput" placeholder="اكتب رسالة للفريق…"><button class="primary" id="chatSend">إرسال</button></div>
        </div>
        <div class="tpanel" id="tpanel">
          <div class="head"><span>طابور ميتا — مهمتك</span><span class="w" id="tpanelWaiting"></span></div>
          <div class="tbody" id="tbody"></div>
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
      minBtn: root.getElementById("minBtn"),
      bar: root.querySelector(".bar"),
      peak: root.getElementById("peak"),
      taskChip: root.getElementById("taskChip"),
      doneBtn: root.getElementById("doneBtn"),
      tpanel: root.getElementById("tpanel"),
      tpanelWaiting: root.getElementById("tpanelWaiting"),
      tbody: root.getElementById("tbody"),
      toasts: root.getElementById("toasts"),
      panel: root.getElementById("panel"),
      msgs: root.getElementById("msgs"),
      chatInput: root.getElementById("chatInput"),
      chatSend: root.getElementById("chatSend"),
      consent: root.getElementById("consent"),
      consentOk: root.getElementById("consentOk"),
    };
    els.chatBtn.addEventListener("click", toggleChat);
    function collapseBar() {
      host.style.display = "none";
      try { chrome.storage.local.set({ barMin: 1 }); } catch (_) {}
      let r = document.getElementById("khiam-restore");
      if (!r) {
        r = document.createElement("div");
        r.id = "khiam-restore";
        r.textContent = "Khiam ▸";
        r.style.cssText = "position:fixed;top:8px;right:8px;z-index:2147483647;background:#6366f1;color:#fff;font:600 12px sans-serif;padding:5px 11px;border-radius:999px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.4)";
        r.addEventListener("click", () => { host.style.display = ""; r.remove(); try { chrome.storage.local.remove("barMin"); } catch (_) {} });
        (document.documentElement || document.body).appendChild(r);
      } else r.style.display = "";
    }
    els.minBtn.addEventListener("click", collapseBar);
    try { chrome.storage.local.get("barMin", (o) => { if (o && o.barMin) collapseBar(); }); } catch (_) {} // يتذكّر اختيار التصغير
    els.chatSend.addEventListener("click", sendChat);
    els.chatInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.stopPropagation(); sendChat(); } });
    els.taskChip.addEventListener("click", () => { if (!state.task && state.queueWaiting > 0) pullNext(); else toggleTaskPanel(); });
    els.doneBtn.addEventListener("click", doneNext);
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
    renderTask();
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

    // وضع الذروة: شريط برتقالي + عدّاد الرسائل المتبقية
    if (els.peak && els.bar) {
      const p = state.peak;
      if (p && p.on) {
        els.peak.classList.add("on");
        els.peak.textContent = `🔥 ذروة — تبقى ${p.remaining} رسالة`;
        els.bar.classList.add("peak-on");
      } else {
        els.peak.classList.remove("on");
        els.bar.classList.remove("peak-on");
      }
    }
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
  // إشعار بارز مع ردّ (رسالة الإدارة / مخالفة / نداء المدير) — بدل التوست الصغير
  function bigNotif(n) {
    if (!els) return;
    beep(880, 0.16, 0.08);
    const d = document.createElement("div");
    d.className = "toast big" + (n.type === "violation" ? " vio" : n.type === "broadcast_audio" ? " call" : "");
    const titles = { message: "📩 رسالة من الإدارة", violation: "⚠️ مخالفة", broadcast_audio: "🔴 المدير ينادي", notice: "🔔 إشعار", spotlight: "🔴 عين الرقابة" };
    d.innerHTML = `<div class="t"></div><div class="b"></div>`;
    d.querySelector(".t").textContent = titles[n.type] || "إشعار";
    d.querySelector(".b").textContent = n.body || "";
    if (n.type === "message" || n.type === "violation") {
      const row = document.createElement("div"); row.className = "nrow";
      const inp = document.createElement("input"); inp.className = "ninp"; inp.placeholder = "اكتب ردّك…";
      const btn = document.createElement("button"); btn.className = "primary"; btn.textContent = "إرسال";
      const go = () => { const v = inp.value.trim(); if (!v) return; send("notifReply", { id: n.id, reply: v }); d.remove(); };
      btn.addEventListener("click", go);
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.stopPropagation(); go(); } });
      row.appendChild(inp); row.appendChild(btn); d.appendChild(row);
    } else {
      const ok = document.createElement("button"); ok.className = "primary"; ok.textContent = "تمام"; ok.style.marginTop = "8px";
      ok.addEventListener("click", () => d.remove()); d.appendChild(ok);
      setTimeout(() => d.remove(), 20000);
    }
    els.toasts.appendChild(d);
  }
  // عرض تقديمي يظهر مرة واحدة أول تثبيت/تشغيل (يشرح الشريط)
  function showOnboarding() {
    try {
      chrome.storage.local.get("barGuideSeen", (o) => {
        if ((o && o.barGuideSeen) || !els) return;
        const d = document.createElement("div");
        d.className = "toast big";
        d.innerHTML = `<div class="t"></div><div class="b"></div>`;
        d.querySelector(".t").textContent = "👋 أهلاً — شريط Khiam Ops";
        const b = d.querySelector(".b");
        b.style.whiteSpace = "pre-line";
        b.textContent = "• ابدأ شيفتك من الشريط فوق\n• مهمتك الحالية بزر «تم، التالي»\n• سجّل الاستراحة (صلاة/حمام/بريك)\n• 💬 شات الفريق · 🎙️ نداء الإدارة\n• «—» لتصغير الشريط";
        const ok = document.createElement("button");
        ok.className = "primary"; ok.textContent = "تمام، فهمت"; ok.style.marginTop = "10px";
        ok.addEventListener("click", () => { d.remove(); try { chrome.storage.local.set({ barGuideSeen: 1 }); } catch (_) {} });
        d.appendChild(ok);
        els.toasts.appendChild(d);
      });
    } catch (_) {}
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
    const list = r.data || [];
    if (!list.length) {
      const e = document.createElement("div");
      e.style.cssText = "color:#64748b;font-size:12px;text-align:center;padding:16px";
      e.textContent = "ابدأ المحادثة مع فريقك…";
      els.msgs.appendChild(e);
    }
    list.slice(-60).forEach((m) => {
      const d = document.createElement("div");
      const mine = state.session && m.from === state.session.employeeId;
      d.className = "m" + (mine ? " me" : "");
      const who = document.createElement("div");
      who.className = "who";
      who.textContent = (mine ? "أنا" : state.names[m.from] || m.from) + (m.at ? " · " + fmtTime(m.at) : "");
      const bd = document.createElement("div");
      bd.className = "bd";
      bd.textContent = m.body;
      d.appendChild(who);
      d.appendChild(bd);
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

  // ---------- طابور ميتا الإجباري ----------
  function renderTask() {
    if (!els) return;
    const presence = state.live && state.live.presence;
    // الطابور يظهر فقط أثناء العمل
    if (!state.session || presence !== "working") {
      els.taskChip.classList.remove("on");
      els.doneBtn.style.display = "none";
      els.tpanel.classList.remove("on");
      state.taskOpen = false;
      return;
    }
    const t = state.task;
    els.taskChip.classList.add("on");
    if (t) {
      els.taskChip.classList.remove("empty");
      els.taskChip.innerHTML = `📋 <span class="ref">${esc(t.customerRef)}</span>`;
      els.doneBtn.style.display = "inline-block";
    } else {
      els.doneBtn.style.display = "none";
      if (state.queueWaiting > 0) {
        els.taskChip.classList.remove("empty");
        els.taskChip.innerHTML = `📥 استلم مهمة (${state.queueWaiting})`;
      } else {
        els.taskChip.classList.add("empty");
        els.taskChip.innerHTML = `📋 لا مهام`;
      }
    }
    if (state.taskOpen) renderTaskPanel();
  }

  function renderTaskPanel() {
    if (!els) return;
    els.tpanelWaiting.textContent = `منتظر: ${state.queueWaiting || 0}`;
    const t = state.task;
    if (!t) {
      els.tbody.innerHTML =
        `<div class="empty">لا توجد مهمة حالية.</div>` +
        (state.queueWaiting > 0 ? `<button class="primary" id="pullBtn">📥 استلم التالي</button>` : "");
      const pb = els.tbody.querySelector("#pullBtn");
      if (pb) pb.addEventListener("click", pullNext);
      return;
    }
    const prCls = t.priority === "vip" ? "vip" : t.priority === "high" ? "high" : "normal";
    const prLbl = t.priority === "vip" ? "VIP" : t.priority === "high" ? "مهمة" : "عادية";
    els.tbody.innerHTML = `
      <div class="cust">${esc(t.customerRef)} <span class="badge ${prCls}">${prLbl}</span></div>
      <div class="meta"><span>${esc(CH_LABEL[t.channel] || t.channel)}</span><span>⏱ منذ ${fmtAgo(t.assignedAt)}</span></div>
      <div class="prev">${esc(t.preview) || "—"}</div>
      <div class="row">
        ${t.link ? `<button id="openConv">🔗 فتح المحادثة</button>` : ""}
        <button class="done" id="doneConv">✅ تم، التالي</button>
      </div>`;
    const oc = els.tbody.querySelector("#openConv");
    if (oc && t.link) oc.addEventListener("click", () => { if (/^https?:\/\//.test(t.link)) window.open(t.link, "_blank", "noopener"); });
    els.tbody.querySelector("#doneConv").addEventListener("click", doneNext);
  }

  function toggleTaskPanel() {
    state.taskOpen = !state.taskOpen;
    els.tpanel.classList.toggle("on", state.taskOpen);
    if (state.taskOpen) {
      els.panel.classList.remove("on");
      state.chatOpen = false;
      renderTaskPanel();
    }
  }

  async function pullNext() {
    const r = await send("queueNext");
    if (r.ok && r.data) {
      state.task = r.data.task || null;
      state.queueWaiting = r.data.queueWaiting || 0;
      renderTask();
      if (state.task) { beep(760, 0.1, 0.05); toast("📋 مهمة جديدة", `${state.task.customerRef} — ${state.task.preview || ""}`, true); }
    }
  }

  async function doneNext() {
    if (!state.task) return;
    const r = await send("queueDone", { taskId: state.task.id });
    if (r.ok && r.data) {
      state.task = r.data.next || null;
      state.queueWaiting = r.data.queueWaiting || 0;
      beep(720, 0.08, 0.05);
      renderTask();
      if (state.task) toast("التالي", state.task.customerRef, false);
      else toast("تم ✅", "لا مهام في الطابور حاليًا", false);
    }
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
        const replyText = editableText(e.target); // نلتقط نص الرد قبل ما يُرسَل ويُمسَح
        const now = Date.now();
        if (now - state.lastActivityAt < 2500) return; // debounce (يمنع عدّ الرد/التعليق مرتين)
        state.lastActivityAt = now;
        const comment = isComments();
        beep(comment ? 560 : 680, 0.07, 0.05);
        send("activity", { type: comment ? "comment" : "reply", channel: comment ? "comments" : CHANNEL, ref: location.pathname });
        if (!comment) maybeEvaluateReply(replyText); // تقييم جودة الرد على المحادثة المفتوحة (عيّنة)
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
  // تطبيق الحالة اللحظية (من نبضة هذا التبويب أو من تبويب آخر عبر التخزين) — يوحّد الشريط
  function applyLive(data) {
    if (!data) return;
    state.live = data;
    state.peak = data.peak;
    const prevTaskId = state.task && state.task.id;
    state.task = data.task || null;
    state.queueWaiting = data.queueWaiting || 0;
    if (data.queueStrict !== undefined) state.queueStrict = data.queueStrict;
    if (state.task && state.task.id !== prevTaskId) {
      toast("📋 مهمة جديدة", `${state.task.customerRef}${state.task.preview ? " — " + state.task.preview : ""}`, true);
    }
    render();
    highlightAssigned();
  }
  // مزامنة فورية عبر كل التبويبات (ابدأ الشيفت في تبويب → يظهر في الكل)
  try {
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area === "local" && ch.liveState && ch.liveState.newValue && state.session) applyLive(ch.liveState.newValue);
    });
  } catch (_) {}

  async function heartbeat() {
    if (!state.session) return;
    const typing = Date.now() - state.lastTypeAt < 4000;
    const hb = {
      typing,
      typingWpm: currentWpm(),
      currentWindow: document.title || SITE,
      metaFocused: document.visibilityState === "visible",
      clientTime: Date.now(),
      mouseMoved: state.mouseMoved === true,
      extensionConnected: true,
    };
    // صحة قارئ الإنبوكس → الباك يرفع تنبيه لو القراءة وقفت أثناء الشيفت (ما يتظلمش الموظف لو ميتا غيّرت صفحتها)
    if ((SITE === "meta" || SITE === "whatsapp") && isInboxPage()) {
      hb.scraperOk = state.scrapeRows > 0 && Date.now() - state.scrapeAt < 90000;
    }
    const r = await send("presence", hb);
    state.mouseMoved = false;
    if (r.ok && r.data) {
      applyLive(r.data);
      try { chrome.storage.local.set({ liveState: r.data }); } catch (_) {} // مزامنة كل التبويبات + حفظ لآخر refresh
    }
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
      if (n.type === "message" || n.type === "violation" || n.type === "broadcast_audio") {
        bigNotif(n); // إشعار بارز (يرد منه) بدل التوست الصغير
        if (n.type === "broadcast_audio") { if (n.audioUrl) playVoice(n.audioUrl); else speak(n.body); }
      } else {
        const titles = { notice: "🔔 إشعار", spotlight: "🔴 عين الرقابة" };
        toast(titles[n.type] || "إشعار", n.body, false);
      }
    });
  }

  async function refreshRank() {
    if (!state.session) return;
    const r = await send("leaderboard");
    if (!r.ok || !r.data) return;
    const rows = [...r.data.rows].sort((a, b) => (b.points * 10 + b.msgs + b.orders * 3) - (a.points * 10 + a.msgs + a.orders * 3));
    for (const row of r.data.rows) state.names[row.employeeId] = row.name; // خريطة أسماء للشات
    const idx = rows.findIndex((x) => x.employeeId === state.session.employeeId);
    state.rank = idx >= 0 ? idx + 1 : null;
    state.total = rows.length;
    render();
  }

  // ---------- سحب بيانات ميتا الحقيقية (أفضل جهد — يُضبط على DOM ميتا الفعلي بجلسة تهيئة) ----------
  function textOf(el) {
    return ((el && (el.innerText || el.textContent)) || "").trim().replace(/\s+/g, " ");
  }
  function metaUnreadFromTitle() {
    const m = (document.title || "").match(/\((\d+)\)/);
    return m ? parseInt(m[1], 10) : null;
  }
  // صفوف المحادثات: نعتمد إشارة data-surface الثابتة من ميتا نفسها (thread_list/thread_rowN)
  // — أمتن بكتير من الكلاسات المبهمة اللي بتتغيّر كل نشرة. مضبوطة على DOM إنبوكس Business Suite الحقيقي.
  const ROW_SURFACE = /thread_list\/thread_row\d+(:priority)?$/;
  function metaThreadRows() {
    const all = Array.from(document.querySelectorAll('[data-surface*="thread_list/thread_row"]'));
    const rows = all.filter((el) => ROW_SURFACE.test(el.getAttribute("data-surface") || ""));
    if (rows.length) return rows;
    return metaThreadRowsFallback();
  }
  // fallback لو ميتا غيّرت أسماء الـ surfaces: روابط المحادثات (مع استبعاد روابط اختيار القنوات)
  function metaThreadRowsFallback() {
    const seen = new Set();
    const rows = [];
    for (const a of document.querySelectorAll('a[href*="selected_item_id"]')) {
      if (a.closest && a.closest('[data-surface*="channel_selector"]')) continue;
      const row = (a.closest && a.closest('[role="row"], [role="listitem"], li')) || a;
      if (!seen.has(row)) { seen.add(row); rows.push(row); }
    }
    return rows;
  }
  function threadLink(row) {
    if (row.matches && row.matches('a[href*="selected_item_id"]')) return row;
    return (row.querySelector && row.querySelector('a[href*="selected_item_id"]')) || null;
  }
  function extIdFrom(row) {
    const href = (threadLink(row) && threadLink(row).getAttribute("href")) || "";
    const m = href.match(/selected_item_id=([^&]+)/);
    if (m) return "meta_" + decodeURIComponent(m[1]);
    const t = textOf(row).slice(0, 50);
    return t ? "txt_" + t.replace(/\s+/g, "_") : null;
  }
  function channelOf(row) {
    const href = (threadLink(row) && threadLink(row).getAttribute("href")) || "";
    const tt = (href.match(/thread_type=([A-Z_]+)/) || [])[1] || "";
    if (/IG_/.test(tt)) return "instagram";
    if (/WA_|WHATSAPP/.test(tt)) return "whatsapp";
    if (/FB_/.test(tt)) return "messenger";
    const badge = row.querySelector && row.querySelector('img[alt="Instagram"], img[alt="WhatsApp"], img[alt="Messenger"]');
    const alt = (badge && badge.getAttribute("alt")) || "";
    if (alt === "Instagram") return "instagram";
    if (alt === "WhatsApp") return "whatsapp";
    if (alt === "Messenger") return "messenger";
    return CHANNEL;
  }
  function titleEl(row) {
    return (row.querySelector && row.querySelector('[data-surface$="/lib:thread_title"]')) || row;
  }
  function isBold(el) {
    try { return parseInt(getComputedStyle(el).fontWeight, 10) >= 600; } catch (_) { return false; }
  }
  // غير مقروء = اسم العميل بخط ثقيل (ميتا تعلّمه كده) — نحسبه بـ getComputedStyle (يتخطّى الكلاسات المبهمة)
  function rowUnread(row) {
    const t = titleEl(row);
    if (isBold(t)) return true;
    const inner = t.querySelector && t.querySelector("span, div, b, strong");
    if (inner && isBold(inner)) return true;
    const al = (row.getAttribute && (row.getAttribute("aria-label") || "")) || "";
    return /unread|غير مقروء/i.test(al);
  }
  function scrapeMetaInbox() {
    try {
      const rows = metaThreadRows();
      const items = [];
      const seen = new Set();
      let unreadCount = 0;
      for (const r of rows.slice(0, 60)) {
        const unread = rowUnread(r);
        if (unread) unreadCount++;
        const id = extIdFrom(r);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const name = textOf(titleEl(r)).slice(0, 60);
        const full = textOf(r);
        const link = (threadLink(r) && threadLink(r).href) || null;
        const priority = /:priority$/.test(r.getAttribute("data-surface") || "") ? "high" : "normal";
        items.push({ externalId: id, customerRef: name || full.slice(0, 40), preview: full.slice(0, 160), channel: channelOf(r), link, priority, unread });
      }
      const titleUnread = metaUnreadFromTitle();
      return { ok: rows.length > 0, unread: titleUnread == null ? unreadCount : titleUnread, items, rowCount: rows.length };
    } catch (e) {
      return { ok: false, unread: null, items: [], error: String(e) };
    }
  }
  // ---------- تلوين المحادثة المُسنَدة داخل ميتا (المدير عيّنها → لازم الرد عليها) ----------
  let pageStyleInjected = false;
  function injectPageStyle() {
    if (pageStyleInjected) return;
    pageStyleInjected = true;
    try {
      const st = document.createElement("style");
      st.textContent = ".khiam-assigned{outline:3px solid #6366f1 !important;outline-offset:-3px;background:rgba(99,102,241,.14) !important;border-radius:8px;}";
      (document.head || document.documentElement).appendChild(st);
    } catch (_) {}
  }
  function highlightAssigned() {
    if (SITE !== "meta") return;
    injectPageStyle();
    try { document.querySelectorAll(".khiam-assigned").forEach((el) => el.classList.remove("khiam-assigned")); } catch (_) {}
    const t = state.task;
    if (!t) return;
    try {
      for (const r of metaThreadRows()) {
        const id = extIdFrom(r);
        const name = textOf(titleEl(r));
        if ((t.externalId && id === t.externalId) || (t.customerRef && name && (name.includes(t.customerRef) || t.customerRef.includes(name)))) {
          r.classList.add("khiam-assigned");
        }
      }
    } catch (_) {}
  }
  // ---------- المصدر الأساسي: جسر React fiber (inject.js في main world) ----------
  // بيانات المحادثات (المعرّف/غير-المقروء/الاسم/المعاينة/القناة) من props.thread — موثوقة وثابتة.
  let lastFiberAt = 0;
  function handleFiberInbox(data) {
    if (!state.session) return;
    lastFiberAt = Date.now();
    state.scrapeRows = data.rowCount || (Array.isArray(data.items) ? data.items.length : 0) || 0;
    state.scrapeAt = Date.now(); // قراءة ناجحة (صحة القارئ)
    const items = Array.isArray(data.items) ? data.items : [];
    const unreadItems = items.filter((it) => it.unread); // للطابور: غير المقروء فقط (الجديد/غير المجاب عليه)
    const comments = isComments() ? unreadItems.length : 0;
    send("inboxSync", { unreadMessages: Math.max(0, data.unread || 0), unreadComments: comments });
    if (unreadItems.length) send("queueSync", { items: unreadItems });
  }
  function setupFiberBridge() {
    try {
      const s = document.createElement("script");
      s.src = chrome.runtime.getURL("inject.js");
      s.onload = () => s.remove();
      (document.head || document.documentElement).appendChild(s);
    } catch (_) {}
    window.addEventListener("message", (e) => {
      if (e.source !== window || !e.data || e.data.__khiam !== 1) return;
      if (e.data.kind === "inbox") handleFiberInbox(e.data);
    });
  }
  // fallback: قراءة DOM (لو الحقن فشل أو ميتا غيّرت الـ fiber). يتخطّى لو الـ fiber وصل مؤخرًا.
  async function scrapeAndSync() {
    if (SITE !== "meta" || !state.session) return;
    if (Date.now() - lastFiberAt < 30000) return; // الـ fiber هو المصدر الأساسي
    const d = scrapeMetaInbox();
    if (!d.ok) return; // لم نتعرّف على بنية الصفحة — نتخطّى بأمان
    state.scrapeRows = d.rowCount || d.items.length || 0;
    state.scrapeAt = Date.now(); // قراءة DOM ناجحة (صحة القارئ)
    const unreadItems = d.items.filter((it) => it.unread);
    const comments = isComments() ? unreadItems.length : 0;
    send("inboxSync", { unreadMessages: Math.max(0, d.unread || 0), unreadComments: comments });
    if (unreadItems.length) send("queueSync", { items: unreadItems });
  }
  // ---------- واتساب ويب: قراءة قائمة المحادثات (DOM — أمتن طريقة لواتساب، الـ fiber مبهم) ----------
  // إشارات واتساب الثابتة: لوحة القائمة #pane-side، كل محادثة div[role="listitem"]،
  // الاسم span[title]، غير المقروء = شارة عدّاد aria-label فيها unread/غير مقروء.
  function waChatRows() {
    const pane = document.querySelector("#pane-side") || document.querySelector('[aria-label="Chat list"]') || document.querySelector('[data-testid="chat-list"]');
    if (!pane) return [];
    return Array.from(pane.querySelectorAll('div[role="listitem"]'));
  }
  function waUnread(row) {
    // شارة عدّاد غير المقروء — aria-label صريح (أكثر اللغات: "N unread message(s)" / "غير مقروء")
    const badge = row.querySelector('span[aria-label*="unread" i], span[aria-label*="غير مقروء"], span[aria-label*="رسائل غير مقروءة"]');
    if (badge) return true;
    const al = (row.getAttribute && (row.getAttribute("aria-label") || "")) || "";
    return /unread|غير مقروء/i.test(al);
  }
  function waTitle(row) {
    const t = row.querySelector("span[title]");
    const name = (t && (t.getAttribute("title") || t.textContent)) || "";
    return name.trim() || textOf(row).split("\n")[0];
  }
  function waPreview(row) {
    const spans = row.querySelectorAll("span[title]");
    if (spans.length > 1) return (spans[spans.length - 1].getAttribute("title") || spans[spans.length - 1].textContent || "").trim();
    return "";
  }
  function scrapeWhatsApp() {
    try {
      const rows = waChatRows();
      if (!rows.length) return { ok: false, unread: null, items: [] };
      const items = [];
      const seen = new Set();
      let unread = 0;
      for (const r of rows.slice(0, 60)) {
        const u = waUnread(r);
        if (u) unread++;
        const name = (waTitle(r) || "").slice(0, 60);
        if (!name) continue;
        const id = "wa_" + name; // واتساب ويب يخفي الرقم؛ الاسم أثبت مرجع متاح (dedup لكل عميل)
        if (seen.has(id)) continue;
        seen.add(id);
        items.push({ externalId: id, customerRef: name, preview: (waPreview(r) || "").slice(0, 160), channel: "whatsapp", link: null, priority: "normal", unread: u });
      }
      return { ok: true, unread, items };
    } catch (e) {
      return { ok: false, unread: null, items: [], error: String(e) };
    }
  }

  // مزامنة قناة غير-ميتا (واتساب) → نفس مسار الإنبوكس/الطابور، دفاعيًا (يتخطّى لو البنية مش مفهومة)
  function scrapeForSite() {
    if (SITE === "whatsapp") return scrapeWhatsApp();
    return { ok: false, unread: null, items: [] };
  }
  async function scrapeAndSyncOther() {
    if (!state.session || (SITE !== "whatsapp")) return;
    const d = scrapeForSite();
    if (!d.ok) return; // لم نتعرّف على البنية — تخطٍّ آمن (لا نلوّث الطابور)
    state.scrapeRows = d.items.length || 0;
    state.scrapeAt = Date.now(); // قراءة واتساب ناجحة (صحة القارئ)
    const unreadItems = d.items.filter((it) => it.unread);
    send("inboxSync", { unreadMessages: Math.max(0, d.unread || 0), unreadComments: 0 });
    if (unreadItems.length) send("queueSync", { items: unreadItems });
  }

  // تشخيص: نادِ __khiamProbe() في console سياق الإضافة لمراجعة القراءة (أطوال فقط — بدون أسماء/نصوص)
  window.__khiamProbe = function () {
    if (SITE === "whatsapp") {
      const rows = waChatRows();
      return { site: "whatsapp", rowCount: rows.length, unreadCount: rows.filter(waUnread).length, sample: rows.slice(0, 5).map((r) => ({ nameLen: (waTitle(r) || "").length, previewLen: (waPreview(r) || "").length, unread: waUnread(r) })) };
    }
    const rows = metaThreadRows();
    return {
      url: location.pathname,
      titlePattern: (document.title || "").replace(/\d+/g, "#"),
      unreadFromTitle: metaUnreadFromTitle(),
      rowCount: rows.length,
      unreadCount: rows.filter(rowUnread).length,
      sample: rows.slice(0, 5).map((r) => ({ idKind: /selected_item_id/.test((threadLink(r) && threadLink(r).getAttribute("href")) || "") ? "meta-id" : "text", channel: channelOf(r), unread: rowUnread(r), nameLen: textOf(titleEl(r)).length, previewLen: textOf(r).length })),
    };
  };

  // ---------- تقييم جودة الرد على المحادثة المفتوحة (عيّنة) ----------
  function editableText(el) {
    if (!el) return "";
    if (el.isContentEditable) return (el.innerText || el.textContent || "").trim();
    return (el.value || "").trim();
  }
  function scrapeLastCustomerMessage() {
    try {
      const nodes = document.querySelectorAll('[role="row"] [dir="auto"], [data-scope="messages"] [dir="auto"], [role="gridcell"] span[dir="auto"]');
      const texts = Array.from(nodes)
        .map((n) => ((n.innerText || n.textContent) || "").trim())
        .filter((t) => t && t.length > 1 && t.length < 500);
      return texts.length ? texts[texts.length - 1] : null;
    } catch (_) {
      return null;
    }
  }
  // مقتطف أوسع من المحادثة المفتوحة (أفضل جهد — الدور بالمحاذاة، يحتاج ضبطًا حيًّا على DOM ميتا)
  function scrapeConversation(limit) {
    try {
      const rows = Array.from(document.querySelectorAll('[role="row"]'));
      const out = [];
      for (const row of rows) {
        const el = row.querySelector('[dir="auto"]');
        const text = el ? ((el.innerText || el.textContent) || "").trim() : "";
        if (!text || text.length < 2 || text.length > 400) continue;
        let role = "customer";
        try {
          const rr = row.getBoundingClientRect();
          const er = el.getBoundingClientRect();
          role = er.left + er.width / 2 < rr.left + rr.width / 2 ? "agent" : "customer";
        } catch (_) {}
        out.push({ role, text });
      }
      return out.slice(-limit);
    } catch (_) {
      return [];
    }
  }
  async function maybeEvaluateReply(replyText) {
    if (SITE !== "meta" || !state.session || !replyText || replyText.length < 2) return;
    const customer = scrapeLastCustomerMessage();
    const buying = customer && /(سعر|بكام|مقاس|خامة|عايز|التوصيل|الشحن|متوفر|كاش|انستا|instapay)/i.test(customer);
    const angry = customer && /(غاضب|زعلان|بطيء|وحش|سيء|سيئ|زفت|😠|😡|لسه مستني|من امبارح)/i.test(customer);
    // عيّنة 25% توفيرًا لاستهلاك الـ AI، أو دائمًا لو العميل عنده نية شراء/غضب
    if (!(buying || angry) && Math.random() > 0.25) return;
    const messages = [];
    if (customer) messages.push({ role: "customer", text: customer });
    messages.push({ role: "agent", text: replyText });
    const ref = (state.live && state.live.currentConversation) || (customer ? customer.slice(0, 30) : "محادثة");
    const transcript = scrapeConversation(10);
    if (!transcript.length || transcript[transcript.length - 1].text !== replyText) transcript.push({ role: "agent", text: replyText });
    send("evaluate", { conversationRef: ref, messages, transcript });
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
  loadSession().then(() => {
    // استعد آخر حالة محفوظة فورًا — يمنع وميض "ابدأ الشيفت" على refresh/تبويب جديد قبل أول نبضة (مهم على Render البارد)
    try { chrome.storage.local.get("liveState", (o) => { if (o && o.liveState && state.session) applyLive(o.liveState); }); } catch (_) {}
    heartbeat(); pollNotifications(); refreshRank();
  });
  setTimeout(showOnboarding, 1500); // عرض تقديمي أول مرة

  // loops
  setInterval(heartbeat, 10000);
  setInterval(pollNotifications, 7000);
  setInterval(refreshRank, 15000);
  setInterval(loadSession, 20000); // يلتقط تسجيل الدخول من البوب-أب
  setInterval(ensureMounted, 3000); // يصمد لو الموقع شال الشريط

  // سحب بيانات الإنبوكس الحقيقية حسب القناة
  if (SITE === "meta") {
    setupFiberBridge(); // الأساسي: حقن inject.js (قراءة fiber) + استقبال
    setTimeout(scrapeAndSync, 4000); // fallback DOM (يتخطّى لو fiber شغّال)
    setInterval(scrapeAndSync, 20000);
    setInterval(highlightAssigned, 8000); // أعد تلوين المحادثة المُسنَدة (ميتا تعيد رسم الصفوف)
  } else if (SITE === "whatsapp") {
    // واتساب ويب: قراءة DOM دفاعية (يتخطّى بأمان لو البنية مش مفهومة)
    setTimeout(scrapeAndSyncOther, 5000);
    setInterval(scrapeAndSyncOther, 20000);
  }

  // إعادة الحقن لو الـ DOM اتغيّر بالكامل
  const mo = new MutationObserver(() => ensureMounted());
  mo.observe(document.documentElement, { childList: true, subtree: false });
})();
