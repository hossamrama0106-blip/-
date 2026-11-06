// تقرير الأداء اليومي للفريق (أدمِن) — ملخّص فريق + جدول لكل موظف + توزيع القنوات،
// قابل للطباعة/PDF وإرسال ملخّص شخصي لكل موظف على واتساب (wa.me، بدون حسابات).
import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useDash } from "../store";
import { api, type DailyReport as Report } from "../api";
import { fmtGap, clockAt, PRESENCE_LABEL } from "../lib/ui";

const CH_LABEL: Record<string, string> = { messenger: "ماسنجر", instagram: "انستجرام", whatsapp: "واتساب", comments: "تعليقات", operix: "أوبريكس" };

function esc(s: string): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c));
}
/** تطبيع رقم واتساب لصيغة دولية بدون + (أرقام مصرية محلية → 20) */
function waNormalize(raw: string | null): string {
  let d = (raw || "").replace(/[^0-9]/g, "");
  if (!d) return "";
  if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = "20" + d.slice(1);
  return d;
}

export default function DailyReport() {
  const { showReport, setShowReport } = useDash(useShallow((s) => ({ showReport: s.showReport, setShowReport: s.setShowReport })));
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!showReport) return;
    let alive = true;
    setLoading(true);
    setErr("");
    api
      .reportDaily()
      .then((r) => { if (alive) setReport(r); })
      .catch((e) => { if (alive) setErr(String(e?.message || e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [showReport]);

  const dateLabel = useMemo(() => new Date().toLocaleDateString("ar-EG", { weekday: "long", year: "numeric", month: "long", day: "numeric" }), []);
  const rows = useMemo(
    () => (report ? [...report.rows].sort((a, b) => b.points * 10 + b.msgs + b.orders * 3 - (a.points * 10 + a.msgs + a.orders * 3)) : []),
    [report],
  );

  if (!showReport) return null;

  const onClose = () => setShowReport(false);

  const empSummary = (r: Report["rows"][number]) =>
    [
      `📊 ملخّص يومك — ${r.name}`,
      `📅 ${dateLabel}`,
      "",
      `• رسائل: ${r.msgs}`,
      `• تعليقات: ${r.comments}`,
      `• أوردرات: ${r.orders}`,
      `• محادثات طابور منجزة: ${r.tasksDone}`,
      `• نقاط: ${r.points >= 0 ? "+" : ""}${r.points}`,
      `• جودة الردود: 🟢 ${r.reviews.good} / 🟡 ${r.reviews.ok} / 🔴 ${r.reviews.bad}`,
      r.violations ? `• مخالفات اليوم: ${r.violations} ⚠️` : "• لا مخالفات اليوم ✅",
      "",
      "— إدارة Khiam Ops",
    ].join("\n");

  const sendEmp = (r: Report["rows"][number]) => {
    const n = waNormalize(r.whatsapp);
    if (!n) return;
    window.open(`https://wa.me/${n}?text=${encodeURIComponent(empSummary(r))}`, "_blank", "noopener");
  };

  const printReport = () => {
    if (!report) return;
    const w = window.open("", "_blank", "width=900,height=800");
    if (!w) return;
    const t = report.team;
    const body = rows
      .map(
        (r) =>
          `<tr><td class="nm">${esc(r.name)}</td><td>${r.msgs}</td><td>${r.comments}</td><td>${r.orders}</td><td>${r.tasksDone}</td><td>${fmtGap(r.avgGapMs)}</td><td class="g">${r.reviews.good}</td><td class="o">${r.reviews.ok}</td><td class="b">${r.reviews.bad}</td><td>${r.violations}</td><td>${r.points >= 0 ? "+" : ""}${r.points}</td></tr>`,
      )
      .join("");
    const chans = Object.entries(report.byChannel)
      .map(([k, v]) => `${esc(CH_LABEL[k] || k)}: منتظر ${v.waiting} / قيد المعالجة ${v.assigned}`)
      .join(" · ") || "لا شيء في الطابور";
    w.document.write(
      `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>تقرير الأداء اليومي</title>` +
        `<style>body{font-family:'Segoe UI',Tahoma,sans-serif;padding:24px;color:#111}h1{margin:0 0 2px;font-size:22px}` +
        `.sub{color:#666;font-size:13px;margin-bottom:14px}.cards{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px}` +
        `.card{border:1px solid #e5e7eb;border-radius:10px;padding:8px 14px;min-width:90px}.card b{display:block;font-size:20px}` +
        `.card span{color:#666;font-size:12px}.ch{background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:8px 12px;font-size:13px;margin-bottom:14px}` +
        `table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid #e5e7eb;padding:6px 8px;text-align:center}` +
        `th{background:#f1f5f9}.nm{text-align:right;font-weight:700}.g{color:#16a34a}.o{color:#b45309}.b{color:#dc2626}` +
        `.foot{margin-top:16px;color:#888;font-size:12px}</style></head><body>` +
        `<h1>📊 تقرير الأداء اليومي</h1><div class="sub">${esc(dateLabel)} · ${t.onlineNow}/${t.employees} متصل الآن</div>` +
        `<div class="cards">` +
        `<div class="card"><b>${t.msgs}</b><span>رسائل</span></div>` +
        `<div class="card"><b>${t.comments}</b><span>تعليقات</span></div>` +
        `<div class="card"><b>${t.orders}</b><span>أوردرات</span></div>` +
        `<div class="card"><b>${t.tasksDone}</b><span>طابور منجز</span></div>` +
        `<div class="card"><b>${fmtGap(t.avgHandleMs)}</b><span>متوسط المعالجة</span></div>` +
        `<div class="card"><b>${t.violations}</b><span>مخالفات</span></div>` +
        `<div class="card"><b>🟢${t.reviews.good} 🟡${t.reviews.ok} 🔴${t.reviews.bad}</b><span>جودة الردود</span></div>` +
        `</div>` +
        `<div class="ch"><b>الطابور حسب القناة:</b> ${chans}</div>` +
        `<table><thead><tr><th>الموظف</th><th>رسائل</th><th>تعليقات</th><th>أوردرات</th><th>طابور</th><th>متوسط الفجوة</th><th>🟢</th><th>🟡</th><th>🔴</th><th>مخالفات</th><th>نقاط</th></tr></thead><tbody>${body}</tbody></table>` +
        `<div class="foot">صدر ${esc(clockAt(report.generatedAt))} · إدارة Khiam Ops</div></body></html>`,
    );
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 400);
  };

  const t = report?.team;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-5xl bg-ink-850 border border-ink-700 rounded-2xl p-5 max-h-[88vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <div className="font-bold text-white text-lg">📄 تقرير الأداء اليومي</div>
          <div className="flex items-center gap-2">
            <button onClick={printReport} disabled={!report} className="text-sm bg-ink-800 hover:bg-ink-700 border border-ink-700 rounded-lg px-3 py-1.5 text-slate-200 disabled:opacity-50">🖨 طباعة / PDF</button>
            <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none px-2" title="إغلاق">✕</button>
          </div>
        </div>
        <div className="text-xs text-slate-400 mb-3">{dateLabel}</div>

        {loading && <div className="text-slate-400 text-sm py-10 text-center">… بيتجمّع</div>}
        {err && <div className="text-red-400 text-sm py-6 text-center">تعذّر الجلب: {err}</div>}

        {t && (
          <>
            <div className="grid grid-cols-3 md:grid-cols-7 gap-2 mb-4">
              <Card v={`${t.onlineNow}/${t.employees}`} l="متصل الآن" tone="good" />
              <Card v={t.msgs} l="رسائل" />
              <Card v={t.comments} l="تعليقات" />
              <Card v={t.orders} l="أوردرات" />
              <Card v={t.tasksDone} l="طابور منجز" />
              <Card v={fmtGap(t.avgHandleMs)} l="متوسط المعالجة" />
              <Card v={t.violations} l="مخالفات" tone={t.violations > 0 ? "bad" : "neutral"} />
            </div>

            {report && Object.keys(report.byChannel).length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4 text-xs">
                {Object.entries(report.byChannel).map(([k, v]) => (
                  <span key={k} className="bg-ink-900 border border-ink-800 rounded-lg px-3 py-1.5 text-slate-300">
                    {CH_LABEL[k] || k}: <b className="text-amber-400">{v.waiting}</b> منتظر · <b className="text-sky-400">{v.assigned}</b> قيد المعالجة
                  </span>
                ))}
              </div>
            )}

            <div className="overflow-x-auto rounded-lg border border-ink-800">
              <table className="w-full text-sm text-slate-200">
                <thead className="bg-ink-900 text-slate-400 text-xs">
                  <tr>
                    {["الموظف", "الحالة", "رسائل", "تعليقات", "أوردرات", "طابور", "متوسط الفجوة", "🟢", "🟡", "🔴", "مخالفات", "نقاط", ""].map((h) => (
                      <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.employeeId} className="border-t border-ink-800 hover:bg-ink-900/50">
                      <td className="px-3 py-2 font-semibold whitespace-nowrap">
                        <span className="inline-block w-2 h-2 rounded-full ml-2 align-middle" style={{ background: r.online ? "#22c55e" : "#64748b" }} />
                        {r.name}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-400 whitespace-nowrap">{PRESENCE_LABEL[r.shift] || r.shift}</td>
                      <td className="px-3 py-2 text-center">{r.msgs}</td>
                      <td className="px-3 py-2 text-center">{r.comments}</td>
                      <td className="px-3 py-2 text-center">{r.orders}</td>
                      <td className="px-3 py-2 text-center">{r.tasksDone}</td>
                      <td className="px-3 py-2 text-center text-xs">{fmtGap(r.avgGapMs)}</td>
                      <td className="px-3 py-2 text-center text-emerald-400">{r.reviews.good}</td>
                      <td className="px-3 py-2 text-center text-amber-400">{r.reviews.ok}</td>
                      <td className="px-3 py-2 text-center text-red-400">{r.reviews.bad}</td>
                      <td className={`px-3 py-2 text-center ${r.violations > 0 ? "text-red-400 font-bold" : "text-slate-500"}`}>{r.violations}</td>
                      <td className={`px-3 py-2 text-center font-bold ${r.points > 0 ? "text-emerald-400" : r.points < 0 ? "text-red-400" : "text-slate-400"}`}>
                        {r.points >= 0 ? "+" : ""}{r.points}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => sendEmp(r)}
                          disabled={!waNormalize(r.whatsapp)}
                          title={waNormalize(r.whatsapp) ? "إرسال ملخّص للموظف على واتساب" : "لا يوجد رقم واتساب"}
                          className="text-emerald-400 hover:text-emerald-300 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          📱
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-[11px] text-slate-500 mt-3">
              📱 يفتح واتساب برقم الموظف وملخّص يومه جاهز للإرسال. الإرسال التلقائي بالكامل يتفعّل لاحقًا عبر WAHA.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Card({ v, l, tone = "neutral" }: { v: number | string; l: string; tone?: "good" | "warn" | "bad" | "neutral" }) {
  const cls = { good: "text-emerald-400", warn: "text-amber-400", bad: "text-red-400", neutral: "text-slate-100" }[tone];
  return (
    <div className="text-center px-2 py-2 rounded-lg bg-ink-900 border border-ink-800">
      <div className={`text-lg font-extrabold leading-none ${cls}`}>{v}</div>
      <div className="text-[11px] text-slate-500 mt-1 whitespace-nowrap">{l}</div>
    </div>
  );
}
