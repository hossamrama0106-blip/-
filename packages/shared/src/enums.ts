// ثوابت ومُعدّدات النظام — مصدر الحقيقة لكل الأطراف (backend / dashboard / extension / agent)

/** حالة الموظف اللحظية كما تظهر على الداشبورد */
export const EmployeeStatus = {
  ONLINE: "online", // متصل ويعمل
  OFFLINE: "offline", // غير متصل
  INTERMITTENT: "intermittent", // متقطع
  TYPING: "typing", // يكتب ردًا
  IN_CONVERSATION: "in_conversation", // داخل محادثة عميل
  COMMENTS_PAGE: "comments_page", // صفحة التعليقات
  SOCIAL: "social", // سوشيال ميديا
  GAMES: "games", // ألعاب
  ENTERTAINMENT: "entertainment", // مواقع ترفيه
  NO_INTERNET: "no_internet", // النت مقطوع
  AGENT_DISCONNECTED: "agent_disconnected", // الإكستنشن/البرنامج غير متصل
  IDLE: "idle", // لا يتحرك
} as const;
export type EmployeeStatus = (typeof EmployeeStatus)[keyof typeof EmployeeStatus];

/** حالة الحضور/الشيفت */
export const PresenceState = {
  NOT_STARTED: "not_started", // لسه مابداش
  WORKING: "working", // بدأ ويشتغل
  BREAK: "break", // بريك
  PRAYER: "prayer", // استراحة صلاة
  WC: "wc", // استراحة حمام
  SHIFT_ENDED: "shift_ended", // أنهى الشيفت
} as const;
export type PresenceState = (typeof PresenceState)[keyof typeof PresenceState];

/** نوع الاستراحة */
export const BreakType = {
  PRAYER: "prayer",
  WC: "wc",
  BREAK: "break",
} as const;
export type BreakType = (typeof BreakType)[keyof typeof BreakType];

/** نوع النشاط المعدود (رسالة/تعليق/أوردر) */
export const ActivityType = {
  REPLY: "reply", // رد على رسالة
  COMMENT: "comment", // رد على تعليق
  ORDER: "order", // تسجيل أوردر على Operix
  OPEN_NO_REPLY: "open_no_reply", // فتح رسالة ولم يرد
} as const;
export type ActivityType = (typeof ActivityType)[keyof typeof ActivityType];

/** قناة العمل (من فين جه النشاط) */
export const Channel = {
  MESSENGER: "messenger",
  INSTAGRAM: "instagram",
  WHATSAPP: "whatsapp",
  COMMENTS: "comments",
  OPERIX: "operix",
} as const;
export type Channel = (typeof Channel)[keyof typeof Channel];

/** تقييم جودة الرد من الـ AI */
export const ReplyVerdict = {
  GOOD: "good", // رد جيد → نقطة خضراء
  OK: "ok", // رد مقبول → نقطة خضراء
  BAD: "bad", // رد سيئ → نقطة حمراء
} as const;
export type ReplyVerdict = (typeof ReplyVerdict)[keyof typeof ReplyVerdict];

/** نوع الإشعار المرسل من الإدارة للموظف */
export const NotificationType = {
  NOTICE: "notice", // إشعار عادي
  MESSAGE: "message", // رسالة يرد منها
  VIOLATION: "violation", // مخالفة (تُحفظ في السجل + يرد منها)
  BROADCAST_AUDIO: "broadcast_audio", // بث صوتي
  SPOTLIGHT: "spotlight", // تفعيل عين الرقابة العلنية
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

/** مستوى خطورة المخالفة */
export const ViolationSeverity = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
} as const;
export type ViolationSeverity = (typeof ViolationSeverity)[keyof typeof ViolationSeverity];

/** أدوار المستخدمين */
export const Role = {
  ADMIN: "admin",
  EMPLOYEE: "employee",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

/** أنواع أحداث الـ realtime المبثوثة عبر SSE/WS */
export const RealtimeEvent = {
  PRESENCE_CHANGED: "presence_changed",
  STATUS_CHANGED: "status_changed",
  ACTIVITY: "activity",
  COUNTERS_UPDATED: "counters_updated",
  CHAT_MESSAGE: "chat_message",
  NOTIFICATION: "notification",
  VIOLATION: "violation",
  SHIFT_EVENT: "shift_event",
  EMPLOYEE_UPSERT: "employee_upsert",
  EMPLOYEE_REMOVED: "employee_removed",
  ALERT: "alert",
} as const;
export type RealtimeEvent = (typeof RealtimeEvent)[keyof typeof RealtimeEvent];

/** عتبات التنبيهات (قابلة للضبط لاحقاً من الداشبورد) */
export const Thresholds = {
  IDLE_ALERT_MS: 5 * 60 * 1000, // تنبيه خمول بعد 5 دقائق
  INTERMITTENT_MS: 90 * 1000, // متقطع لو مافيش heartbeat 90 ثانية
  OFFLINE_MS: 3 * 60 * 1000, // غير متصل بعد 3 دقائق بدون heartbeat
  CHERRY_PICK_LIMIT: 3, // فتح وخروج بدون رد > 3 مرات = تهرب من عميل
  QUEUE_PRESSURE: 15, // عدد رسائل الانتظار اللي يعتبر ضغط
  PURGE_ROUTINE_MS: 48 * 60 * 60 * 1000, // حذف البيانات الروتينية بعد 48 ساعة
} as const;
