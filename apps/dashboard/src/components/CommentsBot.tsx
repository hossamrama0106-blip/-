// بوت التعليقات — حالة البوت + آخر التعليقات المرصودة مصنّفةً بأولوياتها ونيّتها.
import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useDash } from "../store";
import { api, type CommentsFeed } from "../api";

const PRIO: Record<string, { label: string; cls: string }> = {
  vip: { label: "عاجل", cls: "bg-red-600/25 text-red-300" },
  high: { label: "مهم", cls: "bg-amber-600/25 text-amber-300" },
  normal: { label: "عادي", cls: "bg-slate-600/30 text-slate-300" },
};
const SENT: Record<string, string> = { pos: "🙂", neu: "😐", neg: "😠" };

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ar-EG", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function CommentsBot() {
  const { showComments, setShowComments } = useDash(
    useShallow((s) => ({ showComments: s.showComments, setShowComments: s.setShowComments })),
  );
  const [feed, setFeed] = useState<CommentsFeed | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!showComments) return;
    let alive = true;
    const load = () => {
      setBusy(true);
      api
        .comments()
        .then((f) => { if (alive) { setFeed(f); setErr(null); } })
        .catch((e) => { if (alive) setErr(e?.message ?? "تعذّر التحميل"); })
        .finally(() => { if (alive) setBusy(false); });
    };
    load();
    const t = setInterval(load, 8000); // استطلاع خفيف وهي مفتوحة فقط
    return () => { alive = false; clearInterval(t); };
  }, [showComments]);

  if (!showComments) return null;
  const items = feed?.items ?? [];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setShowComments(false)}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-3xl bg-ink-850 border border-ink-700 rounded-2xl p-5 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between mb-1">
          <div className="font-bold text-white">🤖 بوت التعليقات</div>
          <button onClick={() => setShowComments(false)} className="text-slate-400 hover:text-white text-xl leading-none px-2" title="إغلاق">✕</button>
        </div>
        <div className="text-xs text-slate-500 mb-3 flex items-center gap-2 flex-wrap">
          <span className={`px-2 py-0.5 rounded-full ${feed?.enabled ? "bg-emerald-600/25 text-emerald-300" : "bg-slate-600/30 text-slate-400"}`}>
            {feed?.enabled ? "نشط — يفحص صفحتك تلقائيًّا" : "نائم — يعمل عبر الـ ingest (ضع توكن ميتا للفحص التلقائي)"}
          </span>
          {feed ? <span>كل {Math.round((feed.pollMs || 0) / 1000)} ثانية</span> : null}
        </div>

        <div className="text-[12px] text-slate-300 bg-ink-900 border border-ink-800 rounded-lg p-3 mb-3 leading-6">
          🤖 <b className="text-white">إيه ده؟</b> البوت يرصد <b>تعليقات صفحتك</b> على فيسبوك/إنستجرام، يصنّفها تلقائيًا
          (<span className="text-red-300">نية شراء = عاجل</span> · <span className="text-amber-300">شكوى = مهم</span> · استفسار)،
          ويحوّلها لـ<b>محادثات معيّنة</b> يرد عليها الفريق بالأولوية. لتفعيل الفحص التلقائي: ضع <b>توكن صفحة ميتا</b> في متغيّرات البيئة (META_PAGE_ACCESS_TOKEN).
        </div>

        <div className="overflow-y-auto -mx-1 px-1">
          {busy && !feed && <div className="text-center text-slate-400 py-10 text-sm">جارٍ التحميل…</div>}
          {err && <div className="text-center text-red-400 py-10 text-sm">{err}</div>}
          {feed && items.length === 0 && <div className="text-center text-slate-500 py-10 text-sm">لا تعليقات مرصودة بعد</div>}
          {items.length > 0 && (
            <div className="space-y-1.5">
              {items.map((c) => {
                const p = PRIO[c.priority] ?? PRIO.normal;
                return (
                  <div key={c.id} className="flex items-start gap-3 bg-ink-900 border border-ink-800 rounded-lg px-3 py-2">
                    <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full ${p.cls}`}>{p.label}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-slate-200 break-words">{SENT[c.sentiment] ?? ""} {c.text}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        <span className="text-slate-400">{c.from || "—"}</span> · {c.intent}
                        {c.enqueued ? <span className="text-emerald-400"> · دخل الطابور</span> : null}
                        {c.link ? <> · <a href={c.link} target="_blank" rel="noreferrer" className="text-brand-400 hover:underline">فتح</a></> : null}
                      </div>
                    </div>
                    <div className="shrink-0 text-[11px] text-slate-400 whitespace-nowrap">{fmtWhen(c.at)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="text-[11px] text-slate-500 mt-3 pt-3 border-t border-ink-800">
          {items.length} تعليق مرصود · يُصنَّف تلقائيًّا (نية شراء / استفسار / شكوى) ويُغذّي طابور ميتا
        </div>
      </div>
    </div>
  );
}
