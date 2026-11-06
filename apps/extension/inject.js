// سكربت main-world: يُحقَن في صفحة ميتا ليقرأ بيانات المحادثات من React fiber مباشرةً
// (content script في عالم معزول مايقدرش يقرأ الـ fiber). يبعت النتيجة لـ content.js عبر postMessage.
//
// ليه fiber بدل قراءة DOM: الـ DOM بيخفي معرّف المحادثة وبيعلّم غير-المقروء بـ class مبهم،
// لكن props.thread في الـ fiber فيه كل حاجة مهيكلة وموثوقة: threadID / isRead / title / snippetText /
// threadType / commPlatform / timestamp / isPriority. مضبوط على Meta Business Suite inbox الحقيقي.
(() => {
  "use strict";
  const ROW_SURFACE = /thread_list\/thread_row\d+(:priority)?$/;

  const fiberOf = (el) => {
    const k = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
    return k ? el[k] : null;
  };
  // اصعد في سلسلة الـ fiber (return) للقى أقرب memoizedProps.thread
  function findThread(el) {
    let n = fiberOf(el);
    let c = 0;
    while (n && c < 80) {
      const p = n.memoizedProps;
      if (p && p.thread && typeof p.thread === "object" && (p.thread.threadID || p.thread.threadFBID)) return p.thread;
      n = n.return;
      c++;
    }
    return null;
  }
  function channelOf(platform, type) {
    const p = (platform || "").toUpperCase();
    const t = (type || "").toUpperCase();
    if (p.includes("INSTAGRAM") || t.includes("IG")) return "instagram";
    if (p.includes("WHATSAPP") || t.includes("WA")) return "whatsapp";
    return "messenger";
  }
  // رابط فتح المحادثة (أفضل جهد) من بارامترات الصفحة + fbid
  function baseParams() {
    try {
      const q = new URLSearchParams(location.search);
      return { asset_id: q.get("asset_id") || "", business_id: q.get("business_id") || "", mailbox_id: q.get("mailbox_id") || "" };
    } catch (_) {
      return { asset_id: "", business_id: "", mailbox_id: "" };
    }
  }
  function openLink(fbid, type) {
    const b = baseParams();
    if (!b.asset_id || !fbid) return null;
    return `https://business.facebook.com/latest/inbox/all?asset_id=${b.asset_id}&business_id=${b.business_id}&mailbox_id=${b.mailbox_id}&selected_item_id=${fbid}&thread_type=${type || "FB_MESSAGE"}`;
  }

  function scan() {
    try {
      const rows = Array.from(document.querySelectorAll('[data-surface*="thread_list/thread_row"]')).filter((el) =>
        ROW_SURFACE.test(el.getAttribute("data-surface") || ""),
      );
      const items = [];
      let unread = 0;
      const seen = new Set();
      for (const r of rows) {
        const t = findThread(r);
        if (!t) continue;
        if (t.isRead === false) unread++;
        const id = String(t.threadID || t.threadFBID || "");
        if (!id || seen.has(id)) continue;
        seen.add(id);
        items.push({
          externalId: "meta_" + id,
          customerRef: (t.title || "").slice(0, 60),
          preview: (t.snippetText || "").slice(0, 160),
          channel: channelOf(t.commPlatform, t.threadType),
          link: openLink(t.threadFBID, t.threadType),
          unread: t.isRead === false,
          priority: t.isPriority ? "high" : "normal",
          ts: typeof t.timestamp === "number" ? t.timestamp : null,
        });
      }
      window.postMessage({ __khiam: 1, kind: "inbox", items, unread, rowCount: rows.length }, location.origin);
    } catch (e) {
      window.postMessage({ __khiam: 1, kind: "error", error: String((e && e.message) || e) }, location.origin);
    }
  }

  scan();
  setInterval(scan, 15000);
  // استجابة لطلب مسح فوري من content.js
  window.addEventListener("message", (e) => {
    if (e.source === window && e.data && e.data.__khiam === 2 && e.data.kind === "scan") scan();
  });
})();
