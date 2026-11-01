import type { Employee, LiveStatus } from "@khiam/shared";
import { PRESENCE_LABEL, STATUS_META, timeAgo } from "../lib/ui";
import { useDash } from "../store";
import type { LeaderboardRow } from "../api";

export default function EmployeeCard({
  emp,
  live,
  row,
}: {
  emp: Employee;
  live?: LiveStatus;
  row?: LeaderboardRow;
}) {
  const select = useDash((s) => s.select);
  const meta = STATUS_META[live?.status ?? "offline"] ?? STATUS_META.offline;
  const problem = meta.tone === "bad" || (meta.tone === "warn" && (live?.presence === "working"));
  const spotlight = live?.spotlight;
  const consent = emp.consentAt != null;

  const ring =
    meta.tone === "bad"
      ? "border-red-500/70 bg-red-500/5"
      : meta.tone === "warn"
        ? "border-amber-500/50 bg-amber-500/5"
        : meta.tone === "good"
          ? "border-ink-700 bg-ink-850"
          : "border-ink-800 bg-ink-900/60";

  return (
    <button
      onClick={() => select(emp.id)}
      className={`text-right rounded-xl border p-3 transition hover:border-brand-400 ${ring} ${
        problem ? "ring-1 ring-red-500/30 scale-[1.01]" : ""
      } ${spotlight ? "pulse-red" : ""}`}
    >
      <div className="flex items-center gap-2.5">
        <div className="relative">
          <div
            className="w-9 h-9 rounded-full grid place-items-center text-white font-bold text-sm"
            style={{ background: emp.avatarColor }}
          >
            {emp.name.charAt(0)}
          </div>
          <span
            className="absolute -bottom-0.5 -left-0.5 w-3.5 h-3.5 rounded-full border-2 border-ink-900"
            style={{ background: meta.dot }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-white text-sm truncate flex items-center gap-1">
            {emp.name}
            {emp.superMonitor && <span title="مراقبة فائقة">🎯</span>}
            {!consent && <span title="لم يوافق على المراقبة بعد" className="text-amber-400">⚠</span>}
          </div>
          <div className="text-xs truncate" style={{ color: meta.dot }}>
            {meta.label}
            {live?.currentConversation ? ` · ${live.currentConversation}` : ""}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5 mt-3 text-center">
        <Mini label="رسائل" value={row?.msgs ?? 0} />
        <Mini label="تعليقات" value={row?.comments ?? 0} />
        <Mini label="أوردرات" value={row?.orders ?? 0} />
      </div>

      <div className="flex items-center justify-between mt-2.5 text-[11px] text-slate-500">
        <span>{PRESENCE_LABEL[live?.presence ?? "not_started"]}</span>
        <span>آخر رد: {timeAgo(live?.lastReplyAt ?? null)}</span>
        <span className={`font-bold ${(row?.points ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
          {(row?.points ?? 0) > 0 ? "+" : ""}
          {row?.points ?? 0}
        </span>
      </div>
    </button>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-ink-900/70 rounded-lg py-1">
      <div className="text-white font-bold text-sm leading-none">{value}</div>
      <div className="text-[10px] text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}
