// تكاملات خارجية بلا حسابات معقّدة (أفضل جهد — لا توقف النظام عند الفشل):
// - Google Apps Script Web App (تسجيل المخالفات في Google Sheet تلقائياً).
// - ntfy.sh (إشعارات طوارئ فورية لموبايل المدير بدون تسجيل).

export async function pushViolationToSheet(url: string, row: Record<string, unknown>): Promise<void> {
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(row),
    });
  } catch {
    /* صامت */
  }
}

/** priority: 1..5 (5 = عاجل) */
export async function notifyNtfy(topic: string, title: string, message: string, priority = 4): Promise<void> {
  if (!topic) return;
  try {
    await fetch("https://ntfy.sh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ topic, title, message, priority, tags: ["rotating_light"] }),
    });
  } catch {
    /* صامت */
  }
}
