import { useShallow } from "zustand/react/shallow";
import { useDash } from "../store";

export default function LiteMode() {
  const { inbox, employees, live, alerts } = useDash(useShallow((s) => ({
    inbox: s.inbox,
    employees: s.employees,
    live: s.live,
    alerts: s.alerts,
  })));
  const active = employees.filter((e) => live[e.id]?.online).length;
  const critical = alerts.filter((a) => a.severity === "high");

  return (
    <div className="max-w-md mx-auto p-5 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Big label="رسائل متراكمة" value={inbox.unreadMessages} tone={inbox.unreadMessages >= 15 ? "bad" : "neutral"} />
        <Big label="موظفون نشطون" value={`${active}/${employees.length}`} tone="good" />
      </div>

      <div className="bg-ink-900 border border-ink-800 rounded-2xl p-4">
        <div className="font-bold text-white mb-3">تنبيهات حرجة</div>
        {critical.length === 0 ? (
          <div className="text-emerald-400 text-center py-6 text-lg">كل شيء تمام ✅</div>
        ) : (
          <div className="space-y-2">
            {critical.map((a) => (
              <div key={a.id} className="bg-red-500/15 border border-red-500/50 rounded-xl p-3 text-red-200 pulse-red">
                {a.message}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Big({ label, value, tone }: { label: string; value: number | string; tone: "good" | "bad" | "neutral" }) {
  const cls = tone === "bad" ? "text-red-400" : tone === "good" ? "text-emerald-400" : "text-white";
  return (
    <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 text-center">
      <div className={`text-4xl font-extrabold ${cls}`}>{value}</div>
      <div className="text-sm text-slate-400 mt-2">{label}</div>
    </div>
  );
}
