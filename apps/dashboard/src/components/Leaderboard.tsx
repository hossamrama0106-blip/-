import { useShallow } from "zustand/react/shallow";
import { useDash } from "../store";
import { HIGHLIGHT_LABEL, fmtGap } from "../lib/ui";

export default function Leaderboard() {
  const { leaderboard, employees, select } = useDash(useShallow((s) => ({
    leaderboard: s.leaderboard,
    employees: s.employees,
    select: s.select,
  })));
  if (!leaderboard) return null;
  const name = (id: string | null) => employees.find((e) => e.id === id)?.name ?? "—";

  const sorted = [...leaderboard.rows].sort((a, b) => b.points * 10 + b.msgs + b.orders * 3 - (a.points * 10 + a.msgs + a.orders * 3));

  return (
    <div className="bg-ink-900 border border-ink-800 rounded-xl p-4">
      <div className="font-bold text-white mb-3">المقارنة والترتيب</div>

      <div className="flex flex-wrap gap-2 mb-4">
        {Object.entries(leaderboard.highlights).map(([key, id]) => (
          <button
            key={key}
            onClick={() => id && select(id)}
            className="text-xs bg-ink-850 border border-ink-700 rounded-full px-3 py-1.5 hover:border-brand-400 transition"
          >
            <span className="text-slate-400">{HIGHLIGHT_LABEL[key] ?? key}:</span>{" "}
            <span className="text-white font-bold">{name(id)}</span>
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-500 text-xs text-right">
              <th className="py-2 font-medium">#</th>
              <th className="py-2 font-medium">الموظف</th>
              <th className="py-2 font-medium">رسائل</th>
              <th className="py-2 font-medium">تعليقات</th>
              <th className="py-2 font-medium">أوردرات</th>
              <th className="py-2 font-medium">متوسط الرد</th>
              <th className="py-2 font-medium">سرعة</th>
              <th className="py-2 font-medium">نقاط</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr
                key={r.employeeId}
                onClick={() => select(r.employeeId)}
                className="border-t border-ink-800 hover:bg-ink-850 cursor-pointer"
              >
                <td className="py-2 text-slate-500">{i + 1}</td>
                <td className="py-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: r.color }} />
                    <span className="text-white">{r.name}</span>
                    {!r.online && <span className="text-[10px] text-slate-600">غير متصل</span>}
                  </div>
                </td>
                <td className="py-2 text-slate-200">{r.msgs}</td>
                <td className="py-2 text-slate-200">{r.comments}</td>
                <td className="py-2 text-slate-200">{r.orders}</td>
                <td className="py-2 text-slate-400">{fmtGap(r.avgGapMs)}</td>
                <td className="py-2 text-slate-400">{r.typingWpm}</td>
                <td className={`py-2 font-bold ${r.points >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {r.points > 0 ? "+" : ""}
                  {r.points}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
