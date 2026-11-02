import { useEffect, useState } from "react";
import { NotificationType } from "@khiam/shared";
import { useShallow } from "zustand/react/shallow";
import { useDash } from "../store";
import { api } from "../api";
import { PRESENCE_LABEL, STATUS_META, clockAt, fmtGap, timeAgo } from "../lib/ui";

export default function DetailPanel() {
  const { selectedId, employees, live, leaderboard, queue, adminId, select, openLive } = useDash(useShallow((s) => ({
    selectedId: s.selectedId,
    employees: s.employees,
    live: s.live,
    leaderboard: s.leaderboard,
    queue: s.queue,
    adminId: s.adminId,
    select: s.select,
    openLive: s.openLive,
  })));
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [shot, setShot] = useState<{ dataUrl: string; at: string; width: number } | null>(null);
  const [reviews, setReviews] = useState<Array<{ id: string; verdict: string; score: number; aiNotes: string; conversationRef: string; evidenceUrl?: string | null }>>([]);
  const [timeline, setTimeline] = useState<Array<{ id: string; label: string; category: string; at: string }>>([]);
  const [history, setHistory] = useState<Array<{ id: string; url: string; title: string; visitAt: string }>>([]);
  const [vioLink, setVioLink] = useState("");
  const [vioImg, setVioImg] = useState<string | null>(null);

  useEffect(() => {
    setShot(null);
    setReviews([]);
    setTimeline([]);
    setHistory([]);
    setVioLink("");
    setVioImg(null);
    if (selectedId) {
      api.latestScreenshot(selectedId).then(setShot).catch(() => {});
      api.reviewsFor(selectedId).then(setReviews).catch(() => {});
      api.timeline(selectedId).then(setTimeline).catch(() => {});
    }
  }, [selectedId]);

  if (!selectedId) return null;
  const emp = employees.find((e) => e.id === selectedId);
  if (!emp) return null;
  const l = live[emp.id];
  const row = leaderboard?.rows.find((r) => r.employeeId === emp.id);
  const meta = STATUS_META[l?.status ?? "offline"] ?? STATUS_META.offline;
  const queueMine = queue?.perEmployee.find((p) => p.employeeId === emp.id);
  const curTask = queueMine?.current ?? null;
  const CH_LABEL: Record<string, string> = { messenger: "ماسنجر", instagram: "انستجرام", whatsapp: "واتساب", comments: "تعليقات", operix: "أوبريكس" };
  const PR_LABEL: Record<string, string> = { vip: "VIP", high: "مهمة", normal: "عادية" };

  const act = async (key: string, fn: () => Promise<any>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(null);
    }
  };

  const send = (type: string, body: string) =>
    api.sendNotification({ type, from: adminId ?? "admin", to: emp.id, body });

  return (
    <div className="fixed inset-0 z-40 flex" onClick={() => select(null)}>
      <div className="flex-1 bg-black/50" />
      <div
        className="w-full max-w-md bg-ink-900 border-r border-ink-700 h-full overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full grid place-items-center text-white font-bold" style={{ background: emp.avatarColor }}>
              {emp.name.charAt(0)}
            </div>
            <div>
              <div className="font-extrabold text-white text-lg flex items-center gap-2">
                {emp.name} {emp.superMonitor && <span title="مراقبة فائقة">🎯</span>}
              </div>
              <div className="text-sm" style={{ color: meta.dot }}>{meta.label}</div>
            </div>
          </div>
          <button onClick={() => select(null)} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
        </div>

        {/* النشاط الحالي */}
        <div className="mb-3 bg-ink-850 border border-ink-800 rounded-lg px-3 py-2">
          <div className="text-[11px] text-slate-500">النشاط الحالي</div>
          <div className="text-sm text-white">{l?.currentActivity ?? "—"}</div>
        </div>

        {/* الحالة اللحظية */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <Info label="الحضور" value={PRESENCE_LABEL[l?.presence ?? "not_started"]} />
          <Info label="المحادثة الحالية" value={l?.currentConversation ?? "—"} />
          <Info label="آخر رد" value={timeAgo(l?.lastReplyAt ?? null)} />
          <Info label="آخر رسالة فتحها" value={timeAgo(l?.lastOpenedMsgAt ?? null)} />
          <Info label="النافذة الحالية" value={l?.currentWindow ?? "—"} />
          <Info label="سرعة الكتابة" value={`${l?.typingWpm ?? 0} ك/د`} />
        </div>

        {/* العدّادات */}
        <div className="grid grid-cols-4 gap-2 mb-5">
          <Counter label="رسائل" value={row?.msgs ?? 0} />
          <Counter label="تعليقات" value={row?.comments ?? 0} />
          <Counter label="أوردرات" value={row?.orders ?? 0} />
          <Counter label="نقاط" value={row?.points ?? 0} accent={(row?.points ?? 0) >= 0 ? "good" : "bad"} />
        </div>
        <div className="grid grid-cols-2 gap-2 mb-5 text-sm">
          <Info label="متوسط الفجوة بين الردود" value={fmtGap(row?.avgGapMs ?? null)} />
          <Info label="فتح ولم يرد" value={String(row?.openNoReply ?? 0)} />
        </div>

        {/* مهمة الطابور الحالية */}
        <Section title={`مهمة الطابور · منجز اليوم: ${queueMine?.doneToday ?? 0}`}>
          {curTask ? (
            <div className="bg-ink-850 border border-ink-800 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-bold text-white">{curTask.customerRef}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-ink-700 bg-ink-800 text-slate-300">{PR_LABEL[curTask.priority]}</span>
                <span className="text-[10px] text-slate-500">{CH_LABEL[curTask.channel] ?? curTask.channel}</span>
                <span className="text-[10px] text-amber-400 mr-auto">منذ {timeAgo(curTask.assignedAt)}</span>
              </div>
              <div className="text-xs text-slate-300 mb-2">{curTask.preview || "—"}</div>
              <div className="grid grid-cols-2 gap-2">
                <ActBtn label="⏭ أسند التالي" onClick={() => act("qnext", () => api.queueNext(emp.id))} />
                <ActBtn label="↩ تحرير المهمة" tone="bad" onClick={() => act("qrel", () => api.skipTask(curTask.id, "تحرير من الإدارة"))} />
              </div>
            </div>
          ) : (
            <div className="bg-ink-850 border border-ink-800 rounded-lg p-3 flex items-center justify-between">
              <span className="text-xs text-slate-500">لا توجد مهمة مُسنَدة.</span>
              <ActBtn label="⏭ أسند التالي" onClick={() => act("qnext", () => api.queueNext(emp.id))} />
            </div>
          )}
        </Section>

        {/* أدوات الرقابة */}
        <Section title="الرقابة">
          <div className="grid grid-cols-2 gap-2">
            <Toggle
              on={!!l?.liveWatching}
              busy={busy === "live"}
              onLabel="إيقاف لايف شبح"
              offLabel="لايف (مراقبة)"
              onClick={() => act("live", () => api.setFlags(emp.id, { liveWatching: !l?.liveWatching }))}
            />
            <Toggle
              on={!!l?.spotlight}
              busy={busy === "spot"}
              onLabel="إطفاء عين الرقابة"
              offLabel="عين الرقابة (علني)"
              danger
              onClick={() => act("spot", () => api.setFlags(emp.id, { spotlight: !l?.spotlight }))}
            />
            <Toggle
              on={emp.superMonitor}
              busy={busy === "super"}
              onLabel="إيقاف مراقبة فائقة"
              offLabel="مراقبة فائقة"
              onClick={() => act("super", () => api.setFlags(emp.id, { superMonitor: !emp.superMonitor }))}
            />
            <button
              disabled={busy === "active"}
              onClick={() => act("active", () => api.updateEmployee(emp.id, { active: !emp.active }))}
              className="text-sm rounded-lg py-2 px-3 bg-ink-800 hover:bg-ink-700 border border-ink-700 text-slate-200"
            >
              {emp.active ? "تعطيل الحساب" : "تفعيل الحساب"}
            </button>
          </div>
        </Section>

        {/* رقابة متقدمة: لايف + هيستوري */}
        <Section title="رقابة متقدمة">
          <div className="grid grid-cols-2 gap-2">
            <ActBtn label="🔴 فتح اللايف" onClick={() => { api.setFlags(emp.id, { liveWatching: true }).catch(() => {}); openLive(emp.id); }} />
            <ActBtn label="⬇ اسحب الهيستوري" onClick={() => act("hist", async () => { await api.queueCommand(emp.id, "pull_history"); setTimeout(() => api.history(emp.id).then(setHistory).catch(() => {}), 4000); })} />
          </div>
          {history.length > 0 && (
            <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
              {history.slice(0, 20).map((h) => (
                <div key={h.id} className="text-[11px] bg-ink-850 border border-ink-800 rounded px-2 py-1">
                  <div className="text-slate-200 truncate">{h.title || h.url}</div>
                  <div className="text-slate-500 truncate" dir="ltr">{h.url}</div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* الخط الزمني للنشاط (كل خطوة محفوظة) */}
        <Section title="الخط الزمني (كل خطوة)">
          {timeline.length === 0 ? (
            <div className="text-xs text-slate-500">لا يوجد نشاط مسجّل بعد.</div>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-1">
              {timeline.slice(0, 25).map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-xs">
                  <span className="text-[10px] text-slate-500 w-12 shrink-0">{clockAt(t.at)}</span>
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.category === "work" ? "bg-emerald-500" : t.category === "other" ? "bg-slate-500" : "bg-red-500"}`} />
                  <span className="text-slate-200 truncate">{t.label}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* تقييم الردود بالذكاء الاصطناعي */}
        <Section title="تقييم الردود (AI)">
          {reviews.length === 0 ? (
            <div className="text-xs text-slate-500">لا توجد تقييمات بعد.</div>
          ) : (
            <div className="space-y-1.5">
              {reviews.slice(0, 6).map((r) => (
                <div key={r.id} className="flex items-start gap-2 bg-ink-850 border border-ink-800 rounded-lg p-2">
                  <span className="text-sm leading-5">{r.verdict === "good" ? "🟢" : r.verdict === "ok" ? "🟡" : "🔴"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-200">{r.aiNotes}</div>
                    <div className="text-[10px] text-slate-500 truncate">{r.conversationRef} · {r.score}/100</div>
                    {r.evidenceUrl && <img src={r.evidenceUrl} alt="دليل" className="mt-1 h-16 rounded border border-ink-800" />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* آخر لقطة شاشة */}
        <Section title="آخر لقطة شاشة">
          {shot ? (
            <img src={shot.dataUrl} alt="لقطة شاشة" style={{ width: "100%", borderRadius: 8, border: "1px solid #273243" }} />
          ) : (
            <div className="text-xs text-slate-500">لا توجد لقطة محفوظة. تظهر هنا عند تفعيل "لايف" مع برنامج الويندوز (بموافقة).</div>
          )}
        </Section>

        {/* إشعارات ورسائل */}
        <Section title="إرسال للموظف">
          <input
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            placeholder="اكتب رسالة/إشعار…"
            className="w-full bg-ink-850 border border-ink-700 rounded-lg px-3 py-2 text-white text-sm mb-2 outline-none focus:border-brand-400"
          />
          <div className="grid grid-cols-3 gap-2">
            <ActBtn label="إشعار عادي" onClick={() => act("notice", async () => { await send(NotificationType.NOTICE, msg || "انتبه من فضلك"); setMsg(""); })} />
            <ActBtn label="رسالة للرد" onClick={() => act("message", async () => { await send(NotificationType.MESSAGE, msg || "محتاج ردك"); setMsg(""); })} />
            <ActBtn label="تنبيه صوتي" onClick={() => act("audio", () => send(NotificationType.BROADCAST_AUDIO, "🔊 بث صوتي"))} />
          </div>
        </Section>

        {/* المخالفات والنقاط */}
        <Section title="تقييم ومخالفات">
          <div className="grid grid-cols-2 gap-2">
            <ActBtn label="➕ نقطة خضراء" tone="good" onClick={() => act("plus", () => api.addPoint({ employeeId: emp.id, delta: 1, reason: "تقييم إداري" }))} />
            <ActBtn label="➖ نقطة حمراء" tone="bad" onClick={() => act("minus", () => api.addPoint({ employeeId: emp.id, delta: -1, reason: "تقييم إداري" }))} />
          </div>
          <input
            value={vioLink}
            onChange={(e) => setVioLink(e.target.value)}
            dir="ltr"
            placeholder="رابط المحادثة/البوست (اختياري)"
            className="w-full mt-2 bg-ink-850 border border-ink-700 rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-brand-400"
          />
          <label className="block mt-2 text-xs text-slate-400 cursor-pointer bg-ink-850 border border-ink-700 rounded-lg px-3 py-2">
            {vioImg ? "✓ صورة مرفقة (اضغط لتغييرها)" : "📎 إرفاق صورة/دليل (اختياري)"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  const rd = new FileReader();
                  rd.onload = () => setVioImg(String(rd.result));
                  rd.readAsDataURL(f);
                }
              }}
            />
          </label>
          <ActBtn
            full
            tone="bad"
            label="تسجيل مخالفة"
            onClick={() =>
              act("vio", async () => {
                await api.addViolation({ employeeId: emp.id, type: "مخالفة إدارية", severity: "medium", reason: msg || "مخالفة مسجّلة من الإدارة", link: vioLink || undefined, imageUrl: vioImg || undefined });
                setVioLink("");
                setVioImg(null);
                setMsg("");
              })
            }
          />
          <div className="text-[11px] text-slate-500 mt-2">
            بدأ الشيفت: {clockAt(l?.lastReplyAt ?? null) === "—" ? "—" : "اليوم"} · الواتساب: <span dir="ltr">{emp.whatsapp}</span>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wide">{title}</div>
      {children}
    </div>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-ink-850 border border-ink-800 rounded-lg px-3 py-2">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-sm text-slate-100 truncate">{value}</div>
    </div>
  );
}
function Counter({ label, value, accent = "neutral" }: { label: string; value: number; accent?: "good" | "bad" | "neutral" }) {
  const cls = accent === "good" ? "text-emerald-400" : accent === "bad" ? "text-red-400" : "text-white";
  return (
    <div className="bg-ink-850 border border-ink-800 rounded-lg py-2 text-center">
      <div className={`text-lg font-extrabold leading-none ${cls}`}>{value}</div>
      <div className="text-[10px] text-slate-500 mt-1">{label}</div>
    </div>
  );
}
function Toggle({ on, busy, onLabel, offLabel, onClick, danger }: { on: boolean; busy: boolean; onLabel: string; offLabel: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      disabled={busy}
      onClick={onClick}
      className={`text-sm rounded-lg py-2 px-3 border transition disabled:opacity-60 ${
        on
          ? danger
            ? "bg-red-500/20 border-red-500 text-red-300"
            : "bg-brand-500/20 border-brand-400 text-brand-400"
          : "bg-ink-800 hover:bg-ink-700 border-ink-700 text-slate-200"
      }`}
    >
      {on ? onLabel : offLabel}
    </button>
  );
}
function ActBtn({ label, onClick, tone = "neutral", full, }: { label: string; onClick: () => void; tone?: "good" | "bad" | "neutral"; full?: boolean }) {
  const cls =
    tone === "good"
      ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/25"
      : tone === "bad"
        ? "bg-red-500/15 border-red-500/50 text-red-300 hover:bg-red-500/25"
        : "bg-ink-800 hover:bg-ink-700 border-ink-700 text-slate-200";
  return (
    <button onClick={onClick} className={`text-sm rounded-lg py-2 px-3 border transition ${cls} ${full ? "w-full mt-2" : ""}`}>
      {label}
    </button>
  );
}
