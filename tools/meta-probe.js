/* ============================================================================
 * Khiam Ops — فحص قراءة إنبوكس ميتا (paste-in-console)
 * ----------------------------------------------------------------------------
 * الغرض: تتأكد إن قارئ الإنبوكس شايف محادثاتك صح — بدون كشف أي بيانات عملاء
 *        (أطوال وبُنية فقط). مضبوط على data-surface الثابت بتاع Business Suite.
 *
 * الخطوات: افتح الإنبوكس الحقيقي → F12 → Console → الصق ده كله → Enter →
 *          ابعتلي الـ JSON المطبوع (مفيهوش أسماء/نصوص عملاء).
 * ========================================================================== */
(() => {
  const textLen = (el) => (((el && (el.innerText || el.textContent)) || "").trim().replace(/\s+/g, " ")).length;
  const ROW_SURFACE = /thread_list\/thread_row\d+(:priority)?$/;
  const rows = Array.from(document.querySelectorAll('[data-surface*="thread_list/thread_row"]'))
    .filter((el) => ROW_SURFACE.test(el.getAttribute("data-surface") || ""));

  const threadLink = (row) => (row.querySelector && row.querySelector('a[href*="selected_item_id"]')) || null;
  const titleEl = (row) => (row.querySelector && row.querySelector('[data-surface$="/lib:thread_title"]')) || row;
  const isBold = (el) => { try { return parseInt(getComputedStyle(el).fontWeight, 10) >= 600; } catch (_) { return false; } };
  const rowUnread = (row) => {
    const t = titleEl(row);
    if (isBold(t)) return true;
    const inner = t.querySelector && t.querySelector("span, div, b, strong");
    if (inner && isBold(inner)) return true;
    const al = (row.getAttribute && (row.getAttribute("aria-label") || "")) || "";
    return /unread|غير مقروء/i.test(al);
  };
  const channelOf = (row) => {
    const href = (threadLink(row) && threadLink(row).getAttribute("href")) || "";
    const tt = (href.match(/thread_type=([A-Z_]+)/) || [])[1] || "";
    if (/IG_/.test(tt)) return "instagram";
    if (/WA_|WHATSAPP/.test(tt)) return "whatsapp";
    if (/FB_/.test(tt)) return "messenger";
    const b = row.querySelector && row.querySelector('img[alt="Instagram"], img[alt="WhatsApp"], img[alt="Messenger"]');
    return (b && b.getAttribute("alt")) ? b.getAttribute("alt").toLowerCase() : "?";
  };

  const report = {
    _note: "PII-safe: أطوال وبُنية فقط — بلا أسماء/نصوص عملاء.",
    url: location.pathname,
    titlePattern: (document.title || "").replace(/\d+/g, "#"),
    rowCount: rows.length,
    unreadCount: rows.filter(rowUnread).length,
    surfaceDetected: rows.length > 0, // هل الإشارة الثابتة اشتغلت؟
    sample: rows.slice(0, 6).map((r) => ({
      surface: (r.getAttribute("data-surface") || "").split("/").pop(),
      hasThreadId: !!(threadLink(r) && /selected_item_id=\d+/.test(threadLink(r).getAttribute("href") || "")),
      channel: channelOf(r),
      unread: rowUnread(r),
      nameLen: textLen(titleEl(r)),
      previewLen: textLen(r),
    })),
  };
  const json = JSON.stringify(report, null, 2);
  console.log("%cKhiam meta-probe — ابعت الـ JSON ده:", "color:#818cf8;font-weight:bold");
  console.log(json);
  try { if (navigator.clipboard) navigator.clipboard.writeText(json).then(() => console.log("✅ اتنسخ للحافظة")); } catch (_) {}
  return report;
})();
