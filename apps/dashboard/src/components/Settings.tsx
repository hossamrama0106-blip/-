import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useDash } from "../store";
import { api } from "../api";

export default function Settings() {
  const { showSettings, setShowSettings } = useDash(
    useShallow((s) => ({ showSettings: s.showSettings, setShowSettings: s.setShowSettings })),
  );
  const [sheet, setSheet] = useState("");
  const [ntfy, setNtfy] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!showSettings) return;
    api
      .getSettings()
      .then((s) => {
        setSheet(s.googleSheetWebhook || "");
        setNtfy(s.ntfyTopic || "");
      })
      .catch(() => {});
  }, [showSettings]);

  if (!showSettings) return null;

  async function save() {
    await api.setSettings({ googleSheetWebhook: sheet, ntfyTopic: ntfy });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setShowSettings(false)}>
      <div className="w-full max-w-lg bg-ink-850 border border-ink-700 rounded-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="font-bold text-white text-lg">الإعدادات والتكاملات</div>
          <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div>
          <label className="block text-sm text-slate-300 mb-1">رابط Google Sheet (Apps Script Web App)</label>
          <input value={sheet} onChange={(e) => setSheet(e.target.value)} dir="ltr" placeholder="https://script.google.com/macros/s/.../exec" className="w-full bg-ink-900 border border-ink-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-brand-400" />
          <div className="text-[11px] text-slate-500 mt-1">كل مخالفة تُسجَّل تلقائياً في الشيت. طريقة الإعداد بضغطة في MANUAL_STEPS_AR.md.</div>
        </div>

        <div>
          <label className="block text-sm text-slate-300 mb-1">قناة ntfy.sh لإشعارات الطوارئ</label>
          <input value={ntfy} onChange={(e) => setNtfy(e.target.value)} dir="ltr" placeholder="khiam-ops-alerts-xyz" className="w-full bg-ink-900 border border-ink-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-brand-400" />
          <div className="text-[11px] text-slate-500 mt-1">حمّل تطبيق ntfy على موبايلك واشترك بنفس الاسم لتصلك المخالفات الحرجة فوراً (بدون حساب).</div>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button onClick={save} className="bg-brand-500 hover:bg-brand-400 text-white rounded-lg px-4 py-2 font-medium">حفظ</button>
          {saved && <span className="text-emerald-400 text-sm">تم الحفظ ✓</span>}
        </div>
      </div>
    </div>
  );
}
