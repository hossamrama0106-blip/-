// أنواع البيانات — العقود المشتركة بين كل الأطراف
import type {
  ActivityType,
  BreakType,
  Channel,
  EmployeeStatus,
  NotificationType,
  PresenceState,
  ReplyVerdict,
  Role,
  ViolationSeverity,
} from "./enums.js";

export type ID = string;
export type ISODate = string; // ISO 8601
export type Millis = number; // epoch ms

/** الموظف */
export interface Employee {
  id: ID;
  code: string; // كود الدخول (زي U9987)
  name: string;
  whatsapp: string; // رقم واتساب للتصدير
  role: Role;
  active: boolean; // مفعّل / معطّل
  superMonitor: boolean; // مراقبة فائقة مفعّلة
  consentAt: ISODate | null; // وقت موافقة الموظف على المراقبة
  avatarColor: string; // لون مميز في الواجهة
  createdAt: ISODate;
}

/** الحالة اللحظية (في Upstash مستقبلاً، in-memory الآن) */
export interface LiveStatus {
  employeeId: ID;
  status: EmployeeStatus;
  presence: PresenceState;
  online: boolean;
  typing: boolean;
  typingWpm: number; // سرعة الكتابة الحالية
  lastHeartbeatAt: Millis;
  lastMouseMoveAt: Millis | null;
  lastReplyAt: Millis | null; // آخر رد
  lastOpenedMsgAt: Millis | null; // آخر رسالة فتحها
  currentWindow: string | null; // عنوان النافذة/التبويب الحالي
  currentConversation: string | null; // اسم/مرجع المحادثة الحالية
  extensionConnected: boolean;
  agentConnected: boolean;
  liveWatching: boolean; // الإدارة بتتفرج لايف دلوقتي
  spotlight: boolean; // عين الرقابة العلنية مفعّلة
}

/** جلسة شيفت */
export interface ShiftSession {
  id: ID;
  employeeId: ID;
  startedAt: ISODate; // وقت ضغط "بدأت"
  firstMsgAt: ISODate | null; // وقت أول رسالة
  endedAt: ISODate | null;
  handoverNotes: string | null; // ملاحظات تسليم الوردية
}

/** استراحة */
export interface BreakEntry {
  id: ID;
  employeeId: ID;
  type: BreakType;
  startedAt: ISODate;
  endedAt: ISODate | null;
}

/** حدث نشاط مفرد (للعدّادات والسجل) */
export interface ActivityEvent {
  id: ID;
  employeeId: ID;
  type: ActivityType;
  channel: Channel;
  ref: string | null; // مرجع المحادثة/البوست/الأوردر
  at: ISODate;
}

/** ملخص عدّادات يومي */
export interface CountersDaily {
  employeeId: ID;
  date: string; // YYYY-MM-DD
  msgs: number;
  comments: number;
  orders: number;
  openNoReply: number; // فتح ولم يرد
  avgGapMs: number | null; // متوسط الفجوة بين الردود
  typingWpm: number | null; // متوسط سرعة الكتابة
  activeMs: number; // زمن العمل الفعلي
}

/** تقييم رد بالـ AI */
export interface ReplyReview {
  id: ID;
  employeeId: ID;
  conversationRef: string;
  verdict: ReplyVerdict;
  score: number; // 0..100
  aiNotes: string;
  sampleText: string; // آخر الرسائل التي قُيّمت
  at: ISODate;
  approvedBy: ID | null; // اعتماد الإدارة للرد
}

/** نقطة (خضراء +/ حمراء -) */
export interface PointEntry {
  id: ID;
  employeeId: ID;
  delta: number; // +1 جيد/مقبول ، -1 سيئ
  reason: string;
  source: "ai" | "manual";
  at: ISODate;
}

/** مخالفة */
export interface Violation {
  id: ID;
  employeeId: ID;
  type: string; // "تهرب من عميل" / "خمول" / "نشاط وهمي" ...
  severity: ViolationSeverity;
  reason: string;
  screenshotUrl: string | null;
  at: ISODate;
  acknowledgedAt: ISODate | null; // رد الموظف/اطّلاعه
  reply: string | null; // رد الموظف على المخالفة
}

/** إشعار من الإدارة للموظف */
export interface NotificationItem {
  id: ID;
  type: NotificationType;
  from: ID; // admin id
  to: ID | "all"; // موظف أو الكل
  body: string;
  audioUrl?: string | null;
  at: ISODate;
  readAt: ISODate | null;
  reply: string | null; // رد الموظف
}

/** رسالة شات داخلي (موظف↔موظف أو إدارة↔موظف) */
export interface ChatMessage {
  id: ID;
  from: ID;
  to: ID | "team"; // فردي أو جماعي
  body: string;
  at: ISODate;
  readBy: ID[];
}

/** تنبيه على الداشبورد (إدارة بالاستثناء) */
export interface Alert {
  id: ID;
  employeeId: ID | null;
  kind: "idle" | "queue_pressure" | "cherry_pick" | "games" | "fake_activity" | "deal_at_risk" | "custom";
  severity: ViolationSeverity;
  message: string;
  at: ISODate;
  resolvedAt: ISODate | null;
}

/** حالة صندوق الوارد العامة (كام غير مقروء) */
export interface InboxSnapshot {
  unreadMessages: number;
  unreadComments: number;
  at: ISODate;
}

/** غلاف موحّد لأحداث الـ realtime */
export interface RealtimeMessage<T = unknown> {
  event: string;
  at: Millis;
  payload: T;
}

/** رد تسجيل الدخول */
export interface LoginResult {
  token: string;
  employee: Employee;
  consentRequired: boolean; // لازم يوافق على المراقبة الأول
}
