// رسوم SVG خفيفة بدون أي مكتبات — مساحة (سلسلة زمنية) + دونات + أعمدة
import type { MetricPoint } from "../api";

/** مفاتيح رقمية في MetricPoint صالحة للرسم */
export type NumKey = "unread" | "comments" | "queueWaiting" | "queueAssigned" | "queueDone" | "online";
export interface SeriesKey {
  key: NumKey;
  label: string;
  color: string;
}

/** رسم مساحة/خطوط متعدد السلاسل فوق بعضه (قديم→حديث يسار→يمين) */
export function AreaChart({ series, keys, height = 170 }: { series: MetricPoint[]; keys: SeriesKey[]; height?: number }) {
  const W = 600;
  const H = height;
  const padX = 6;
  const padT = 10;
  const padB = 16;
  const n = series.length;

  let max = 1;
  for (const p of series) {
    for (const k of keys) {
      const v = Number(p[k.key] ?? 0);
      if (v > max) max = v;
    }
  }

  const x = (i: number) => padX + (n <= 1 ? 0 : (i / (n - 1)) * (W - padX * 2));
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  const line = (k: NumKey) => series.map((p, i) => `${x(i).toFixed(1)},${y(Number(p[k] ?? 0)).toFixed(1)}`).join(" ");
  const area = (k: NumKey) => `${x(0).toFixed(1)},${(H - padB).toFixed(1)} ${line(k)} ${x(n - 1).toFixed(1)},${(H - padB).toFixed(1)}`;

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <line x1={padX} y1={H - padB} x2={W - padX} y2={H - padB} stroke="#273243" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      {keys.map((k) => (
        <g key={k.key}>
          <polygon points={area(k.key)} fill={k.color} opacity={0.12} />
          <polyline
            points={line(k.key)}
            fill="none"
            stroke={k.color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      ))}
    </svg>
  );
}

/** دونات لتوزيع قيم (مثال: جودة الردود 🟢🟡🔴) */
export function Donut({ segments, size = 150, thickness = 22 }: { segments: { label: string; value: number; color: string }[]; size?: number; thickness?: number }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;
  const cx = size / 2;
  const cy = size / 2;
  let offset = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1b2432" strokeWidth={thickness} />
      {total > 0 &&
        segments.map((s, i) => {
          const dash = (s.value / total) * C;
          const el = (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${dash.toFixed(2)} ${(C - dash).toFixed(2)}`}
              strokeDashoffset={(-offset).toFixed(2)}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          );
          offset += dash;
          return el;
        })}
      <text x={cx} y={cy - 1} textAnchor="middle" fill="#ffffff" fontSize="26" fontWeight="800">
        {total}
      </text>
      <text x={cx} y={cy + 18} textAnchor="middle" fill="#64748b" fontSize="11">
        تقييم
      </text>
    </svg>
  );
}

/** أعمدة رأسية (مثال: لقطة الطابور الآن) */
export function Bars({ items, height = 150 }: { items: { label: string; value: number; color: string }[]; height?: number }) {
  const n = items.length || 1;
  const max = Math.max(1, ...items.map((i) => i.value));
  const W = 300;
  const H = height;
  const padB = 24;
  const padT = 18;
  const slot = W / n;
  const bw = slot * 0.5;

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      {items.map((it, i) => {
        const cx = (i + 0.5) * slot;
        const bh = (it.value / max) * (H - padB - padT);
        const yTop = H - padB - bh;
        return (
          <g key={i}>
            <rect x={cx - bw / 2} y={yTop} width={bw} height={Math.max(bh, 1)} rx={4} fill={it.color} />
            <text x={cx} y={yTop - 5} textAnchor="middle" fill="#ffffff" fontSize="14" fontWeight="700">
              {it.value}
            </text>
            <text x={cx} y={H - 7} textAnchor="middle" fill="#94a3b8" fontSize="11">
              {it.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
