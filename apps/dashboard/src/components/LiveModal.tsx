import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useDash } from "../store";
import { api } from "../api";
import { timeAgo } from "../lib/ui";

type Frame = { id: string; dataUrl: string; at: string };

export default function LiveModal() {
  const { liveEmployeeId, employees, closeLive } = useDash(
    useShallow((s) => ({ liveEmployeeId: s.liveEmployeeId, employees: s.employees, closeLive: s.closeLive })),
  );
  const [mode, setMode] = useState<"live" | "video">("live");
  const [shot, setShot] = useState<{ dataUrl: string; at: string } | null>(null);
  const [strip, setStrip] = useState<Frame[]>([]);
  // وضع الفيديو (تشغيل اللقطات كتسلسل)
  const [frames, setFrames] = useState<Frame[]>([]);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [fps, setFps] = useState(4);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const vtimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // بث مباشر: استطلاع كل 3 ثوانٍ (في وضع live فقط)
  useEffect(() => {
    if (!liveEmployeeId || mode !== "live") return;
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
  }, [liveEmployeeId, mode]);

  // تحميل اللقطات عند الدخول لوضع الفيديو
  useEffect(() => {
    if (!liveEmployeeId || mode !== "video") return;
    let alive = true;
    (async () => {
      try {
        const list = await api.screenshotsFor(liveEmployeeId);
        const asc = [...list].reverse(); // الأقدم → الأحدث
        if (alive) {
          setFrames(asc);
          setIdx(asc.length ? asc.length - 1 : 0);
          setPlaying(asc.length > 1);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      alive = false;
    };
  }, [liveEmployeeId, mode]);

  // مؤقّت التشغيل
  useEffect(() => {
    if (mode !== "video" || !playing || frames.length < 2) return;
    vtimer.current = setInterval(() => setIdx((i) => (i + 1) % frames.length), Math.max(80, 1000 / fps));
    return () => {
      if (vtimer.current) clearInterval(vtimer.current);
    };
  }, [mode, playing, fps, frames.length]);

  if (!liveEmployeeId) return null;
  const emp = employees.find((e) => e.id === liveEmployeeId);
  const frame = frames[Math.min(idx, Math.max(0, frames.length - 1))];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={closeLive}>
      <div className="w-full max-w-3xl bg-ink-900 border border-ink-700 rounded-2xl p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="font-bold text-white flex items-center gap-2">
            {mode === "live" ? <span className="w-2.5 h-2.5 rounded-full bg-red-500 pulse-red" /> : <span>🎥</span>}
            {mode === "live" ? "لايف" : "فيديو"} — {emp?.name}
            <span className="text-xs text-slate-400">{mode === "live" ? "(صورة كل 3 ثوانٍ)" : `(${frames.length} لقطة)`}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMode(mode === "live" ? "video" : "live")}
              className="text-xs bg-ink-800 hover:bg-ink-700 border border-ink-700 rounded-lg px-3 py-1.5 text-slate-200"
            >
              {mode === "live" ? "🎥 تشغيل كفيديو" : "🔴 العودة للمباشر"}
            </button>
            <button onClick={closeLive} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
          </div>
        </div>

        {mode === "live" ? (
          <>
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
          </>
        ) : frames.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">لا توجد لقطات محفوظة لعرضها كفيديو بعد.</div>
        ) : (
          <>
            <img src={frame?.dataUrl} alt="frame" className="w-full rounded-lg border border-ink-700" />
            <div className="flex items-center gap-3 mt-2">
              <button onClick={() => setPlaying((p) => !p)} className="text-lg px-2" title={playing ? "إيقاف" : "تشغيل"}>
                {playing ? "⏸️" : "▶️"}
              </button>
              <input
                type="range"
                min={0}
                max={frames.length - 1}
                value={idx}
                onChange={(e) => {
                  setPlaying(false);
                  setIdx(Number(e.target.value));
                }}
                className="flex-1 accent-brand-500"
              />
              <select
                value={fps}
                onChange={(e) => setFps(Number(e.target.value))}
                className="bg-ink-800 border border-ink-700 rounded px-2 py-1 text-xs text-slate-200"
                title="السرعة"
              >
                <option value={2}>×1</option>
                <option value={4}>×2</option>
                <option value={8}>×4</option>
                <option value={16}>×8</option>
              </select>
            </div>
            <div className="text-xs text-slate-500 mt-1">
              لقطة {idx + 1}/{frames.length} · {frame ? timeAgo(frame.at) : ""}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
