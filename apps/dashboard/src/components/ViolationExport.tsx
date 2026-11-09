// تصدير مخالفات اليوم لموظف → واتساب (رابط wa.me، بدون حسابات) + طباعة/PDF للإرفاق اليدوي.
// الإرسال التلقائي الكامل (صورة مباشرة في الخلفية) يتفعّل لاحقًا عبر WAHA/Evolution.
import { useMemo } from "react";
import type { Employee, Violation } from "@khiam/shared";
import { clockAt } from "../lib/ui";

const SEV_LABEL: Record<string, string> = { low: "بسيطة", medium: "متوسطة", high: "عالية" };

function esc(s: string): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c));
}

/** تطبيع رقم واتساب لصيغة دولية بدون + (مع معالجة الأرقام المحلية المصرية) */
function waNormalize(raw: string): string {
  let d = (raw || "").replace(/[^0-9]/g, "");
  if (!d) return "";
  if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = "20" + d.slice(1);
  return d;
}

export default function ViolationExport({ emp, violations, onClose }: { emp: Employee; violations: Violation[]; onClose: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const todays = useMemo(
    () => violations.filter((v) => v.employeeId === emp.id && v.at.slice(0, 10) === today).sort((a, b) => a.at.localeCompare(b.at)),
    [violations, emp.id, today],
  );
  const dateLabel = new Date().toLocaleDateString("ar-EG", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const reportText = useMemo(() => {
    const lines = [`📋 تقرير مخالفات — ${emp.name}`, `📅 ${dateLabel}`, `الكود: ${emp.code}`, ""];
    if (todays.length === 0) lines.push("✅ لا مخالفات اليوم. استمر على كده 👏");
    else {
      todays.forEach((v, i) => {
        lines.push(`${i + 1}) ⏰ ${clockAt(v.at)} — ${v.type} (${SEV_LABEL[v.severity] ?? v.severity})`);
        lines.push(`   السبب: ${v.reason}`);
        if (v.link) lines.push(`   الرابط: ${v.link}`);
      });
      lines.push("", `الإجمالي: ${todays.length} مخالفة اليوم.`);
    }
    lines.push("", "— إدارة Khiam Ops");
    return lines.join("\n");
  }, [todays, emp.name, emp.code, dateLabel]);

  const waNumber = waNormalize(emp.whatsapp);

  const openWhatsApp = () => {
    if (!waNumber) return;
    window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(reportText)}`, "_blank", "noopener");
  };

  const printReport = () => {
    const w = window.open("", "_blank", "width=480,height=720");
    if (!w) return;
    const rows =
      todays.length === 0
        ? `<p style="color:#16a34a;font-weight:700">✅ لا مخالفات اليوم.</p>`
        : todays
            .map(
              (v, i) =>
                `<div class="v"><div class="h"><span>${i + 1}. ${esc(v.type)}</span><span class="sev ${esc(v.severity)}">${esc(SEV_LABEL[v.severity] ?? v.severity)}</span><span class="t">${esc(clockAt(v.at))}</span></div><div class="r">${esc(v.reason)}</div>${v.link ? `<div class="l">${esc(v.link)}</div>` : ""}</div>`,
            )
            .join("");
    w.document.write(
      `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>مخالفات ${esc(emp.name)}</title>` +
        `<style>body{font-family:'Segoe UI',Tahoma,sans-serif;padding:24px;color:#111}h1{margin:0 0 4px;font-size:20px}` +
        `.sub{color:#666;font-size:13px;margin-bottom:16px}.v{border:1px solid #eee;border-radius:10px;padding:10px 12px;margin-bottom:8px}` +
        `.h{font-weight:700;display:flex;gap:8px;align-items:center}.t{color:#999;font-size:12px;margin-right:auto}.r{color:#444;font-size:13px;margin-top:4px}` +
        `.l{color:#2563eb;font-size:11px;direction:ltr}.sev{font-size:10px;padding:2px 8px;border-radius:999px}` +
        `.sev.high{background:#fee2e2;color:#b91c1c}.sev.medium{background:#fef3c7;color:#92400e}.sev.low{background:#e5e7eb;color:#374151}` +
        `.foot{margin-top:16px;color:#888;font-size:12px}</style></head>` +
        `<body><h1>📋 تقرير مخالفات — ${esc(emp.name)}</h1><div class="sub">${esc(dateLabel)} · كود ${esc(emp.code)}</div>${rows}` +
        `<div class="foot">الإجمالي: ${todays.length} · إدارة Khiam Ops</div></body></html>`,
    );
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 350);
  };

  // ينشئ صورة PNG للتقرير تلقائيًّا (canvas يتعامل مع العربي صح) ويحمّلها كملف
  const downloadImage = () => {
    const W = 640, padX = 30, lineH = 25;
    const canvas = document.createElement("canvas");
    const mctx = canvas.getContext("2d");
    if (!mctx) return;
    mctx.direction = "rtl"; mctx.textAlign = "right";
    const wrap = (text: string, font: string, maxW: number) => {
      mctx.font = font;
      const words = text.split(" ");
      const out: string[] = []; let cur = "";
      for (const w of words) { const t = cur ? cur + " " + w : w; if (mctx.measureText(t).width > maxW && cur) { out.push(cur); cur = w; } else cur = t; }
      if (cur) out.push(cur);
      return out;
    };
    type Blk = { font?: string; color?: string; text?: string; gap?: number };
    const blocks: Blk[] = [
      { font: "bold 22px 'Segoe UI',Tahoma", color: "#111", text: `📋 تقرير مخالفات — ${emp.name}` },
      { font: "13px 'Segoe UI',Tahoma", color: "#666", text: `${dateLabel} · كود ${emp.code}`, gap: 16 },
    ];
    if (todays.length === 0) blocks.push({ font: "bold 16px 'Segoe UI',Tahoma", color: "#16a34a", text: "✅ لا مخالفات اليوم. استمر على كده 👏" });
    else {
      todays.forEach((v, i) => {
        blocks.push({ font: "bold 15px 'Segoe UI',Tahoma", color: "#111", text: `${i + 1}) ${v.type} — ${SEV_LABEL[v.severity] ?? v.severity} · ${clockAt(v.at)}`, gap: 4 });
        for (const ln of wrap("السبب: " + v.reason, "13px 'Segoe UI',Tahoma", W - padX * 2)) blocks.push({ font: "13px 'Segoe UI',Tahoma", color: "#444", text: ln });
        blocks.push({ gap: 10 });
      });
      blocks.push({ font: "bold 14px 'Segoe UI',Tahoma", color: "#111", text: `الإجمالي: ${todays.length} مخالفة اليوم.`, gap: 8 });
    }
    blocks.push({ font: "12px 'Segoe UI',Tahoma", color: "#888", text: "— إدارة Khiam Ops" });
    let h = 48;
    for (const b of blocks) h += (b.text ? lineH : 0) + (b.gap || 0);
    canvas.width = W; canvas.height = h + 20;
    const ctx = canvas.getContext("2d")!;
    ctx.direction = "rtl"; ctx.textAlign = "right";
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, canvas.height);
    ctx.fillStyle = "#6366f1"; ctx.fillRect(0, 0, W, 6);
    let y = 48;
    for (const b of blocks) {
      if (b.text) { ctx.font = b.font!; ctx.fillStyle = b.color!; ctx.fillText(b.text, W - padX, y); y += lineH; }
      y += b.gap || 0;
    }
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `مخالفات-${emp.name}-${today}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    });
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-ink-850 border border-ink-700 rounded-2xl p-5 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <div className="font-bold text-white">📤 تصدير مخالفات اليوم</div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none px-2" title="إغلاق">✕</button>
        </div>
        <div className="text-xs text-slate-400 mb-2">
          {emp.name} · <span dir="ltr">{emp.whatsapp || "لا يوجد رقم واتساب"}</span> · {todays.length} مخالفة اليوم
        </div>
        <pre className="bg-ink-900 border border-ink-800 rounded-lg p-3 text-xs text-slate-200 whitespace-pre-wrap max-h-60 overflow-y-auto" dir="rtl">
          {reportText}
        </pre>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button
            onClick={openWhatsApp}
            disabled={!waNumber}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg py-2 text-sm font-medium"
          >
            📱 فتح واتساب للموظف
          </button>
          <button onClick={printReport} className="bg-ink-800 hover:bg-ink-700 border border-ink-700 text-slate-200 rounded-lg py-2 text-sm">
            🖨 طباعة / PDF
          </button>
        </div>
        <button onClick={downloadImage} className="w-full mt-2 bg-brand-500 hover:bg-brand-400 text-white rounded-lg py-2 text-sm font-medium">
          🖼 تحميل صورة التقرير (PNG)
        </button>
        <div className="text-[11px] text-slate-500 mt-3">
          يفتح واتساب (ويب/موبايل) برقم الموظف والتقرير جاهز للإرسال. الإرسال التلقائي بالكامل يتفعّل لاحقًا عبر WAHA.
        </div>
      </div>
    </div>
  );
}
