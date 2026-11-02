// المخزن المحلي في الذاكرة — يحاكي Supabase (سجلات) + Upstash (حالة لحظية).
// كل تغيير يبثّ حدث realtime عبر hub. لاحقاً تُستبدل هذه الطبقة بموصلات حقيقية بنفس الواجهة.
import {
  ActivityType,
  BreakType,
  Channel,
  EmployeeStatus,
  NotificationType,
  PresenceState,
  QueuePriority,
  QueueStatus,
  RealtimeEvent,
  Role,
  seedEmployees,
  Thresholds,
  ViolationSeverity,
  type ActivityEvent,
  type Alert,
  type BreakEntry,
  type ChatMessage,
  type CountersDaily,
  type Employee,
  type InboxSnapshot,
  type LiveStatus,
  type MetricPoint,
  type NotificationItem,
  type PointEntry,
  type HistoryItem,
  type QueueTask,
  type ReplyReview,
  type Screenshot,
  type ShiftSession,
  type TimelineEvent,
  type Violation,
} from "@khiam/shared";
import { hub } from "./realtime";
import { notifyNtfy, pushViolationToSheet } from "./integrations";

interface Config {
  googleSheetWebhook: string;
  ntfyTopic: string;
  queueStrict: boolean; // طابور ميتا الإجباري: إسناد تلقائي ومنع اختيار العملاء يدويًا
}

/** ترتيب أولوية الطابور: vip أولاً ثم high ثم normal، وداخل كل مستوى الأقدم أولاً (FIFO) */
const PRIORITY_RANK: Record<string, number> = { vip: 0, high: 1, normal: 2 };

function categoryOf(title: string): string {
  const t = (title || "").toLowerCase();
  if (/(business\.facebook|whatsapp|operix|instagram\/direct|meta business|الوارد|محادثة|تعليق)/.test(t)) return "work";
  if (/(youtube|tiktok|twitter|x\.com|snapchat|reddit|facebook|instagram)/.test(t)) return "social";
  if (/(game|لعب|steam|valorant|cs2|pubg|league|minecraft|roblox|poki)/.test(t)) return "games";
  if (/(netflix|shahid|movie|film|مسلسل|فيلم|anime|spotify)/.test(t)) return "entertainment";
  return "other";
}

