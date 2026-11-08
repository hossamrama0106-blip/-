import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useDash } from "./store";
import { STATUS_META } from "./lib/ui";
import { api } from "./api";
import Login from "./components/Login";
import TopBar from "./components/TopBar";
import EmployeeCard from "./components/EmployeeCard";
import Leaderboard from "./components/Leaderboard";
import QueueBoard from "./components/QueueBoard";
import AlertsRail from "./components/AlertsRail";
import DetailPanel from "./components/DetailPanel";
import LiteMode from "./components/LiteMode";
import LiveModal from "./components/LiveModal";
import Settings from "./components/Settings";
import KpiPanel from "./components/KpiPanel";
import AuditLog from "./components/AuditLog";
import DailyReport from "./components/DailyReport";
import OnboardingTour from "./components/OnboardingTour";
import CommentsBot from "./components/CommentsBot";
import RemoteControl from "./components/RemoteControl";

export default function App() {
  const { loggedIn, liteMode, init } = useDash(useShallow((s) => ({ loggedIn: s.loggedIn, liteMode: s.liteMode, init: s.init })));
  const [booting, setBooting] = useState(true);
  useEffect(() => { init().finally(() => setBooting(false)); }, [init]);
  if (booting) return <div className="min-h-full grid place-items-center text-slate-400 text-sm">جارٍ التحميل…</div>;
  if (!loggedIn) return <Login />;
  return (
    <div className="min-h-full">
      <TopBar />
      {liteMode ? <LiteMode /> : <FullDashboard />}
      <DetailPanel />
      <LiveModal />
      <Settings />
      <KpiPanel />
      <AuditLog />
      <DailyReport />
      <OnboardingTour />
      <CommentsBot />
      <RemoteControl />
    </div>
  );
}

function toneRank(status: string): number {
  const t = STATUS_META[status]?.tone ?? "neutral";
  return t === "bad" ? 0 : t === "warn" ? 1 : t === "neutral" ? 2 : 3;
}

function FullDashboard() {
  const { employees, live, leaderboard } = useDash(useShallow((s) => ({
    employees: s.employees,
    live: s.live,
    leaderboard: s.leaderboard,
  })));
  const [showAdd, setShowAdd] = useState(false);

  // ترتيب: المشاكل أولاً (إدارة بالاستثناء) — موظفون فقط (استبعاد المدير/القائد من المراقبة)
  const ordered = useMemo(() => {
    return employees.filter((e) => e.role === "employee").sort((a, b) => {
      const sa = live[a.id]?.status ?? "offline";
      const sb = live[b.id]?.status ?? "offline";
      return toneRank(sa) - toneRank(sb);
    });
  }, [employees, live]);

  const rowFor = (id: string) => leaderboard?.rows.find((r) => r.employeeId === id);

  return (
    <div className="p-5 grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-5">
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-white">الفريق المباشر</h1>
          <button onClick={() => setShowAdd(true)} className="text-sm bg-brand-500 hover:bg-brand-400 text-white rounded-lg px-3 py-2 font-medium">
            + إضافة موظف
          </button>
        </div>

        <QueueBoard />

        <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-4 gap-3">
          {ordered.map((emp) => (
            <EmployeeCard key={emp.id} emp={emp} live={live[emp.id]} row={rowFor(emp.id)} />
          ))}
        </div>

        <Leaderboard />
      </div>

      <div className="xl:sticky xl:top-20 h-fit">
        <AlertsRail />
      </div>

      {showAdd && <AddEmployee onClose={() => setShowAdd(false)} />}
    </div>
  );
}

function AddEmployee({ onClose }: { onClose: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [role, setRole] = useState("employee");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!username || !password || !name) return;
    setBusy(true);
    try {
      await api.addEmployee({ username, password, name, whatsapp, role });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} className="w-full max-w-sm bg-ink-850 border border-ink-700 rounded-2xl p-6 space-y-3">
        <div className="font-bold text-white text-lg">إضافة موظف</div>
        <Field label="اسم المستخدم" value={username} onChange={setUsername} placeholder="username" dir="ltr" />
        <Field label="كلمة السر" value={password} onChange={setPassword} placeholder="كلمة السر" dir="ltr" />
        <Field label="الاسم" value={name} onChange={setName} placeholder="اسم الموظف" />
        <Field label="واتساب" value={whatsapp} onChange={setWhatsapp} placeholder="+20…" dir="ltr" />
        <div>
          <label className="block text-xs text-slate-400 mb-1">الدور</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full bg-ink-900 border border-ink-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-brand-400"
          >
            <option value="employee">موظف</option>
            <option value="lead">قائد فريق</option>
            <option value="admin">مدير</option>
          </select>
        </div>
        <div className="flex gap-2 pt-2">
          <button disabled={busy} className="flex-1 bg-brand-500 hover:bg-brand-400 text-white rounded-lg py-2 font-medium disabled:opacity-60">
            {busy ? "…" : "حفظ"}
          </button>
          <button type="button" onClick={onClose} className="px-4 bg-ink-800 border border-ink-700 rounded-lg text-slate-300">
            إلغاء
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, dir }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; dir?: string }) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        dir={dir}
        className="w-full bg-ink-900 border border-ink-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-brand-400"
      />
    </div>
  );
}
