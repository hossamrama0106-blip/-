import { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useDash } from "../store";
import { api, type QueueTask } from "../api";
import { fmtGap } from "../lib/ui";

const CH_LABEL: Record<string, string> = { messenger: "ماسنجر", instagram: "انستجرام", whatsapp: "واتساب", comments: "تعليقات", operix: "أوبريكس" };
const PR_LABEL: Record<string, string> = { vip: "VIP", high: "مهمة", normal: "عادية" };
const PR_CLS: Record<string, string> = {
  vip: "bg-orange-900/60 text-orange-200 border-orange-700",
  high: "bg-amber-900/50 text-amber-200 border-amber-700",
  normal: "bg-ink-800 text-slate-300 border-ink-700",
};

function sinceMs(iso: string | null): number | null {
  return iso ? Date.now() - new Date(iso).getTime() : null;
}

export default function QueueBoard() {
  const { queue, employees, live, select, adminId } = useDash(useShallow((s) => ({
    queue: s.queue,
    employees: s.employees,
    live: s.live,
    select: s.select,
    adminId: s.adminId,
  })));
  const [busy, setBusy] = useState(false);
  const [assignTo, setAssignTo] = useState("");
  // نموذج التعيين اليدوي
  const [cref, setCref] = useState("");
  const [clink, setClink] = useState("");
  const [cto, setCto] = useState("all");

  // الموظفون الخاضعون للمراقبة فقط (استبعاد الإدارة)
  const staff = useMemo(() => employees.filter((e) => e.role === "employee"), [employees]);
  const workers = useMemo(() => staff.filter((e) => live[e.id]?.presence === "working"), [staff, live]);

  if (!queue) return null;

  const roster = queue.perEmployee
    .filter((p) => live[p.employeeId]?.presence === "working" || p.current || p.doneToday > 0)
    .sort((a, b) => (b.current ? 1 : 0) - (a.current ? 1 : 0) || b.doneToday - a.doneToday);

  const target = assignTo || workers[0]?.id || "";

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); } catch (e) { console.error(e); } finally { setBusy(false); }
  };

  // تعيين محادثة محدّدة لموظف أو للكل (إشعار + تلوين في ميتا عبر الإكستنشن)
  const assignNew = () =>
    run(async () => {
      const ref = cref.trim();
      if (!ref) return;
      const task = await api.enqueueTask({ customerRef: ref, channel: "messenger", preview: clink ? "محادثة محتاجة رد" : "محادثة محتاجة رد عاجل", priority: "high", link: clink.trim() || undefined });
      if (cto === "all") {
        await api.sendNotification({ type: "message", from: adminId ?? "admin", to: "all", body: `📌 محادثة محتاجة رد: ${ref}${clink ? "\n" + clink : ""}` });
      } else if (cto) {
        await api.assignTask(task.id, cto); // يُسنِد + يبعت إشعارًا للموظف
      }
      setCref(""); setClink("");
    });

  const toggleStrict = () => run(() => api.setSettings({ queueStrict: !queue.strict }));
  const assign = (t: QueueTask) => target && run(() => api.assignTask(t.id, target));

  const waitTone = queue.waiting >= 15 ? "text-red-400" : queue.waiting >= 8 ? "text-amber-400" : "text-white";

  return (
    <div className="bg-ink-900 border border-ink-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="font-bold text-white flex items-center gap-2">
          📌 المحادثات المعيّنة
          <span className={`text-[11px] px-2 py-0.5 rounded-full border ${queue.strict ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-300" : "bg-ink-800 border-ink-700 text-slate-400"}`}>
            {queue.strict ? "إجباري — توزيع تلقائي" : "تعيين يدوي"}
          </span>
        </div>
        <button onClick={toggleStrict} disabled={busy} className="text-xs bg-ink-850 hover:bg-ink-800 border border-ink-700 rounded-lg px-3 py-1.5 text-slate-200 disabled:opacity-60">
          {queue.strict ? "إيقاف التوزيع التلقائي" : "تفعيل التوزيع التلقائي"}
        </button>
      </div>

      {/* نموذج تعيين محادثة (بدل البيانات الوهمية) */}
      <div className="bg-ink-850 border border-ink-800 rounded-lg p-3 mb-4">
        <div className="text-xs font-bold text-slate-400 mb-2">تعيين محادثة — تصل لمن اخترته إشعار + تتلوّن في ميتا</div>
        <div className="flex flex-wrap gap-2">
          <input value={cref} onChange={(e) => setCref(e.target.value)} placeholder="اسم العميل/المحادثة" className="flex-1 min-w-[140px] bg-ink-900 border border-ink-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-brand-400" />
          <input value={clink} onChange={(e) => setClink(e.target.value)} dir="ltr" placeholder="رابط المحادثة (اختياري)" className="flex-1 min-w-[140px] bg-ink-900 border border-ink-700 rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-brand-400" />
          <select value={cto} onChange={(e) => setCto(e.target.value)} className="bg-ink-900 border border-ink-700 rounded-lg px-2 py-2 text-slate-200 text-sm outline-none">
            <option value="all">🔔 الكل</option>
            {staff.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <button onClick={assignNew} disabled={busy || !cref.trim()} className="bg-brand-500 hover:bg-brand-400 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
            تعيين
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4">
        <Tile label="في الانتظار" value={queue.waiting} cls={waitTone} />
        <Tile label="قيد المعالجة" value={queue.assigned} />
        <Tile label="منجز اليوم" value={queue.doneToday} cls="text-emerald-400" />
        <Tile label="متوسط الانتظار" value={fmtGap(queue.avgWaitMs)} />
        <Tile label="متوسط المعالجة" value={fmtGap(queue.avgHandleMs)} />
        <Tile label="أقدم انتظار" value={fmtGap(queue.oldestWaitMs)} cls={queue.oldestWaitMs && queue.oldestWaitMs > 180000 ? "text-red-400" : "text-white"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-bold text-slate-400">في الانتظار ({queue.waiting})</div>
            {workers.length > 0 && (
              <select value={target} onChange={(e) => setAssignTo(e.target.value)} className="text-[11px] bg-ink-850 border border-ink-700 rounded-md px-2 py-1 text-slate-200 outline-none max-w-[45%]" title="اختر موظفًا ثم اضغط أسند">
                {workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            )}
          </div>
          {queue.waitingList.length === 0 ? (
            <div className="text-xs text-slate-500 bg-ink-850 border border-ink-800 rounded-lg px-3 py-4 text-center">لا توجد محادثات منتظرة ✅</div>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {queue.waitingList.map((t) => (
                <div key={t.id} className="flex items-center gap-2 bg-ink-850 border border-ink-800 rounded-lg px-2.5 py-1.5">
                  <span className={`badge text-[10px] px-1.5 py-0.5 rounded-full border shrink-0 ${PR_CLS[t.priority]}`}>{PR_LABEL[t.priority]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-white truncate">{t.customerRef}</div>
                    <div className="text-[10px] text-slate-500 truncate">{CH_LABEL[t.channel] ?? t.channel} · {t.preview}{t.link ? " · 🔗" : ""}</div>
                  </div>
                  <span className="text-[10px] text-amber-400 shrink-0">{fmtGap(sinceMs(t.enqueuedAt))}</span>
                  <button onClick={() => assign(t)} disabled={busy || !target} className="text-[11px] bg-brand-500/20 border border-brand-400 text-brand-300 rounded-md px-2 py-1 shrink-0 disabled:opacity-40">أسند</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="text-xs font-bold text-slate-400 mb-2">الموظفون ({roster.length})</div>
          {roster.length === 0 ? (
            <div className="text-xs text-slate-500 bg-ink-850 border border-ink-800 rounded-lg px-3 py-4 text-center">لا أحد في شيفت الآن</div>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {roster.map((p) => (
                <div key={p.employeeId} onClick={() => select(p.employeeId)} className="flex items-center gap-2 bg-ink-850 border border-ink-800 rounded-lg px-2.5 py-1.5 cursor-pointer hover:border-brand-400/50">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
                  <span className="text-xs text-white truncate w-24 shrink-0">{p.name}</span>
                  <div className="flex-1 min-w-0">
                    {p.current ? (
                      <>
                        <div className="text-xs text-slate-200 truncate">{p.current.customerRef}</div>
                        <div className="text-[10px] text-slate-500 truncate">{CH_LABEL[p.current.channel] ?? p.current.channel} · منذ {fmtGap(sinceMs(p.current.assignedAt))}</div>
                      </>
                    ) : (
                      <span className="text-[11px] text-slate-600">فاضي — بلا مهمة</span>
                    )}
                  </div>
                  <span className="text-[10px] text-emerald-400 shrink-0" title="منجز اليوم">✓ {p.doneToday}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, cls = "text-white" }: { label: string; value: number | string; cls?: string }) {
  return (
    <div className="bg-ink-850 border border-ink-800 rounded-lg py-2 text-center">
      <div className={`text-lg font-extrabold leading-none ${cls}`}>{value}</div>
      <div className="text-[10px] text-slate-500 mt-1 whitespace-nowrap">{label}</div>
    </div>
  );
}
