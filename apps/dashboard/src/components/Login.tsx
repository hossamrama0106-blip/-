import { useState } from "react";
import { useDash } from "../store";

export default function Login() {
  const login = useDash((s) => s.login);
  const [code, setCode] = useState("ADMIN");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await login(code.trim());
    } catch (e: any) {
      setErr(e.message ?? "فشل الدخول");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full grid place-items-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-ink-850 border border-ink-700 rounded-2xl p-7 shadow-2xl">
        <div className="text-center mb-6">
          <div className="text-3xl font-extrabold text-white">Khiam Ops</div>
          <div className="text-sm text-slate-400 mt-1">داشبورد إدارة فريق خدمة العملاء</div>
        </div>
        <label className="block text-sm text-slate-300 mb-2">كود الدخول</label>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="ADMIN"
          className="w-full bg-ink-900 border border-ink-700 rounded-xl px-4 py-3 text-white outline-none focus:border-brand-400 text-center text-lg tracking-widest"
          autoFocus
        />
        {err && <div className="text-red-400 text-sm mt-3 text-center">{err}</div>}
        <button
          disabled={busy}
          className="w-full mt-5 bg-brand-500 hover:bg-brand-400 disabled:opacity-60 text-white font-bold rounded-xl py-3 transition"
        >
          {busy ? "جارٍ الدخول…" : "دخول"}
        </button>
        <div className="text-xs text-slate-500 text-center mt-4">
          وضع التطوير: استخدم <span className="text-slate-300 font-mono">ADMIN</span> للدخول كمدير
        </div>
      </form>
    </div>
  );
}