function describeActivity(l: LiveStatus): string {
  if (l.metaFocused === false) return `خارج العمل: ${l.currentWindow || "تبويب آخر"}`;
  if (l.typing && l.currentConversation) return `يكتب الآن في محادثة ${l.currentConversation}`;
  if (l.currentConversation) return `في محادثة ${l.currentConversation}`;
  if (l.typing) return "يكتب الآن";
  return l.currentWindow ? `في: ${l.currentWindow}` : "—";
}

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}`;
const nowIso = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);

function freshLive(employeeId: string): LiveStatus {
  return {
    employeeId,
    status: EmployeeStatus.OFFLINE,
    presence: PresenceState.NOT_STARTED,
    online: false,
    typing: false,
    typingWpm: 0,
    lastHeartbeatAt: 0,
    lastMouseMoveAt: null,
    lastReplyAt: null,
    lastOpenedMsgAt: null,
    currentWindow: null,
    currentConversation: null,
    currentActivity: null,
    metaFocused: true,
    extensionConnected: false,
    agentConnected: false,
    liveWatching: false,
    spotlight: false,
    superMonitor: false,
  };
}

class Store {
  employees: Employee[] = [];
  live = new Map<string, LiveStatus>();
  shifts: ShiftSession[] = [];
  breaks: BreakEntry[] = [];
  activities: ActivityEvent[] = [];
  counters = new Map<string, CountersDaily>(); // key: `${employeeId}:${date}`
  private openNoReplyTimes = new Map<string, number[]>(); // لكاشف التهرب من العملاء
  reviews: ReplyReview[] = [];
  points: PointEntry[] = [];
  violations: Violation[] = [];
  notifications: NotificationItem[] = [];
  chat: ChatMessage[] = [];
  alerts: Alert[] = [];
  screenshots: Screenshot[] = [];
  nightMode = false;
  timeline: TimelineEvent[] = [];
  history: HistoryItem[] = [];
  queue: QueueTask[] = []; // طابور ميتا الإجباري
  metrics: MetricPoint[] = []; // سلسلة زمنية لمؤشرات KPI
  private commands = new Map<string, string[]>();
  config: Config = {
    googleSheetWebhook: process.env.GOOGLE_SHEET_WEBHOOK || "",
    ntfyTopic: process.env.NTFY_TOPIC || "",
    queueStrict: process.env.QUEUE_STRICT !== "0",
  };
  inbox: InboxSnapshot = { unreadMessages: 0, unreadComments: 0, at: nowIso() };

  constructor() {
    this.employees = seedEmployees();
    for (const e of this.employees) this.live.set(e.id, freshLive(e.id));
  }

  // ---------- helpers ----------
  private counterKey(employeeId: string, date = today()) {
    return `${employeeId}:${date}`;
  }
  getCounters(employeeId: string, date = today()): CountersDaily {
    const key = this.counterKey(employeeId, date);
    let c = this.counters.get(key);
    if (!c) {
      c = {
        employeeId,
        date,
        msgs: 0,
        comments: 0,
        orders: 0,
        openNoReply: 0,
        tasksDone: 0,
        avgGapMs: null,
        typingWpm: null,
        activeMs: 0,
      };
      this.counters.set(key, c);
    }
    return c;
  }
  getLive(employeeId: string): LiveStatus {
    let l = this.live.get(employeeId);
    if (!l) {
      l = freshLive(employeeId);
      this.live.set(employeeId, l);
    }
    return l;
  }
  findEmployee(id: string) {
    return this.employees.find((e) => e.id === id) ?? null;
  }
  findByCode(code: string) {
    return this.employees.find((e) => e.code.toUpperCase() === code.toUpperCase()) ?? null;
  }

  // ---------- employees ----------
  addEmployee(input: { code: string; name: string; whatsapp: string; role?: string }): Employee {
    const emp: Employee = {
      id: uid("emp"),
      code: input.code,
      name: input.name,
      whatsapp: input.whatsapp,
      role: (input.role as Employee["role"]) ?? Role.EMPLOYEE,
      active: true,
      superMonitor: false,
      consentAt: null,
      avatarColor: `hsl(${Math.floor(Math.random() * 360)} 70% 55%)`,
      createdAt: nowIso(),
    };
    this.employees.push(emp);
    this.live.set(emp.id, freshLive(emp.id));
    hub.broadcast(RealtimeEvent.EMPLOYEE_UPSERT, emp);
    return emp;
  }
  updateEmployee(id: string, patch: Partial<Employee>): Employee | null {
    const emp = this.findEmployee(id);
    if (!emp) return null;
    Object.assign(emp, patch, { id: emp.id, createdAt: emp.createdAt });
    hub.broadcast(RealtimeEvent.EMPLOYEE_UPSERT, emp);
    return emp;
  }
  removeEmployee(id: string): boolean {
    const i = this.employees.findIndex((e) => e.id === id);
    if (i < 0) return false;
    this.releaseEmployeeTasks(id); // رجّع محادثاته للطابور قبل الحذف
    this.employees.splice(i, 1);
    this.live.delete(id);
    hub.broadcast(RealtimeEvent.EMPLOYEE_REMOVED, { id });
    return true;
  }
  setConsent(id: string): Employee | null {
    return this.updateEmployee(id, { consentAt: nowIso() });
  }

  // ---------- presence / heartbeat ----------
  heartbeat(
    employeeId: string,
    patch: Partial<LiveStatus> & { mouseMoved?: boolean; clientTime?: number },
  ): LiveStatus {
    const l = this.getLive(employeeId);
    const now = Date.now();
    l.lastHeartbeatAt = now;
    l.online = true;
    if (patch.extensionConnected !== undefined) l.extensionConnected = patch.extensionConnected;
    if (patch.agentConnected !== undefined) l.agentConnected = patch.agentConnected;
    if (patch.typing !== undefined) l.typing = patch.typing;
    if (patch.typingWpm !== undefined) l.typingWpm = patch.typingWpm;
    if (patch.metaFocused !== undefined) l.metaFocused = patch.metaFocused;
    if (patch.currentConversation !== undefined) l.currentConversation = patch.currentConversation;
    if (patch.mouseMoved) l.lastMouseMoveAt = now;

    // تغيّر النافذة/التبويب → سجّله في الخط الزمني (كل خطوة محفوظة)
    if (patch.currentWindow !== undefined && patch.currentWindow !== l.currentWindow) {
      const w = patch.currentWindow || "";
      l.currentWindow = w;
      if (w) this.addTimeline(employeeId, "window", `فتح: ${w}`, categoryOf(w));
    }

    if (patch.status) l.status = patch.status;
    else l.status = this.deriveStatus(l);

    l.currentActivity = describeActivity(l);

    // كشف التلاعب بساعة الجهاز (نعتمد توقيت السيرفر دائماً)
    if (
      patch.clientTime &&
      Math.abs(now - patch.clientTime) > 2 * 60 * 1000 &&
      !this.recentViolation(employeeId, "تلاعب بساعة الجهاز", 30 * 60 * 1000)
    ) {
      this.addViolation({
        employeeId,
        type: "تلاعب بساعة الجهاز",
        severity: ViolationSeverity.MEDIUM,
        reason: `فرق توقيت جهاز الموظف ${Math.round(Math.abs(now - patch.clientTime) / 60000)} دقيقة عن السيرفر`,
      });
    }

    hub.broadcast(RealtimeEvent.STATUS_CHANGED, l);
    return l;
  }

  /** اشتقاق الحالة من الإشارات المتاحة */
  private deriveStatus(l: LiveStatus): EmployeeStatus {
    if (!l.extensionConnected && !l.agentConnected) return EmployeeStatus.AGENT_DISCONNECTED;
    if (l.typing) return EmployeeStatus.TYPING;
    const w = (l.currentWindow ?? "").toLowerCase();
    if (/(youtube|facebook\.com\/(?!.*business)|tiktok|twitter|x\.com|instagram\.com\/(?!direct))/.test(w))
      return EmployeeStatus.SOCIAL;
    if (/(game|لعب|steam|miniclip|poki)/.test(w)) return EmployeeStatus.GAMES;
    if (l.currentConversation) return EmployeeStatus.IN_CONVERSATION;
    if (w.includes("comment") || w.includes("تعليق")) return EmployeeStatus.COMMENTS_PAGE;
    return EmployeeStatus.ONLINE;
  }

  setLiveFlags(employeeId: string, patch: Partial<Pick<LiveStatus, "liveWatching" | "spotlight" | "superMonitor">>): LiveStatus {
    const l = this.getLive(employeeId);
    Object.assign(l, patch);
    hub.broadcast(RealtimeEvent.STATUS_CHANGED, l);
    return l;
  }

  // ---------- shifts / breaks ----------
  startShift(employeeId: string): ShiftSession {
    const s: ShiftSession = {
      id: uid("shift"),
      employeeId,
      startedAt: nowIso(),
      firstMsgAt: null,
      endedAt: null,
      handoverNotes: null,
    };
    this.shifts.push(s);
    const l = this.getLive(employeeId);
    l.presence = PresenceState.WORKING;
    l.online = true;
    hub.broadcast(RealtimeEvent.SHIFT_EVENT, { kind: "start", session: s });
    this.announceTeam(employeeId, "بدأ الشيفت");
    hub.broadcast(RealtimeEvent.STATUS_CHANGED, l);
    if (this.config.queueStrict) this.assignNext(employeeId); // استلام أول محادثة تلقائيًا
    return s;
  }
  endShift(employeeId: string, handoverNotes: string | null): ShiftSession | null {
    const s = [...this.shifts].reverse().find((x) => x.employeeId === employeeId && !x.endedAt);
    if (!s) return null;
    s.endedAt = nowIso();
    s.handoverNotes = handoverNotes;
    const l = this.getLive(employeeId);
    l.presence = PresenceState.SHIFT_ENDED;
    this.releaseEmployeeTasks(employeeId); // رجّع محادثاته للطابور
    hub.broadcast(RealtimeEvent.SHIFT_EVENT, { kind: "end", session: s });
    this.announceTeam(employeeId, "أنهى الشيفت");
    hub.broadcast(RealtimeEvent.STATUS_CHANGED, l);
    return s;
  }
  startBreak(employeeId: string, type: string): BreakEntry {
    const b: BreakEntry = {
      id: uid("break"),
      employeeId,
      type: (type as BreakEntry["type"]) ?? BreakType.BREAK,
      startedAt: nowIso(),
      endedAt: null,
    };
    this.breaks.push(b);
    const l = this.getLive(employeeId);
    l.presence =
      type === BreakType.PRAYER
        ? PresenceState.PRAYER
        : type === BreakType.WC
          ? PresenceState.WC
          : PresenceState.BREAK;
    this.releaseEmployeeTasks(employeeId); // رجّع محادثته للطابور أثناء البريك
    hub.broadcast(RealtimeEvent.SHIFT_EVENT, { kind: "break_start", break: b });
    this.announceTeam(employeeId, type === BreakType.PRAYER ? "في استراحة صلاة" : type === BreakType.WC ? "في الحمام" : "في بريك");
    hub.broadcast(RealtimeEvent.STATUS_CHANGED, l);
    return b;
  }
  endBreak(employeeId: string): BreakEntry | null {
    const b = [...this.breaks].reverse().find((x) => x.employeeId === employeeId && !x.endedAt);
    if (!b) return null;
    b.endedAt = nowIso();
    const l = this.getLive(employeeId);
    l.presence = PresenceState.WORKING;
    hub.broadcast(RealtimeEvent.SHIFT_EVENT, { kind: "break_end", break: b });
    hub.broadcast(RealtimeEvent.STATUS_CHANGED, l);
    if (this.config.queueStrict) this.assignNext(employeeId); // استلام محادثة بعد البريك
    return b;
  }

  // ---------- activity / counters ----------
  addActivity(input: { employeeId: string; type: string; channel: string; ref?: string | null }): ActivityEvent {
    const ev: ActivityEvent = {
      id: uid("act"),
      employeeId: input.employeeId,
      type: input.type as ActivityEvent["type"],
      channel: input.channel as ActivityEvent["channel"],
      ref: input.ref ?? null,
      at: nowIso(),
    };
    this.activities.push(ev);
    const c = this.getCounters(input.employeeId);
    const l = this.getLive(input.employeeId);

    if (ev.type === ActivityType.REPLY) {
      c.msgs += 1;
      // متوسط الفجوة بين الردود
      if (l.lastReplyAt) {
        const gap = Date.now() - l.lastReplyAt;
        c.avgGapMs = c.avgGapMs == null ? gap : Math.round(c.avgGapMs * 0.7 + gap * 0.3);
      }
      l.lastReplyAt = Date.now();
      // أول رسالة في الشيفت
      const s = [...this.shifts].reverse().find((x) => x.employeeId === input.employeeId && !x.endedAt);
      if (s && !s.firstMsgAt) s.firstMsgAt = nowIso();
    } else if (ev.type === ActivityType.COMMENT) {
      c.comments += 1;
    } else if (ev.type === ActivityType.ORDER) {
      c.orders += 1;
    } else if (ev.type === ActivityType.OPEN_NO_REPLY) {
      c.openNoReply += 1;
      // كاشف "التهرب من عميل": فتح وقرأ وخرج بدون رد عدة مرات خلال نافذة قصيرة
      const arr = (this.openNoReplyTimes.get(input.employeeId) ?? []).filter((t) => Date.now() - t < 10 * 60 * 1000);
      arr.push(Date.now());
      this.openNoReplyTimes.set(input.employeeId, arr);
      if (arr.length >= Thresholds.CHERRY_PICK_LIMIT && !this.recentViolation(input.employeeId, "تهرب من عميل")) {
        this.addViolation({ employeeId: input.employeeId, type: "تهرب من عميل", severity: ViolationSeverity.MEDIUM, reason: `فتح ${arr.length} محادثات وخرج بدون رد خلال 10 دقائق` });
        this.raiseAlert({ employeeId: input.employeeId, kind: "cherry_pick", severity: ViolationSeverity.MEDIUM, message: "تهرب من عميل — فتح وقرأ وخرج بدون رد" });
      }
    }

    hub.broadcast(RealtimeEvent.ACTIVITY, ev);
    hub.broadcast(RealtimeEvent.COUNTERS_UPDATED, c);
    return ev;
  }

  allCounters(date = today()): CountersDaily[] {
    return this.employees.map((e) => this.getCounters(e.id, date));
  }

  /** لوحة الترتيب والمقارنة */
  leaderboard(date = today()) {
    const rows = this.employees.map((e) => {
      const c = this.getCounters(e.id, date);
      const pts = this.points
        .filter((p) => p.employeeId === e.id)
        .reduce((a, p) => a + p.delta, 0);
      const l = this.getLive(e.id);
      return {
        employeeId: e.id,
        name: e.name,
        color: e.avatarColor,
        msgs: c.msgs,
        comments: c.comments,
        orders: c.orders,
        openNoReply: c.openNoReply,
        avgGapMs: c.avgGapMs,
        typingWpm: l.typingWpm || c.typingWpm || 0,
        points: pts,
        tasksDone: this.tasksDoneToday(e.id),
        online: l.online,
        status: l.status,
      };
    });
    const by = <T>(arr: T[], fn: (t: T) => number, dir: 1 | -1 = -1) =>
      [...arr].sort((a, b) => (fn(a) - fn(b)) * dir)[0];
    return {
      rows,
      highlights: {
        fastest: by(rows.filter((r) => r.avgGapMs != null), (r) => r.avgGapMs ?? Infinity, 1)?.employeeId ?? null,
        mostReplies: by(rows, (r) => r.msgs)?.employeeId ?? null,
        mostOrders: by(rows, (r) => r.orders)?.employeeId ?? null,
        mostTasks: by(rows, (r) => r.tasksDone)?.employeeId ?? null,
        slowest: by(rows.filter((r) => r.avgGapMs != null), (r) => r.avgGapMs ?? -1)?.employeeId ?? null,
        fewestReplies: by(rows, (r) => r.msgs, 1)?.employeeId ?? null,
        bestOverall: by(rows, (r) => r.points * 10 + r.msgs + r.orders * 3)?.employeeId ?? null,
        worstOverall: by(rows, (r) => r.points * 10 + r.msgs + r.orders * 3, 1)?.employeeId ?? null,
      },
    };
  }

  // ---------- reviews / points ----------
  addReview(input: { employeeId: string; conversationRef: string; verdict: string; score: number; aiNotes: string; sampleText: string; evidenceUrl?: string | null }): ReplyReview {
    const r: ReplyReview = {
      id: uid("rev"),
      employeeId: input.employeeId,
      conversationRef: input.conversationRef,
      verdict: input.verdict as ReplyReview["verdict"],
      score: input.score,
      aiNotes: input.aiNotes,
      sampleText: input.sampleText,
      evidenceUrl: input.evidenceUrl ?? null,
      at: nowIso(),
      approvedBy: null,
    };
    this.reviews.push(r);
    // نقطة تلقائية حسب التقييم
    const delta = input.verdict === "bad" ? -1 : 1;
    this.addPoint({ employeeId: input.employeeId, delta, reason: `تقييم AI: ${input.verdict}`, source: "ai" });
    return r;
  }
  addPoint(input: { employeeId: string; delta: number; reason: string; source: "ai" | "manual" }): PointEntry {
    const p: PointEntry = { id: uid("pt"), ...input, at: nowIso() };
    this.points.push(p);
    hub.broadcast(RealtimeEvent.COUNTERS_UPDATED, this.getCounters(input.employeeId));
    return p;
  }

  // ---------- violations ----------
  addViolation(input: { employeeId: string; type: string; severity?: string; reason: string; screenshotUrl?: string | null; imageUrl?: string | null; link?: string | null }): Violation {
    const v: Violation = {
      id: uid("vio"),
      employeeId: input.employeeId,
      type: input.type,
      severity: (input.severity as Violation["severity"]) ?? ViolationSeverity.MEDIUM,
      reason: input.reason,
      screenshotUrl: input.screenshotUrl ?? null,
      imageUrl: input.imageUrl ?? null,
      link: input.link ?? null,
      at: nowIso(),
      acknowledgedAt: null,
      reply: null,
    };
    this.violations.push(v);
    hub.broadcast(RealtimeEvent.VIOLATION, v);
    // تكاملات خارجية (أفضل جهد بدون انتظار): جوجل شيت + تنبيه طوارئ للحرجة
    const emp = this.findEmployee(v.employeeId);
    void pushViolationToSheet(this.config.googleSheetWebhook, {
      employee: emp?.name ?? v.employeeId,
      code: emp?.code ?? "",
      type: v.type,
      severity: v.severity,
      reason: v.reason,
      link: v.link ?? "",
      at: v.at,
    });
    if (v.severity === ViolationSeverity.HIGH) {
      void notifyNtfy(this.config.ntfyTopic, `مخالفة: ${emp?.name ?? ""}`, `${v.type} — ${v.reason}`, 5);
    }
    return v;
  }
  ackViolation(id: string, reply: string | null): Violation | null {
    const v = this.violations.find((x) => x.id === id);
    if (!v) return null;
    v.acknowledgedAt = nowIso();
    v.reply = reply;
    hub.broadcast(RealtimeEvent.VIOLATION, v);
    return v;
  }

  // ---------- notifications ----------
  addNotification(input: { type: string; from: string; to: string; body: string; audioUrl?: string | null }): NotificationItem {
    const n: NotificationItem = {
      id: uid("ntf"),
      type: input.type as NotificationItem["type"],
      from: input.from,
      to: input.to as NotificationItem["to"],
      body: input.body,
      audioUrl: input.audioUrl ?? null,
      at: nowIso(),
      readAt: null,
      reply: null,
    };
    this.notifications.push(n);
    if (input.type === NotificationType.SPOTLIGHT && input.to !== "all") {
      const l = this.getLive(input.to);
      l.spotlight = true;
      hub.broadcast(RealtimeEvent.STATUS_CHANGED, l);
    }
    if (n.to === "all") hub.broadcast(RealtimeEvent.NOTIFICATION, n);
    else hub.toEmployeeAndAdmins(n.to, RealtimeEvent.NOTIFICATION, n);
    return n;
  }
  private announceTeam(employeeId: string, action: string): void {
    const emp = this.findEmployee(employeeId);
    this.addNotification({ type: NotificationType.NOTICE, from: "system", to: "all", body: `${emp?.name ?? "موظف"} ${action}` });
  }
  replyNotification(id: string, reply: string): NotificationItem | null {
    const n = this.notifications.find((x) => x.id === id);
    if (!n) return null;
    n.reply = reply;
    n.readAt = n.readAt ?? nowIso();
    hub.broadcast(RealtimeEvent.NOTIFICATION, n);
    return n;
  }

  // ---------- chat ----------
  addChat(input: { from: string; to: string; body: string }): ChatMessage {
    const m: ChatMessage = {
      id: uid("msg"),
      from: input.from,
      to: input.to as ChatMessage["to"],
      body: input.body,
      at: nowIso(),
      readBy: [input.from],
    };
    this.chat.push(m);
    if (m.to === "team") hub.broadcast(RealtimeEvent.CHAT_MESSAGE, m);
    else hub.toEmployeeAndAdmins(m.to, RealtimeEvent.CHAT_MESSAGE, m);
    return m;
  }
  chatFor(me: string, withId?: string): ChatMessage[] {
    return this.chat.filter((m) => {
      if (withId) return (m.from === me && m.to === withId) || (m.from === withId && m.to === me);
      return m.to === "team" || m.from === me || m.to === me;
    });
  }

  // ---------- inbox ----------
  setInbox(unreadMessages: number, unreadComments: number): InboxSnapshot {
    this.inbox = { unreadMessages, unreadComments, at: nowIso() };
    hub.broadcast(RealtimeEvent.COUNTERS_UPDATED, { inbox: this.inbox });
    return this.inbox;
  }
  peakStatus(): { on: boolean; remaining: number } {
    return { on: this.inbox.unreadMessages >= Thresholds.PEAK_UNREAD, remaining: this.inbox.unreadMessages };
  }

  // ---------- screenshots ----------
  addScreenshot(input: { employeeId: string; dataUrl: string; width?: number; height?: number; isViolation?: boolean; ocrText?: string | null }): Screenshot {
    const sc: Screenshot = {
      id: uid("shot"),
      employeeId: input.employeeId,
      dataUrl: input.dataUrl,
      width: input.width ?? 0,
      height: input.height ?? 0,
      isViolation: !!input.isViolation,
      ocrText: input.ocrText ?? null,
      at: nowIso(),
    };
    this.screenshots.push(sc);
    // تنظيف ذاتي: احتفظ بآخر 60 لقطة فقط في الذاكرة
    if (this.screenshots.length > 60) this.screenshots.splice(0, this.screenshots.length - 60);
    return sc;
  }
  latestScreenshot(employeeId: string): Screenshot | null {
    for (let i = this.screenshots.length - 1; i >= 0; i--) {
      if (this.screenshots[i].employeeId === employeeId) return this.screenshots[i];
    }
    return null;
  }
  screenshotsFor(employeeId: string, limit = 12): Screenshot[] {
    return this.screenshots.filter((s) => s.employeeId === employeeId).slice(-limit).reverse();
  }

  // ---------- alerts ----------
  raiseAlert(input: { employeeId: string | null; kind: Alert["kind"]; severity?: string; message: string }): Alert {
    // منع التكرار لنفس النوع والموظف خلال دقيقتين
    const recent = this.alerts.find(
      (a) =>
        !a.resolvedAt &&
        a.employeeId === input.employeeId &&
        a.kind === input.kind &&
        Date.now() - new Date(a.at).getTime() < 2 * 60 * 1000,
    );
    if (recent) return recent;
    const a: Alert = {
      id: uid("alert"),
      employeeId: input.employeeId,
      kind: input.kind,
      severity: (input.severity as Alert["severity"]) ?? ViolationSeverity.MEDIUM,
      message: input.message,
      at: nowIso(),
      resolvedAt: null,
    };
    this.alerts.push(a);
    hub.broadcast(RealtimeEvent.ALERT, a);
    return a;
  }
  resolveAlert(id: string): Alert | null {
    const a = this.alerts.find((x) => x.id === id);
    if (!a) return null;
    a.resolvedAt = nowIso();
    hub.broadcast(RealtimeEvent.ALERT, a);
    return a;
  }

  // ---------- ai / reviews / night radar ----------
  reviewsFor(employeeId: string, limit = 12): ReplyReview[] {
    return this.reviews.filter((r) => r.employeeId === employeeId).slice(-limit).reverse();
  }
  private recentViolation(employeeId: string, type: string, ms = 5 * 60 * 1000): Violation | undefined {
    return this.violations.find(
      (v) => v.employeeId === employeeId && v.type === type && Date.now() - new Date(v.at).getTime() < ms,
    );
  }
  setNightMode(on: boolean): boolean {
    this.nightMode = on;
    hub.broadcast("night_mode", { enabled: on });
    return this.nightMode;
  }
  /** مسح آلي يصعّد الخمول/الترفيه إلى مخالفات ويطلق تنبيهات الضغط */
  nightScan(): { enabled: boolean; checked: number; raised: number } {
    if (!this.nightMode) return { enabled: false, checked: 0, raised: 0 };
    const now = Date.now();
    let raised = 0;
    for (const e of this.employees) {
      const l = this.getLive(e.id);
      if (l.presence !== PresenceState.WORKING) continue;
      if (l.lastMouseMoveAt && now - l.lastMouseMoveAt > 10 * 60 * 1000 && !this.recentViolation(e.id, "خمول ليلي طويل")) {
        this.addViolation({ employeeId: e.id, type: "خمول ليلي طويل", severity: ViolationSeverity.HIGH, reason: "خمول أكثر من 10 دقائق (رادار ليلي)" });
        raised++;
      }
      if (
        (l.status === EmployeeStatus.GAMES || l.status === EmployeeStatus.SOCIAL || l.status === EmployeeStatus.ENTERTAINMENT) &&
        !this.recentViolation(e.id, "ترفيه وقت العمل")
      ) {
        this.addViolation({ employeeId: e.id, type: "ترفيه وقت العمل", severity: ViolationSeverity.MEDIUM, reason: `فتح ${l.status} أثناء الشيفت (رادار ليلي)` });
        raised++;
      }
    }
    if (this.inbox.unreadMessages >= Thresholds.QUEUE_PRESSURE) {
      this.raiseAlert({ employeeId: null, kind: "queue_pressure", severity: ViolationSeverity.HIGH, message: `رادار ليلي: ${this.inbox.unreadMessages} رسالة متراكمة` });
      raised++;
    }
    return { enabled: true, checked: this.employees.length, raised };
  }

  // ---------- timeline / history / commands / config ----------
  addTimeline(employeeId: string, kind: TimelineEvent["kind"], label: string, category: string): TimelineEvent {
    const ev: TimelineEvent = { id: uid("tl"), employeeId, kind, label, category, at: nowIso() };
    this.timeline.push(ev);
    if (this.timeline.length > 3000) this.timeline.splice(0, this.timeline.length - 3000);
    hub.broadcast("timeline", ev);
    return ev;
  }
  timelineFor(employeeId: string, limit = 50): TimelineEvent[] {
    return this.timeline.filter((e) => e.employeeId === employeeId).slice(-limit).reverse();
  }
  addHistory(employeeId: string, items: { url: string; title?: string; visitAt?: string }[]): number {
    for (const it of (items || []).slice(0, 200)) {
      this.history.push({
        id: uid("hist"),
        employeeId,
        url: String(it.url || "").slice(0, 500),
        title: String(it.title || "").slice(0, 200),
        visitAt: it.visitAt || nowIso(),
        at: nowIso(),
      });
    }
    if (this.history.length > 5000) this.history.splice(0, this.history.length - 5000);
    return (items || []).length;
  }
  historyFor(employeeId: string, limit = 100): HistoryItem[] {
    return this.history.filter((h) => h.employeeId === employeeId).slice(-limit).reverse();
  }
  queueCommand(employeeId: string, cmd: string): void {
    const arr = this.commands.get(employeeId) ?? [];
    arr.push(cmd);
    this.commands.set(employeeId, arr);
  }
  popCommands(employeeId: string): string[] {
    const arr = this.commands.get(employeeId) ?? [];
    if (arr.length) this.commands.set(employeeId, []);
    return arr;
  }
  getConfig(): Config {
    return { ...this.config };
  }
  setConfig(patch: Partial<Config>): Config {
    Object.assign(this.config, patch);
    if (patch.queueStrict !== undefined) this.bumpQueue();
    return this.getConfig();
  }

  // ---------- طابور ميتا الإجباري (توزيع عادل يمنع التهرب من العملاء) ----------
  private bumpQueue(): void {
    hub.broadcast(RealtimeEvent.QUEUE, this.queueStats());
  }
  /** vip أولاً ثم high ثم normal، وداخل كل مستوى الأقدم أولاً (FIFO) */
  private sortWaiting(a: QueueTask, b: QueueTask): number {
    const pr = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
    if (pr !== 0) return pr;
    return new Date(a.enqueuedAt).getTime() - new Date(b.enqueuedAt).getTime();
  }

  enqueueTask(input: { channel?: string; customerRef: string; preview?: string; link?: string | null; priority?: string; externalId?: string | null }): QueueTask {
    const t: QueueTask = {
      id: uid("task"),
      channel: (input.channel as QueueTask["channel"]) ?? Channel.MESSENGER,
      customerRef: input.customerRef,
      preview: (input.preview ?? "").slice(0, 200),
      link: input.link ?? null,
      externalId: input.externalId ?? null,
      priority: (input.priority as QueueTask["priority"]) ?? QueuePriority.NORMAL,
      status: QueueStatus.WAITING,
      enqueuedAt: nowIso(),
      assignedTo: null,
      assignedAt: null,
      doneAt: null,
      waitMs: null,
      handleMs: null,
    };
    this.queue.push(t);
    const waiting = this.queue.filter((x) => x.status === QueueStatus.WAITING).length;
    if (waiting >= Thresholds.QUEUE_PRESSURE) {
      this.raiseAlert({ employeeId: null, kind: "queue_pressure", severity: ViolationSeverity.HIGH, message: `طابور ميتا: ${waiting} محادثة منتظرة` });
    }
    this.bumpQueue();
    return t;
  }

  /** مزامنة محادثات ميتا الحقيقية المسحوبة من الإكستنشن → الطابور (dedup عبر externalId) */
  syncQueue(
    items: { externalId?: string | null; channel?: string; customerRef: string; preview?: string; link?: string | null; priority?: string }[],
  ): { added: number; skipped: number; stats: ReturnType<Store["queueStats"]> } {
    let added = 0;
    let skipped = 0;
    const activeExt = new Set(
      this.queue
        .filter((t) => (t.status === QueueStatus.WAITING || t.status === QueueStatus.ASSIGNED) && t.externalId)
        .map((t) => t.externalId as string),
    );
    for (const it of (items || []).slice(0, 100)) {
      if (!it || !it.customerRef) { skipped++; continue; }
      const ext = it.externalId || null;
      if (ext && activeExt.has(ext)) { skipped++; continue; } // المحادثة موجودة بالفعل في الطابور
      this.enqueueTask({ channel: it.channel, customerRef: it.customerRef, preview: it.preview, link: it.link ?? null, priority: it.priority, externalId: ext });
      if (ext) activeExt.add(ext);
      added++;
    }
    return { added, skipped, stats: this.queueStats() };
  }

  currentTask(employeeId: string): QueueTask | null {
    return this.queue.find((t) => t.assignedTo === employeeId && t.status === QueueStatus.ASSIGNED) ?? null;
  }
  waitingCount(): number {
    return this.queue.filter((t) => t.status === QueueStatus.WAITING).length;
  }

  /** إسناد المهمة التالية لموظف (الأعلى أولوية ثم الأقدم). إسناد واحد في المرة. */
  assignNext(employeeId: string): QueueTask | null {
    const existing = this.currentTask(employeeId);
    if (existing) return existing;
    const emp = this.findEmployee(employeeId);
    if (!emp || !emp.active) return null;
    const live = this.getLive(employeeId);
    if (live.presence !== PresenceState.WORKING) return null; // لا تُسنَد لمن في بريك/خارج الشيفت
    const next = this.queue.filter((t) => t.status === QueueStatus.WAITING).sort((a, b) => this.sortWaiting(a, b))[0];
    if (!next) return null;
    next.status = QueueStatus.ASSIGNED;
    next.assignedTo = employeeId;
    next.assignedAt = nowIso();
    next.waitMs = Date.now() - new Date(next.enqueuedAt).getTime();
    this.addTimeline(employeeId, "activity", `استلم محادثة ${next.customerRef}`, "work");
    this.bumpQueue();
    return next;
  }

  /** إنهاء مهمة + إسناد التالية تلقائيًا (زر "تم، التالي") */
  completeTask(employeeId: string, taskId?: string): { done: QueueTask | null; next: QueueTask | null } {
    const t = taskId
      ? this.queue.find((x) => x.id === taskId && x.assignedTo === employeeId)
      : this.currentTask(employeeId);
    let done: QueueTask | null = null;
    if (t && t.status === QueueStatus.ASSIGNED) {
      t.status = QueueStatus.DONE;
      t.doneAt = nowIso();
      t.handleMs = t.assignedAt ? Date.now() - new Date(t.assignedAt).getTime() : null;
      done = t;
      this.getCounters(employeeId).tasksDone += 1; // عدّاد دائم لا يتأثر بتنظيف الطابور
      // الإنهاء يُحتسب ردًّا (يدخل عدّادات الأداء — مقياس عادل لا يُتلاعب به)
      this.addActivity({ employeeId, type: ActivityType.REPLY, channel: t.channel, ref: t.customerRef });
    }
    const next = this.config.queueStrict ? this.assignNext(employeeId) : null;
    this.bumpQueue();
    return { done, next };
  }

  /** إسناد يدوي من الإدارة لموظف محدّد */
  assignTask(taskId: string, employeeId: string): QueueTask | null {
    const t = this.queue.find((x) => x.id === taskId);
    if (!t || t.status === QueueStatus.DONE) return null;
    const cur = this.currentTask(employeeId);
    if (cur && cur.id !== t.id) { cur.status = QueueStatus.WAITING; cur.assignedTo = null; cur.assignedAt = null; }
    t.status = QueueStatus.ASSIGNED;
    t.assignedTo = employeeId;
    t.assignedAt = nowIso();
    if (t.waitMs == null) t.waitMs = Date.now() - new Date(t.enqueuedAt).getTime();
    this.addTimeline(employeeId, "activity", `أسندت لك الإدارة محادثة ${t.customerRef}`, "work");
    this.bumpQueue();
    return t;
  }

  /** تخطّي/إرجاع مهمة للطابور */
  skipTask(taskId: string, reason?: string): QueueTask | null {
    const t = this.queue.find((x) => x.id === taskId);
    if (!t) return null;
    const who = t.assignedTo;
    t.status = QueueStatus.WAITING;
    t.assignedTo = null;
    t.assignedAt = null;
    if (who) this.addTimeline(who, "activity", `تخطّى محادثة ${t.customerRef}${reason ? " — " + reason : ""}`, "other");
    this.bumpQueue();
    return t;
  }

  /** عند البريك/إنهاء الشيفت: رجّع مهمة الموظف للطابور (العميل مايستناش) */
  releaseEmployeeTasks(employeeId: string): void {
    let changed = false;
    for (const t of this.queue) {
      if (t.assignedTo === employeeId && t.status === QueueStatus.ASSIGNED) {
        t.status = QueueStatus.WAITING;
        t.assignedTo = null;
        t.assignedAt = null;
        changed = true;
      }
    }
    if (changed) this.bumpQueue();
  }

  queueStats() {
    const waiting = this.queue.filter((t) => t.status === QueueStatus.WAITING).sort((a, b) => this.sortWaiting(a, b));
    const assigned = this.queue.filter((t) => t.status === QueueStatus.ASSIGNED);
    // المنجَز اليوم من العدّاد الدائم (لا يتأثر بتنظيف مصفوفة الطابور عند تجاوز الحد)
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    // المتوسطات من المهام المنتهية المتبقية في الذاكرة (نافذة متحرّكة لآخر المهام)
    const recentDone = this.queue.filter((t) => t.status === QueueStatus.DONE && t.doneAt && new Date(t.doneAt).getTime() >= dayStart.getTime());
    const avg = (arr: number[]) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);
    const now = Date.now();
    const perEmployee = this.employees.map((e) => ({
      employeeId: e.id,
      name: e.name,
      color: e.avatarColor,
      current: this.currentTask(e.id),
      doneToday: this.tasksDoneToday(e.id),
    }));
    return {
      strict: this.config.queueStrict,
      waiting: waiting.length,
      assigned: assigned.length,
      doneToday: perEmployee.reduce((a, p) => a + p.doneToday, 0),
      avgWaitMs: avg(recentDone.map((t) => t.waitMs ?? 0).filter((n) => n > 0)),
      avgHandleMs: avg(recentDone.map((t) => t.handleMs ?? 0).filter((n) => n > 0)),
      oldestWaitMs: waiting.length ? now - new Date(waiting[0].enqueuedAt).getTime() : null,
      waitingList: waiting.slice(0, 12),
      perEmployee,
    };
  }

  /** عدد المهام المنجزة اليوم لموظف (عدّاد دائم — لمقارنة الأداء) */
  tasksDoneToday(employeeId: string): number {
    return this.getCounters(employeeId).tasksDone;
  }

  /** مسح الطابور: تصعيد المهام المنتظرة/المسندة الطويلة (يُستدعى من tick) */
  queueScan(): void {
    const now = Date.now();
    for (const t of this.queue) {
      if (t.status === QueueStatus.WAITING && now - new Date(t.enqueuedAt).getTime() > Thresholds.QUEUE_WAIT_WARN_MS) {
        this.raiseAlert({ employeeId: null, kind: "queue_pressure", severity: ViolationSeverity.HIGH, message: `محادثة منتظرة في الطابور أكثر من 3 دقائق` });
      }
      if (t.status === QueueStatus.ASSIGNED && t.assignedTo && t.assignedAt && now - new Date(t.assignedAt).getTime() > Thresholds.QUEUE_HANDLE_WARN_MS) {
        this.raiseAlert({ employeeId: t.assignedTo, kind: "deal_at_risk", severity: ViolationSeverity.MEDIUM, message: `ماسك محادثة ${t.customerRef} بدون إنهاء أكثر من 5 دقائق` });
      }
    }
  }

  // ---------- مؤشرات KPI (سلسلة زمنية + توزيع جودة الردود) ----------
  /** عيّنة لحظية تُجمَع من tick كل 5 ثوانٍ */
  sampleMetrics(): void {
    let online = 0;
    let queueDone = 0;
    for (const e of this.employees) {
      if (this.getLive(e.id).online) online++;
      queueDone += this.getCounters(e.id).tasksDone;
    }
    const assigned = this.queue.filter((t) => t.status === QueueStatus.ASSIGNED).length;
    const done = this.queue.filter((t) => t.status === QueueStatus.DONE && t.handleMs != null).slice(-50);
    const avgHandleMs = done.length ? Math.round(done.reduce((a, t) => a + (t.handleMs ?? 0), 0) / done.length) : null;
    this.metrics.push({
      at: Date.now(),
      unread: this.inbox.unreadMessages,
      comments: this.inbox.unreadComments,
      queueWaiting: this.waitingCount(),
      queueAssigned: assigned,
      queueDone,
      online,
      avgHandleMs,
    });
    if (this.metrics.length > 180) this.metrics.splice(0, this.metrics.length - 180);
  }

  /** توزيع جودة الردود (آخر التقييمات المحفوظة) */
  reviewStats(): { good: number; ok: number; bad: number } {
    let good = 0, ok = 0, bad = 0;
    for (const r of this.reviews) {
      if (r.verdict === "good") good++;
      else if (r.verdict === "ok") ok++;
      else bad++;
    }
    return { good, ok, bad };
  }

  kpiSnapshot(): { series: MetricPoint[]; reviews: { good: number; ok: number; bad: number } } {
    return { series: this.metrics.slice(-120), reviews: this.reviewStats() };
  }

  // ---------- background tick ----------
  /** يعيد حساب الحالات ويطلق التنبيهات بناءً على أعمار الـ heartbeat */
  tick(): void {
    const now = Date.now();
    for (const e of this.employees) {
      const l = this.getLive(e.id);
      if (l.presence === PresenceState.NOT_STARTED || l.presence === PresenceState.SHIFT_ENDED) continue;
      const age = now - l.lastHeartbeatAt;
      if (l.lastHeartbeatAt === 0) continue;
      if (age > Thresholds.OFFLINE_MS) {
        if (l.online) {
          l.online = false;
          l.status = EmployeeStatus.OFFLINE;
          hub.broadcast(RealtimeEvent.STATUS_CHANGED, l);
        }
      } else if (age > Thresholds.INTERMITTENT_MS) {
        if (l.status !== EmployeeStatus.INTERMITTENT) {
          l.status = EmployeeStatus.INTERMITTENT;
          hub.broadcast(RealtimeEvent.STATUS_CHANGED, l);
        }
      }
      // تنبيه خمول: ماوس واقف أكثر من 5 دقائق أثناء العمل
      if (
        l.presence === PresenceState.WORKING &&
        l.lastMouseMoveAt &&
        now - l.lastMouseMoveAt > Thresholds.IDLE_ALERT_MS
      ) {
        this.raiseAlert({
          employeeId: e.id,
          kind: "idle",
          severity: ViolationSeverity.MEDIUM,
          message: `${e.name} متوقف أكثر من 5 دقائق`,
        });
      }
    }
    // ضغط صندوق الوارد
    if (this.inbox.unreadMessages >= Thresholds.QUEUE_PRESSURE) {
      this.raiseAlert({
        employeeId: null,
        kind: "queue_pressure",
        severity: ViolationSeverity.HIGH,
        message: `ضغط عالي: ${this.inbox.unreadMessages} رسالة غير مقروءة`,
      });
    }
    // تصعيد تأخّر الطابور
    this.queueScan();
    // عيّنة مؤشرات KPI (سلسلة زمنية)
    this.sampleMetrics();
  }

  // ---------- auto-purge (تنظيف ذاتي للذاكرة — الوعد في الخطة: حذف الروتيني بعد 48 ساعة) ----------
  purge(): void {
    const now = Date.now();
    const cut = now - Thresholds.PURGE_ROUTINE_MS;
    if (this.activities.length > 2000) {
      this.activities = this.activities.filter((a) => new Date(a.at).getTime() > cut).slice(-5000);
    }
    const cap = (arr: unknown[], n: number) => {
      if (arr.length > n) arr.splice(0, arr.length - n);
    };
    cap(this.chat, 1000);
    cap(this.notifications, 500);
    cap(this.reviews, 500);
    cap(this.violations, 500);
    cap(this.points, 2000);
    cap(this.timeline, 3000);
    cap(this.history, 5000);
    // طابور: احذف المنتهية/المتخطّاة الأقدم من 48 ساعة ثم احتفظ بحد أقصى (المنتظرة/المسندة تبقى دائمًا)
    this.queue = this.queue.filter(
      (t) => t.status === QueueStatus.WAITING || t.status === QueueStatus.ASSIGNED || !t.doneAt || now - new Date(t.doneAt).getTime() < Thresholds.PURGE_ROUTINE_MS,
    );
    if (this.queue.length > Thresholds.QUEUE_MAX) {
      let over = this.queue.length - Thresholds.QUEUE_MAX;
      this.queue = this.queue.filter((t) => {
        if (over > 0 && (t.status === QueueStatus.DONE || t.status === QueueStatus.SKIPPED)) {
          over--;
          return false;
        }
        return true;
      });
    }
    // تنبيهات: احذف المحلولة الأقدم من ساعة واحتفظ بآخر 300
    this.alerts = this.alerts.filter((a) => !a.resolvedAt || now - new Date(a.resolvedAt).getTime() < 60 * 60 * 1000);
    cap(this.alerts, 300);
    // عدّادات: احتفظ بآخر 3 أيام فقط
    const keep = new Set([0, 1, 2].map((d) => new Date(now - d * 86400000).toISOString().slice(0, 10)));
    for (const key of [...this.counters.keys()]) {
      if (!keep.has(key.split(":")[1])) this.counters.delete(key);
    }
  }

  // ---------- ثبات البيانات (serialize/restore — لقطة JSON، تُستبدل بـ Supabase لاحقًا) ----------
  /** لقطة قابلة للتخزين (نستبعد الصور/اللقطات المؤقتة والأوامر العابرة) */
  serialize(): Record<string, unknown> {
    return {
      v: 1,
      employees: this.employees,
      live: Object.fromEntries(this.live),
      shifts: this.shifts,
      breaks: this.breaks,
      activities: this.activities,
      counters: Object.fromEntries(this.counters),
      reviews: this.reviews,
      points: this.points,
      violations: this.violations,
      notifications: this.notifications,
      chat: this.chat,
      alerts: this.alerts,
      nightMode: this.nightMode,
      timeline: this.timeline,
      history: this.history,
      queue: this.queue,
      metrics: this.metrics,
      config: this.config,
      inbox: this.inbox,
    };
  }

  /** استعادة من لقطة محفوظة (حراسة كل حقل حتى لا يكسرنا ملف ناقص/قديم) */
  load(d: any): void {
    if (!d || typeof d !== "object") return;
    if (Array.isArray(d.employees)) this.employees = d.employees;
    if (d.live && typeof d.live === "object") this.live = new Map(Object.entries(d.live) as [string, LiveStatus][]);
    if (Array.isArray(d.shifts)) this.shifts = d.shifts;
    if (Array.isArray(d.breaks)) this.breaks = d.breaks;
    if (Array.isArray(d.activities)) this.activities = d.activities;
    if (d.counters && typeof d.counters === "object") this.counters = new Map(Object.entries(d.counters) as [string, CountersDaily][]);
    if (Array.isArray(d.reviews)) this.reviews = d.reviews;
    if (Array.isArray(d.points)) this.points = d.points;
    if (Array.isArray(d.violations)) this.violations = d.violations;
    if (Array.isArray(d.notifications)) this.notifications = d.notifications;
    if (Array.isArray(d.chat)) this.chat = d.chat;
    if (Array.isArray(d.alerts)) this.alerts = d.alerts;
    if (typeof d.nightMode === "boolean") this.nightMode = d.nightMode;
    if (Array.isArray(d.timeline)) this.timeline = d.timeline;
    if (Array.isArray(d.history)) this.history = d.history;
    if (Array.isArray(d.queue)) this.queue = d.queue;
    if (Array.isArray(d.metrics)) this.metrics = d.metrics;
    if (d.config && typeof d.config === "object") Object.assign(this.config, d.config);
    if (d.inbox && typeof d.inbox === "object") this.inbox = d.inbox;
    // تأكد إن كل موظف له حالة live
    for (const e of this.employees) if (!this.live.has(e.id)) this.live.set(e.id, freshLive(e.id));
  }
}

export const store = new Store();
