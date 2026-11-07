// سجل التدقيق — أثر كل فعل إدارة حسّاس (مَن فعل ماذا ومتى). يحمي الإدارة ويجعل المخالفات دليلاً صالحاً.
import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useDash } from "../store";
import { api, type AuditEntry } from "../api";

const ACTION_META: Record<string, { label: string; cls: string }> = {
  admin_login: { label: "دخول مدير", cls: "bg-slate-600/30 text-slate-300" },
  employee_create: { label: "إضافة موظف", cls: "bg-emerald-600/25 text-emerald-300" },
  employee_update: { label: "تعديل موظف", cls: "bg-sky-600/25 text-sky-300" },
  employee_delete: { label: "حذف موظف", cls: "bg-red-600/25 text-red-300" },
  flags_set: { label: "رقابة علنية", cls: "bg-amber-600/25 text-amber-300" },
  violation_add: { label: "مخالفة يدوية", cls: "bg-red-600/25 text-red-300" },
  point_add: { label: "نقاط", cls: "bg-indigo-600/25 text-indigo-300" },
  command_send: { label: "أمر جهاز", cls: "bg-amber-600/25 text-amber-300" },
  night_mode: { label: "رادار ليلي", cls: "bg-violet-600/25 text-violet-300" },
  settings_update: { label: "إعدادات", cls: "bg-slate-600/30 text-slate-300" },
  queue_assign: { label: "إسناد طابور", cls: "bg-sky-600/25 text-sky-300" },
  queue_skip: { label: "تخطّي طابور", cls: "bg-slate-600/30 text-slate-300" },
  notification_send: { label: "إشعار", cls: "bg-sky-600/25 text-sky-300" },
  session_revoke: { label: "خروج إجباري", cls: "bg-red-600/25 text-red-300" },
  waha_send: { label: "إرسال واتساب", cls: "bg-emerald-600/25 text-emerald-300" },
  system_reset: { label: "تصفير النظام", cls: "bg-red-600/25 text-red-300" },
};

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ar-EG", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AuditLog() {
  const { showAudit, setShowAudit } = useDash(useShallow((s) => ({ showAudit: s.showAudit, setShowAudit: s.setShowAudit })));
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!showAudit) return;
    let alive = true;
    setBusy(true);
    setErr(null);
    api
      .audit(300)
      .then((rows) => { if (alive) setEntries(rows); })
      .catch((e) => { if (alive) setErr(e?.message ?? "تعذّر تحميل السجل"); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [showAudit]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return entries;
    return entries.filter((e) => {
      const label = ACTION_META[e.action]?.label ?? e.action;
      return [e.actorName, e.targetName ?? "", e.details, label, e.action].join(" ").toLowerCase().includes(t);
    });
  }, [entries, q]);

  if (!showAudit) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setShowAudit(false)}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-3xl bg-ink-850 border border-ink-700 rounded-2xl p-5 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between mb-1">
          <div className="font-bold text-white">🧾 سجل التدقيق</div>
          <button onClick={() => setShowAudit(false)} className="text-slate-400 hover:text-white text-xl leading-none px-2" title="إغلاق">✕</button>
        </div>
        <div className="text-xs text-slate-500 mb-3">أثر لكل فعل إدارة حسّاس (دخول، تعديل موظف، تفعيل رقابة، مخالفة، أمر جهاز…) — يحمي الإدارة ويجعل الدليل صالحًا.</div>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="بحث… (اسم، فعل، تفاصيل)"
          className="w-full bg-ink-900 border border-ink-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-brand-400 mb-3"
        />

        <div className="overflow-y-auto -mx-1 px-1">
          {busy && <div className="text-center text-slate-400 py-10 text-sm">جارٍ التحميل…</div>}
          {err && <div className="text-center text-red-400 py-10 text-sm">{err}</div>}
          {!busy && !err && filtered.length === 0 && (
            <div className="text-center text-slate-500 py-10 text-sm">{entries.length ? "لا نتائج للبحث" : "لا سجلات بعد"}</div>
          )}
          {!busy && !err && filtered.length > 0 && (
            <div className="space-y-1.5">
              {filtered.map((e) => {
                const meta = ACTION_META[e.action] ?? { label: e.action, cls: "bg-slate-600/30 text-slate-300" };
                return (
                  <div key={e.id} className="flex items-start gap-3 bg-ink-900 border border-ink-800 rounded-lg px-3 py-2">
                    <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full ${meta.cls}`}>{meta.label}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-slate-200 break-words">{e.details}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        <span className="text-slate-400">{e.actorName}</span>
                        {e.targetName ? <> ← {e.targetName}</> : null}
                      </div>
                    </div>
                    <div className="shrink-0 text-left">
                      <div className="text-[11px] text-slate-400 whitespace-nowrap">{fmtWhen(e.at)}</div>
                      {e.ip && e.ip !== "local" && <div className="text-[10px] text-slate-600 font-mono" dir="ltr">{e.ip}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="text-[11px] text-slate-500 mt-3 pt-3 border-t border-ink-800">
          {entries.length} سجل · append-only · يُثبَّت ويُصدَّر مع البيانات
        </div>
      </div>
    </div>
  );
}
