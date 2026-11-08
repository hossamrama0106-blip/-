// لاسلكي — اضغط مع الاستمرار للتحدّث: يسجّل صوت الإدارة ويبثّه لكل الموظفين (صوت حقيقي).
import { useRef, useState } from "react";
import { useDash } from "../store";
import { api } from "../api";

export default function PushToTalk() {
  const adminId = useDash((s) => s.adminId);
  const [rec, setRec] = useState(false);
  const [err, setErr] = useState(false);
  const mr = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);

  async function start() {
    if (rec) return;
    setErr(false);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      const m = new MediaRecorder(stream.current);
      chunks.current = [];
      m.ondataavailable = (e) => {
        if (e.data.size) chunks.current.push(e.data);
      };
      m.onstop = () => {
        const blob = new Blob(chunks.current, { type: m.mimeType || "audio/webm" });
        stream.current?.getTracks().forEach((t) => t.stop());
        if (blob.size < 800 || blob.size > 500000) return; // تجاهل القصير جدًا أو الكبير جدًا
        const reader = new FileReader();
        reader.onload = () => {
          const url = String(reader.result || "");
          api
            .sendNotification({ type: "broadcast_audio", from: adminId ?? "admin", to: "all", body: "🎙️ نداء صوتي", audioUrl: url })
            .catch(() => {});
        };
        reader.readAsDataURL(blob);
      };
      m.start();
      mr.current = m;
      setRec(true);
    } catch {
      setErr(true); // رُفض الميكروفون
    }
  }

  function stop() {
    if (!rec) return;
    try {
      mr.current?.stop();
    } catch {
      /* ignore */
    }
    setRec(false);
  }

  return (
    <button
      onMouseDown={start}
      onMouseUp={stop}
      onMouseLeave={stop}
      onTouchStart={(e) => {
        e.preventDefault();
        start();
      }}
      onTouchEnd={stop}
      title={err ? "تعذّر الوصول للميكروفون" : "اضغط مع الاستمرار للتحدّث (لاسلكي)"}
      className={`flex flex-col items-center justify-center gap-0.5 rounded-lg px-2.5 py-1.5 border transition select-none min-w-[56px] ${
        rec ? "bg-red-600/30 border-red-500 text-red-300 pulse-red" : err ? "bg-ink-800 border-red-700 text-red-400" : "bg-ink-800 hover:bg-ink-700 border-ink-700 text-slate-200"
      }`}
    >
      <span className="text-base leading-none">{rec ? "🔴" : "🎙️"}</span>
      <span className="text-[10px] leading-none whitespace-nowrap">{rec ? "يتحدّث…" : "لاسلكي"}</span>
    </button>
  );
}
