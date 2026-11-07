import { useShallow } from "zustand/react/shallow";
import { useDash } from "../store";
import { api } from "../api";

export default function TopBar() {
  const { connected, inbox, live, employees, liteMode, setLite, nightMode, setNight, setShowSettings, setShowKpi, setShowAudit, setShowReport, setShowTour, adminId, alerts, queue, role, theme, setTheme } = useDash(useShallow((s) => ({
    connected: s.connected,
    adminId: s.adminId,
    role: s.role,
    inbox: s.inbox,
    live: s.live,
    employees: s.employees,
    liteMode: s.liteMode,
    setLite: s.setLite,
    nightMode: s.nightMode,
    setNight: s.setNight,
    setShowSettings: s.setShowSettings,
    setShowKpi: s.setShowKpi,
    setShowAudit: s.setShowAudit,
    setShowReport: s.setShowReport,
    setShowTour: s.setShowTour,
    theme: s.theme,
    setTheme: s.setTheme,
    alerts: s.alerts,
    queue: s.queue,
  })));

  const activeCount = employees.filter((e) => live[e.id]?.online).length;
  const criticalAlerts = alerts.filter((a) => a.severity === "high").length;

  return (
    <header className="flex items-center gap-4 px-5 h-16 bg-ink-900 border-b border-ink-800 sticky top-0 z-30">
      <div className="font-extrabold text-white text-lg whitespace-nowrap">Khiam Ops</div>

      <div className="flex items-center gap-2 text-sm">
        <span className={`w-2.5 h-2.5 rounded-full ${connected ? "bg-emerald-500" : "bg-red-500"}`} />
        <span className="text-slate-400">{connected ? "متصل لحظيًا" : "غير متصل"}</span>
      </div>

      <div className="flex-1" />

      <Stat label="رسائل غير مقروءة" value={inbox.unreadMessages} tone={inbox.unreadMessages >= 15 ? "bad" : "neutral"} />
      <Stat label="تعليقات غير مقروءة" value={inbox.unreadComments} tone={inbox.unreadComments >= 10 ? "warn" : "neutral"} />
      {queue && <Stat label="طابور ميتا" value={queue.waiting} tone={queue.waiting >= 15 ? "bad" : queue.waiting >= 8 ? "warn" : "neutral"} />}
      <Stat label="موظفون نشطون" value={`${activeCount}/${employees.length}`} tone="good" />
      {criticalAlerts > 0 && <Stat label="تنبيهات حرجة" value={criticalAlerts} tone="bad" />}
      {inbox.unreadMessages >= 25 && (
        <div className="text-center px-3 py-1 rounded-lg bg-orange-600 text-white min-w-20 pulse-red">
          <div className="text-xl font-extrabold leading-none">🔥</div>
          <div className="text-[11px] mt-1 whitespace-nowrap">ذروة — {inbox.unreadMessages} متبقية</div>
        </div>
      )}

      <button
        onClick={() => setShowTour(true)}
        title="جولة تعريفية"
        className="mr-2 text-sm bg-ink-800 hover:bg-ink-700 border border-ink-700 rounded-lg px-3 py-2 text-slate-200 transition"
      >
        ؟
      </button>
      <button
        onClick={() => setTheme(theme === "light" ? "dark" : "light")}
        title="تبديل الوضع الفاتح/الداكن"
        className="mr-2 text-sm bg-ink-800 hover:bg-ink-700 border border-ink-700 rounded-lg px-3 py-2 text-slate-200 transition"
      >
        {theme === "light" ? "🌙" : "☀️"}
      </button>
      <button
        onClick={() => {
          const t = prompt("اكتب نص النداء الصوتي لكل الموظفين (هيُنطق عند الجميع):");
          if (t) api.sendNotification({ type: "broadcast_audio", from: adminId ?? "admin", to: "all", body: t });
        }}
        title="نداء صوتي جماعي"
        className="mr-2 text-sm bg-ink-800 hover:bg-ink-700 border border-ink-700 rounded-lg px-3 py-2 text-slate-200 transition"
      >
        📢
      </button>
      <button
        onClick={() => setShowKpi(true)}
        title="مؤشرات الأداء (KPI)"
        className="mr-2 text-sm bg-ink-800 hover:bg-ink-700 border border-ink-700 rounded-lg px-3 py-2 text-slate-200 transition"
      >
        📊
      </button>
      <button
        onClick={() => setShowReport(true)}
        title="تقرير الأداء اليومي"
        className="mr-2 text-sm bg-ink-800 hover:bg-ink-700 border border-ink-700 rounded-lg px-3 py-2 text-slate-200 transition"
      >
        📄
      </button>
      <button
        onClick={() => setShowAudit(true)}
        title="سجل التدقيق — أثر أفعال الإدارة"
        className="mr-2 text-sm bg-ink-800 hover:bg-ink-700 border border-ink-700 rounded-lg px-3 py-2 text-slate-200 transition"
      >
        🧾
      </button>
      {role === "admin" && (
        <button
          onClick={() => setShowSettings(true)}
          title="الإعدادات والتكاملات"
          className="mr-2 text-sm bg-ink-800 hover:bg-ink-700 border border-ink-700 rounded-lg px-3 py-2 text-slate-200 transition"
        >
          ⚙️
        </button>
      )}
      <button
        onClick={() => setNight(!nightMode)}
        title="الرادار الليلي الآلي"
        className={`mr-2 text-sm border rounded-lg px-3 py-2 transition ${
          nightMode ? "bg-brand-500/20 border-brand-400 text-brand-400" : "bg-ink-800 hover:bg-ink-700 border-ink-700 text-slate-200"
        }`}
      >
        🌙 {nightMode ? "الرادار مفعّل" : "رادار ليلي"}
      </button>
      <button
        onClick={() => setLite(!liteMode)}
        className="text-sm bg-ink-800 hover:bg-ink-700 border border-ink-700 rounded-lg px-3 py-2 text-slate-200 transition"
      >
        {liteMode ? "الوضع الكامل" : "الوضع البسيط"}
      </button>
    </header>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone: "good" | "warn" | "bad" | "neutral" }) {
  const toneCls = {
    good: "text-emerald-400",
    warn: "text-amber-400",
    bad: "text-red-400",
    neutral: "text-slate-200",
  }[tone];
  return (
    <div className="text-center px-3 py-1 rounded-lg bg-ink-850 border border-ink-800 min-w-20">
      <div className={`text-xl font-extrabold leading-none ${toneCls}`}>{value}</div>
      <div className="text-[11px] text-slate-500 mt-1 whitespace-nowrap">{label}</div>
    </div>
  );
}
