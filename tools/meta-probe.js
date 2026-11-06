/* ============================================================================
 * Khiam Ops — أداة تشخيص DOM إنبوكس ميتا (paste-in-console)
 * ----------------------------------------------------------------------------
 * الغرض: ضبط selectors قارئ الإنبوكس على بنية صفحتك الحقيقية — بدون كشف أي
 *        بيانات عملاء. كل النصوص والروابط تتحوّل لأطوال وبُنية فقط (PII-safe).
 *
 * الخطوات:
 *   1) افتح إنبوكس Meta Business Suite الحقيقي (business.facebook.com/latest/inbox).
 *   2) اضغط F12 → تبويب Console.
 *   3) الصق محتوى الملف ده كله واضغط Enter.
 *   4) هيطبع JSON (ويحاول ينسخه للحافظة تلقائيًا) — ابعتهولي زي ما هو.
 *
 * مفيش في الناتج أي اسم عميل ولا نص رسالة — بُنية وأطوال بس. راجعه قبل الإرسال.
 * ========================================================================== */
(() => {
  const textOf = (el) => ((el && (el.innerText || el.textContent)) || "").trim().replace(/\s+/g, " ");

  // عدّ كل استراتيجية منفصلة (عشان نعرف إيه اللي بيمسك في صفحتك)
  const STRATS = [
    'a[href*="selected_item_id"]',
    'a[href*="thread_id"]',
    'a[href*="/inbox/"]',
    'a[href*="/inbox/"][role]',
    '[role="row"]',
    '[role="listitem"]',
    '[role="gridcell"]',
    '[role="grid"] [role="row"]',
  ];
  const strategyCounts = {};
  for (const s of STRATS) {
    try { strategyCounts[s] = document.querySelectorAll(s).length; } catch (_) { strategyCounts[s] = -1; }
  }

  // نفس منطق القارئ: روابط المحادثات → أقرب صف
  const links = Array.from(document.querySelectorAll('a[href*="selected_item_id"], a[href*="thread_id"], a[href*="/inbox/"][role]'));
  const seen = new Set();
  const rows = [];
  for (const a of links) {
    const row = (a.closest && a.closest('[role="row"], [role="listitem"], li, [role="gridcell"]')) || a;
    if (!seen.has(row)) { seen.add(row); rows.push(row); }
  }

  const looksUnread = (el) => {
    if (!el || !el.getAttribute) return false;
    const al = (el.getAttribute("aria-label") || "") + " " + (el.getAttribute("aria-description") || "");
    if (/unread|غير مقروء|new message|رسالة جديدة/i.test(al)) return true;
    return !!(el.querySelector && el.querySelector('span[style*="600"], span[style*="700"], span[style*="bold"], b, strong'));
  };

  // بُنية عنصر بدون أي محتوى نصّي (PII-safe): الوسم + الأدوار + الأطوال فقط
  const redactHref = (h) => (h ? { len: h.length, hasThreadId: /selected_item_id|thread_id/i.test(h), startsWith: h.slice(0, 14).replace(/[0-9]/g, "#") } : null);
  const skeleton = (el, depth = 0) => {
    if (!el || el.nodeType !== 1 || depth > 3) return null;
    const attrs = {};
    const role = el.getAttribute && el.getAttribute("role");
    if (role) attrs.role = role;
    const al = el.getAttribute && el.getAttribute("aria-label");
    if (al != null) attrs.ariaLabelLen = al.length;
    const href = el.getAttribute && el.getAttribute("href");
    if (href != null) attrs.href = redactHref(href);
    const dir = el.getAttribute && el.getAttribute("dir");
    if (dir) attrs.dir = dir;
    const style = el.getAttribute && el.getAttribute("style");
    if (style && /font-weight|600|700|bold/i.test(style)) attrs.boldish = true;
    const directTextLen = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ").length;
    return {
      tag: el.tagName.toLowerCase(),
      classTokens: el.className && typeof el.className === "string" ? el.className.split(/\s+/).filter(Boolean).length : 0,
      attrs,
      directTextLen,
      childCount: el.children.length,
      children: Array.from(el.children).slice(0, 6).map((c) => skeleton(c, depth + 1)).filter(Boolean),
    };
  };

  const unreadRows = rows.filter(looksUnread);
  const report = {
    _note: "PII-safe: مفيش أسماء/نصوص عملاء — أطوال وبُنية فقط. ابعته زي ما هو.",
    url: location.pathname,
    titlePattern: (document.title || "").replace(/\d+/g, "#"),
    unreadFromTitle: (() => { const m = (document.title || "").match(/\((\d+)\)/); return m ? +m[1] : null; })(),
    strategyCounts,
    chosenRowCount: rows.length,
    unreadRowCount: unreadRows.length,
    sampleRowExtract: rows.slice(0, 4).map((r) => ({
      unread: looksUnread(r),
      textLen: textOf(r).length,
      hasThreadLink: !!(r.querySelector && r.querySelector('a[href*="selected_item_id"], a[href*="thread_id"]')) || /selected_item_id|thread_id/.test((r.getAttribute && r.getAttribute("href")) || ""),
    })),
    domSkeleton: rows.slice(0, 2).map((r) => skeleton(r)),
  };

  const json = JSON.stringify(report, null, 2);
  console.log("%cKhiam meta-probe — ابعت الـ JSON ده:", "color:#818cf8;font-weight:bold");
  console.log(json);
  try { if (navigator.clipboard) navigator.clipboard.writeText(json).then(() => console.log("✅ اتنسخ للحافظة — الصقه في الشات")); } catch (_) {}
  return report;
})();
