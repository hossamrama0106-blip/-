import { useShallow } from "zustand/react/shallow";
import { useDash } from "../store";
import { api } from "../api";
import PushToTalk from "./PushToTalk";

export default function TopBar() {
  const { connected, inbox, live, employees, liteMode, setLite, nightMode, setNight, setShowSettings, setShowKpi, setShowAudit, setShowReport, setShowTour, setShowComments, setShowRemote, adminId, alerts, queue, role, theme, setTheme } = useDash(useShallow((s) => ({
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
    setShowComments: s.setShowComments,
    setShowRemote: s.setShowRemote,
    theme: s.theme,
    setTheme: s.setTheme,
    alerts: s.alerts,
    queue: s.queue,
  })));

  // عدّاد النشطين: الموظفون فقط (استبعاد المدير/القائد)
  const monitored = employees.filter((e) => e.role === "employee");
  const activeCount = monitored.filter((e) => live[e.id]?.online).length;
  const criticalAlerts = alerts.filter((a) => a.severity === "high").length;

  return (
    <header className="flex items-center gap-3 px-5 h-20 bg-ink-900 border-b border-ink-800 sticky top-0 z-30 overflow-x-auto">
      <div className="font-extrabold text-white text-lg whitespace-nowrap">Khiam Ops</div>

      <div className="flex items-center gap-2 text-sm whitespace-nowrap">
        <span className={`w-2.5 h-2.5 rounded-full ${connected ? "bg-emerald-500" : "bg-red-500"}`} />
        <span className="text-slate-400">{connected ? "متصل لحظيًا" : "غير متصل"}</span>
      </div>

      <div className="flex-1" />

      <Stat label="رسائل غير مقروءة" value={inbox.unreadMessages} tone={inbox.unreadMessages >= 15 ? "bad" : "neutral"} />
      <Stat label="تعليقات غير مقروءة" value={inbox.unreadComments} tone={inbox.unreadComments >= 10 ? "warn" : "neutral"} />
      {queue && <Stat label="طابور ميتا" value={queue.waiting} tone={queue.waiting >= 15 ? "bad" : queue.waiting >= 8 ? "warn" : "neutral"} />}
      <Stat label="موظفون نشطون" value={`${activeCount}/${monitored.length}`} tone="good" />
      {criticalAlerts > 0 && <Stat label="تنبيهات حرجة" value={criticalAlerts} tone="bad" />}
      {inbox.unreadMessages >= 25 && (
        <div className="text-center px-3 py-1 rounded-lg bg-orange-600 text-white min-w-20 pulse-red">
          <div className="text-xl font-extrabold leading-none">🔥</div>
          <div className="text-[11px] mt-1 whitespace-nowrap">ذروة — {inbox.unreadMessages} متبقية</div>
        </div>
      )}

      {/* أزرار بأسماء تحتها (بدل أيقونات مبهمة) */}
      <div className="flex items-center gap-1.5">
        {role === "admin" && <IconBtn icon="🎛️" label="تحكّم عن بُعد" onClick={() => setShowRemote(true)} />}
        <IconBtn icon="🤖" label="بوت التعليقات" onClick={() => setShowComments(true)} />
        <IconBtn icon="📊" label="مؤشرات" onClick={() => setShowKpi(true)} />
        <IconBtn icon="📄" label="تقرير يومي" onClick={() => setShowReport(true)} />
        <IconBtn icon="🧾" label="سجل التدقيق" onClick={() => setShowAudit(true)} />
        <IconBtn icon="📢" label="نداء صوتي" onClick={() => {
          const t = prompt("اكتب نص النداء الصوتي لكل الموظفين (هيُنطق عند الجميع):");
          if (t) api.sendNotification({ type: "broadcast_audio", from: adminId ?? "admin", to: "all", body: t });
        }} />
        <PushToTalk />
        <IconBtn icon="🌃" label={nightMode ? "رادار مفعّل" : "رادار ليلي"} active={nightMode} onClick={() => setNight(!nightMode)} />
        <IconBtn icon={theme === "light" ? "🌙" : "☀️"} label={theme === "light" ? "داكن" : "فاتح"} onClick={() => setTheme(theme === "light" ? "dark" : "light")} />
        <IconBtn icon={liteMode ? "🖥️" : "📱"} label={liteMode ? "وضع كامل" : "وضع بسيط"} onClick={() => setLite(!liteMode)} />
        {role === "admin" && <IconBtn icon="⚙️" label="الإعدادات" onClick={() => setShowSettings(true)} />}
        <IconBtn icon="❓" label="جولة" onClick={() => setShowTour(true)} />
      </div>
    </header>
  );
}

function IconBtn({ icon, label, onClick, active, title }: { icon: string; label: string; onClick: () => void; active?: boolean; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title ?? label}
      className={`flex flex-col items-center justify-center gap-0.5 rounded-lg px-2.5 py-1.5 border transition min-w-[56px] ${
        active ? "bg-brand-500/20 border-brand-400 text-brand-400" : "bg-ink-800 hover:bg-ink-700 border-ink-700 text-slate-200"
      }`}
    >
      <span className="text-base leading-none">{icon}</span>
      <span className="text-[10px] leading-none whitespace-nowrap">{label}</span>
    </button>
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
