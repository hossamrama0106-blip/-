// التحكّم عن بُعد — إرسال أوامر آمنة محدّدة للإكستنشن/البرنامج عند الموظف (مدير فقط).
// لا تنفيذ أكواد عشوائية — مجموعة أوامر مثبّتة فقط، وكل أمر يُسجَّل في التدقيق.
import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useDash } from "../store";
import { api } from "../api";

const CMDS: { cmd: string; icon: string; label: string; hint: string }[] = [
  { cmd: "reload", icon: "🔄", label: "إعادة تحميل", hint: "الإكستنشن يعيد تحميل نفسه، والبرنامج يعيد قراءة الإعدادات" },
  { cmd: "refresh_config", icon: "🔃", label: "تحديث الإعدادات", hint: "إعادة جلب إعدادات الاتصال اللحظي" },
  { cmd: "screenshot_now", icon: "📸", label: "لقطة فورية", hint: "البرنامج يلتقط لقطة الآن (لو الالتقاط مسموح)" },
  { cmd: "ping", icon: "📡", label: "فحص الاتصال", hint: "يتأكد إن العميل حيّ ويستقبل" },
  { cmd: "logout", icon: "🚪", label: "تسجيل خروج", hint: "ينهي جلسة الموظف على الجهاز" },
];

export default function RemoteControl() {
  const { showRemote, setShowRemote, employees } = useDash(
    useShallow((s) => ({ showRemote: s.showRemote, setShowRemote: s.setShowRemote, employees: s.employees })),
  );
  const [to, setTo] = useState("all");
  const [url, setUrl] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(cmd: string) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.command(to, cmd);
      setMsg(`تم الإرسال إلى ${r.sent} جهاز ✅`);
    } catch (e: any) {
      setMsg(e?.message ?? "فشل الإرسال");
    } finally {
      setBusy(false);
    }
  }

  if (!showRemote) return null;
  const emps = employees.filter((e) => e.role === "employee");

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setShowRemote(false)}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg bg-ink-850 border border-ink-700 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-1">
          <div className="font-bold text-white">🎛️ التحكّم عن بُعد</div>
          <button onClick={() => setShowRemote(false)} className="text-slate-400 hover:text-white text-xl leading-none px-2" title="إغلاق">✕</button>
        </div>
        <div className="text-xs text-slate-500 mb-4">أوامر آمنة محدّدة تُرسل لجهاز الموظف (بدون تنفيذ أكواد عشوائية). كل أمر يُسجَّل في سجل التدقيق.</div>

        <label className="block text-xs text-slate-400 mb-1">إلى</label>
        <select value={to} onChange={(e) => setTo(e.target.value)} className="w-full bg-ink-900 border border-ink-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-brand-400 mb-4">
          <option value="all">كل الموظفين</option>
          {emps.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>

        <div className="grid grid-cols-2 gap-2">
          {CMDS.map((c) => (
            <button
              key={c.cmd}
              disabled={busy}
              onClick={() => send(c.cmd)}
              title={c.hint}
              className="text-right bg-ink-900 hover:bg-ink-800 border border-ink-700 rounded-lg px-3 py-2 disabled:opacity-60"
            >
              <div className="text-sm text-white">{c.icon} {c.label}</div>
              <div className="text-[11px] text-slate-500 mt-0.5 leading-5">{c.hint}</div>
            </button>
          ))}
        </div>

        <div className="mt-3 flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            dir="ltr"
            className="flex-1 bg-ink-900 border border-ink-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-brand-400"
          />
          <button
            disabled={busy || !/^https?:\/\//i.test(url)}
            onClick={() => send("open_url:" + url)}
            className="bg-brand-500 hover:bg-brand-400 disabled:opacity-60 text-white rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap"
          >
            🔗 فتح رابط
          </button>
        </div>

        {msg && <div className="text-sm text-center mt-4 text-slate-300">{msg}</div>}
      </div>
    </div>
  );
}
