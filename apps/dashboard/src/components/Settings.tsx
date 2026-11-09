import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useDash } from "../store";
import { api } from "../api";
import { useCustomize, PANELS, ACCENT_PRESETS, type PanelKey } from "../lib/customize";

export default function Settings() {
  const { showSettings, setShowSettings } = useDash(
    useShallow((s) => ({ showSettings: s.showSettings, setShowSettings: s.setShowSettings })),
  );
  const { accent, hidden, order, setAccent, togglePanel, movePanel, reset } = useCustomize(
    useShallow((s) => ({ accent: s.accent, hidden: s.hidden, order: s.order, setAccent: s.setAccent, togglePanel: s.togglePanel, movePanel: s.movePanel, reset: s.reset })),
  );
  const labelOf = (k: PanelKey) => PANELS.find((p) => p.key === k)?.label ?? k;
  const [sheet, setSheet] = useState("");
  const [ntfy, setNtfy] = useState("");
  const [saved, setSaved] = useState(false);
  const [cleared, setCleared] = useState(false);

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
      <div className="w-full max-w-lg bg-ink-850 border border-ink-700 rounded-2xl p-6 space-y-4 max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
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

        <div className="pt-3 border-t border-ink-700 space-y-3">
          <div className="text-sm font-bold text-white">🎨 تخصيص المظهر</div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">اللون المميّز</label>
            <div className="flex items-center gap-2 flex-wrap">
              {ACCENT_PRESETS.map((c) => (
                <button
                  key={c}
                  onClick={() => setAccent(c)}
                  title={c}
                  className={`w-7 h-7 rounded-full border-2 transition ${(accent ?? "#6366f1") === c ? "border-white scale-110" : "border-transparent"}`}
                  style={{ background: c }}
                />
              ))}
              <input type="color" value={accent || "#6366f1"} onChange={(e) => setAccent(e.target.value)} title="لون مخصّص" className="w-7 h-7 rounded cursor-pointer bg-transparent border border-ink-700 p-0" />
              <button onClick={() => setAccent(null)} className="text-[11px] text-slate-400 hover:text-white border border-ink-700 rounded px-2 py-1">افتراضي</button>
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">اللوحات — الترتيب والإظهار</label>
            <div className="space-y-1.5">
              {order.map((k, i) => (
                <div key={k} className="flex items-center gap-2 bg-ink-900 border border-ink-700 rounded-lg px-2.5 py-1.5">
                  <span className="text-sm text-white flex-1">{labelOf(k)}</span>
                  <button onClick={() => movePanel(k, -1)} disabled={i === 0} className="text-slate-400 hover:text-white disabled:opacity-30 px-1" title="لأعلى">▲</button>
                  <button onClick={() => movePanel(k, 1)} disabled={i === order.length - 1} className="text-slate-400 hover:text-white disabled:opacity-30 px-1" title="لأسفل">▼</button>
                  <button onClick={() => togglePanel(k)} className={`text-xs rounded px-2 py-1 border ${hidden.includes(k) ? "border-ink-700 text-slate-500" : "border-brand-500/50 text-brand-400"}`}>
                    {hidden.includes(k) ? "مخفي" : "ظاهر"}
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-2 bg-ink-900 border border-ink-700 rounded-lg px-2.5 py-1.5">
                <span className="text-sm text-white flex-1">{labelOf("alerts")}</span>
                <button onClick={() => togglePanel("alerts")} className={`text-xs rounded px-2 py-1 border ${hidden.includes("alerts") ? "border-ink-700 text-slate-500" : "border-brand-500/50 text-brand-400"}`}>
                  {hidden.includes("alerts") ? "مخفي" : "ظاهر"}
                </button>
              </div>
            </div>
          </div>

          <button onClick={reset} className="text-[11px] text-slate-400 hover:text-white">↺ إعادة الكل للافتراضي</button>
        </div>

        <div className="pt-3 border-t border-ink-700">
          <div className="text-xs font-bold text-red-400 mb-2">منطقة خطرة</div>
          <button
            onClick={() => {
              if (confirm("تنظيف كل البيانات التشغيلية (محادثات معيّنة/تنبيهات/مخالفات/تقييمات…) مع إبقاء الحسابات؟ لا يمكن التراجع."))
                api.clearSystem().then(() => { setCleared(true); setTimeout(() => setCleared(false), 2500); }).catch(() => {});
            }}
            className="text-sm bg-red-500/15 border border-red-500/50 text-red-300 hover:bg-red-500/25 rounded-lg px-4 py-2"
          >
            🧹 تنظيف البيانات الوهمية (إبقاء الحسابات)
          </button>
          {cleared && <span className="text-emerald-400 text-sm mr-2">تم التنظيف ✓ — اعمل refresh</span>}
        </div>
      </div>
    </div>
  );
}
