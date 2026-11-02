// لوحة مؤشرات الأداء (KPI) — Modal يعرض الحِمل عبر الزمن + جودة الردود + لقطة الطابور
import { useEffect, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { useDash } from "../store";
import { fmtGap, clockAt } from "../lib/ui";
import { AreaChart, Donut, Bars, type SeriesKey } from "./Charts";

const LOAD_KEYS: SeriesKey[] = [
  { key: "unread", label: "رسائل", color: "#818cf8" },
  { key: "comments", label: "تعليقات", color: "#38bdf8" },
  { key: "queueWaiting", label: "طابور منتظر", color: "#f59e0b" },
  { key: "online", label: "متصلون", color: "#22c55e" },
];

export default function KpiPanel() {
  const { kpi, showKpi, setShowKpi, refreshKpi } = useDash(
    useShallow((s) => ({ kpi: s.kpi, showKpi: s.showKpi, setShowKpi: s.setShowKpi, refreshKpi: s.refreshKpi })),
  );

  // استطلاع كل 5 ثوانٍ وهي مفتوحة فقط — خفيف على السيرفر
  useEffect(() => {
    if (!showKpi) return;
    refreshKpi();
    const t = setInterval(refreshKpi, 5000);
    return () => clearInterval(t);
  }, [showKpi, refreshKpi]);

  if (!showKpi) return null;

  const series = kpi?.series ?? [];
  const reviews = kpi?.reviews ?? { good: 0, ok: 0, bad: 0 };
  const last = series[series.length - 1];
  const totalReviews = reviews.good + reviews.ok + reviews.bad;
  const close = () => setShowKpi(false);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={close}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-ink-850 border border-ink-700 rounded-2xl p-6 space-y-5"
      >
        <div className="flex items-center justify-between">
          <div className="font-bold text-white text-lg">📊 مؤشرات الأداء</div>
          <button onClick={close} className="text-slate-400 hover:text-white text-xl leading-none px-2" title="إغلاق">
            ✕
          </button>
        </div>

        {/* بطاقات ملخّص */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Tile label="متصلون" value={last?.online ?? 0} tone="good" />
          <Tile label="رسائل" value={last?.unread ?? 0} tone={(last?.unread ?? 0) >= 15 ? "bad" : "neutral"} />
          <Tile label="تعليقات" value={last?.comments ?? 0} tone={(last?.comments ?? 0) >= 10 ? "warn" : "neutral"} />
          <Tile
            label="منتظر بالطابور"
            value={last?.queueWaiting ?? 0}
            tone={(last?.queueWaiting ?? 0) >= 15 ? "bad" : (last?.queueWaiting ?? 0) >= 8 ? "warn" : "neutral"}
          />
          <Tile label="متوسط المعالجة" value={fmtGap(last?.avgHandleMs ?? null)} tone="neutral" />
          <Tile label="تقييمات" value={totalReviews} tone="neutral" />
        </div>

        {series.length < 2 ? (
          <div className="text-center text-slate-500 py-10 text-sm">لسه بيتجمّع… استنى شوية وهتظهر الرسوم تلقائيًا.</div>
        ) : (
          <>
            {/* الحِمل عبر الزمن */}
            <Section title="الحِمل عبر الزمن">
              <AreaChart series={series} keys={LOAD_KEYS} />
              <div dir="ltr" className="flex justify-between text-[11px] text-slate-500 mt-1 px-1">
                <span>{clockAt(series[0].at)}</span>
                <span>{clockAt(series[series.length - 1].at)}</span>
              </div>
              <div className="flex flex-wrap gap-3 mt-2">
                {LOAD_KEYS.map((k) => (
                  <div key={k.key} className="flex items-center gap-1.5 text-xs text-slate-400">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: k.color }} />
                    {k.label}
                  </div>
                ))}
              </div>
            </Section>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* جودة الردود */}
              <Section title="جودة الردود">
                <div className="flex items-center gap-4">
                  <Donut
                    segments={[
                      { label: "جيد", value: reviews.good, color: "#22c55e" },
                      { label: "مقبول", value: reviews.ok, color: "#f59e0b" },
                      { label: "سيئ", value: reviews.bad, color: "#ef4444" },
                    ]}
                  />
                  <div className="space-y-2 text-sm flex-1">
                    <LegendRow color="#22c55e" label="🟢 جيد" value={reviews.good} />
                    <LegendRow color="#f59e0b" label="🟡 مقبول" value={reviews.ok} />
                    <LegendRow color="#ef4444" label="🔴 سيئ" value={reviews.bad} />
                  </div>
                </div>
              </Section>

              {/* لقطة الطابور الآن */}
              <Section title="الطابور الآن">
                <Bars
                  items={[
                    { label: "منتظر", value: last?.queueWaiting ?? 0, color: "#f59e0b" },
                    { label: "قيد المعالجة", value: last?.queueAssigned ?? 0, color: "#818cf8" },
                    { label: "منجز اليوم", value: last?.queueDone ?? 0, color: "#22c55e" },
                  ]}
                />
              </Section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

type Tone = "good" | "warn" | "bad" | "neutral";

function Tile({ label, value, tone }: { label: string; value: number | string; tone: Tone }) {
  const c = { good: "text-emerald-400", warn: "text-amber-400", bad: "text-red-400", neutral: "text-slate-100" }[tone];
  return (
    <div className="bg-ink-900 border border-ink-800 rounded-xl px-3 py-2 text-center">
      <div className={`text-2xl font-extrabold leading-none ${c}`}>{value}</div>
      <div className="text-[11px] text-slate-500 mt-1 whitespace-nowrap">{label}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-ink-900 border border-ink-800 rounded-xl p-4">
      <div className="text-sm font-bold text-slate-200 mb-3">{title}</div>
      {children}
    </div>
  );
}

function LegendRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: color }} />
      <span className="text-slate-300 flex-1">{label}</span>
      <span className="text-white font-bold">{value}</span>
    </div>
  );
}
