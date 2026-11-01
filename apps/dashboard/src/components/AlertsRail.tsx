import { useShallow } from "zustand/react/shallow";
import { useDash } from "../store";
import { api } from "../api";
import { timeAgo } from "../lib/ui";

const KIND_LABEL: Record<string, string> = {
  idle: "خمول",
  queue_pressure: "ضغط صندوق الوارد",
  cherry_pick: "تهرب من عميل",
  games: "ألعاب",
  fake_activity: "نشاط وهمي",
  deal_at_risk: "أوردر في خطر",
  custom: "تنبيه",
};

export default function AlertsRail() {
  const { alerts, violations, employees, select } = useDash(useShallow((s) => ({
    alerts: s.alerts,
    violations: s.violations,
    employees: s.employees,
    select: s.select,
  })));
  const name = (id: string | null) => employees.find((e) => e.id === id)?.name ?? "النظام";

  return (
    <div className="space-y-4">
      <div className="bg-ink-900 border border-ink-800 rounded-xl p-4">
        <div className="font-bold text-white mb-3 flex items-center gap-2">
          التنبيهات الحية
          {alerts.length > 0 && <span className="text-xs bg-red-500 text-white rounded-full px-2 py-0.5">{alerts.length}</span>}
        </div>
        {alerts.length === 0 ? (
          <div className="text-sm text-slate-500 py-6 text-center">لا توجد تنبيهات — كل شيء هادئ ✅</div>
        ) : (
          <div className="space-y-2">
            {alerts.map((a) => (
              <div
                key={a.id}
                className={`rounded-lg p-3 border text-sm ${
                  a.severity === "high" ? "bg-red-500/10 border-red-500/50" : "bg-amber-500/10 border-amber-500/40"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-bold ${a.severity === "high" ? "text-red-400" : "text-amber-400"}`}>
                    {KIND_LABEL[a.kind] ?? a.kind}
                  </span>
                  <span className="text-[11px] text-slate-500">{timeAgo(a.at)}</span>
                </div>
                <div className="text-slate-200 mt-1">{a.message}</div>
                <div className="flex gap-2 mt-2">
                  {a.employeeId && (
                    <button onClick={() => select(a.employeeId)} className="text-xs text-brand-400 hover:underline">
                      فتح {name(a.employeeId)}
                    </button>
                  )}
                  <button onClick={() => api.resolveAlert(a.id)} className="text-xs text-slate-400 hover:text-white">
                    تجاهل
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-ink-900 border border-ink-800 rounded-xl p-4">
        <div className="font-bold text-white mb-3">آخر المخالفات</div>
        {violations.length === 0 ? (
          <div className="text-sm text-slate-500 py-4 text-center">لا مخالفات</div>
        ) : (
          <div className="space-y-2">
            {violations.slice(0, 8).map((v) => (
              <div key={v.id} onClick={() => select(v.employeeId)} className="rounded-lg p-2.5 bg-ink-850 border border-ink-800 text-sm cursor-pointer hover:border-brand-400">
                <div className="flex items-center justify-between">
                  <span className="text-white font-medium">{name(v.employeeId)}</span>
                  <span className="text-[11px] text-slate-500">{timeAgo(v.at)}</span>
                </div>
                <div className="text-red-300 text-xs mt-0.5">{v.type}</div>
                <div className="text-slate-400 text-xs">{v.reason}</div>
                {v.link && (
                  <a href={v.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-brand-400 text-[11px] underline">فتح الرابط المرفق</a>
                )}
                {v.imageUrl && <img src={v.imageUrl} alt="دليل" className="mt-1 h-14 rounded border border-ink-800" />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
