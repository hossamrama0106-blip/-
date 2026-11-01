import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useDash } from "../store";
import { api } from "../api";
import { timeAgo } from "../lib/ui";

export default function LiveModal() {
  const { liveEmployeeId, employees, closeLive } = useDash(
    useShallow((s) => ({ liveEmployeeId: s.liveEmployeeId, employees: s.employees, closeLive: s.closeLive })),
  );
  const [shot, setShot] = useState<{ dataUrl: string; at: string } | null>(null);
  const [strip, setStrip] = useState<Array<{ id: string; dataUrl: string; at: string }>>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!liveEmployeeId) return;
    let alive = true;
    const poll = async () => {
      try {
        const s = await api.latestScreenshot(liveEmployeeId);
        if (alive && s) setShot(s);
        const list = await api.screenshotsFor(liveEmployeeId);
        if (alive) setStrip(list.slice(0, 8));
      } catch {
        /* ignore */
      }
    };
    poll();
    timer.current = setInterval(poll, 3000);
    return () => {
      alive = false;
      if (timer.current) clearInterval(timer.current);
    };
  }, [liveEmployeeId]);

  if (!liveEmployeeId) return null;
  const emp = employees.find((e) => e.id === liveEmployeeId);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={closeLive}>
      <div className="w-full max-w-3xl bg-ink-900 border border-ink-700 rounded-2xl p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="font-bold text-white flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 pulse-red" /> لايف — {emp?.name}
            <span className="text-xs text-slate-400">(صورة كل 3 ثوانٍ)</span>
          </div>
          <button onClick={closeLive} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
        </div>
        {shot ? (
          <>
            <img src={shot.dataUrl} alt="live" className="w-full rounded-lg border border-ink-700" />
            <div className="text-xs text-slate-500 mt-1">آخر لقطة: {timeAgo(shot.at)}</div>
          </>
        ) : (
          <div className="py-16 text-center text-slate-400 text-sm leading-7">
            في انتظار أول لقطة…
            <br />
            تأكد أن برنامج الويندوز شغّال عند الموظف بوضع الالتقاط (<span dir="ltr" className="font-mono text-slate-300">--capture</span>)، واللايف/المراقبة الفائقة مفعّلة.
          </div>
        )}
        {strip.length > 0 && (
          <div className="flex gap-2 mt-3 overflow-x-auto">
            {strip.map((s) => (
              <img key={s.id} src={s.dataUrl} alt="" className="h-16 rounded border border-ink-800" title={timeAgo(s.at)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
