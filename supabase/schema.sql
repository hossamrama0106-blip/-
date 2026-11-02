-- ============================================================================
-- Khiam Ops OS — سكيمة Supabase (PostgreSQL)
-- ----------------------------------------------------------------------------
-- تجهيز للإنتاج. مش متطبّقة بعد — تتطبّق لما تجهّز مشروع Supabase:
--   psql "$DATABASE_URL" -f supabase/schema.sql
--   أو الصقها في SQL Editor داخل لوحة Supabase.
--
-- المعمارية: الـ backend (Hono) بيستخدم مفتاح service_role (يتخطّى RLS) ويفرض
-- الصلاحيات في الكود (admin vs employee + self-check) زي ما بيحصل دلوقتي في الذاكرة.
-- الجداول مرآة لـ store.serialize(): الـ id نصّي (زي emp_xxx) عشان الترحيل يبقى upsert مباشر.
-- RLS مفعّل على كل الجداول وبدون سياسات عامة = الوصول المباشر من المتصفح مرفوض افتراضيًا
-- (أمثلة سياسات العميل المباشر معلّقة بالأسفل لو احتجناها لاحقًا).
-- اللقطات (screenshots) الصورة نفسها في تخزين كائنات (R2/Supabase Storage) والجدول يحمل المسار فقط.
-- ============================================================================

-- ---------- enums (مصدر الحقيقة: packages/shared/src/enums.ts) ----------
create type role_t               as enum ('admin','employee');
create type employee_status_t    as enum ('online','offline','intermittent','typing','in_conversation','comments_page','social','games','entertainment','no_internet','agent_disconnected','idle');
create type presence_state_t     as enum ('not_started','working','break','prayer','wc','shift_ended');
create type break_type_t         as enum ('prayer','wc','break');
create type activity_type_t      as enum ('reply','comment','order','open_no_reply');
create type queue_priority_t     as enum ('normal','high','vip');
create type queue_status_t       as enum ('waiting','assigned','done','skipped');
create type channel_t            as enum ('messenger','instagram','whatsapp','comments','operix');
create type reply_verdict_t      as enum ('good','ok','bad');
create type notification_type_t  as enum ('notice','message','violation','broadcast_audio','spotlight');
create type violation_severity_t as enum ('low','medium','high');
create type alert_kind_t         as enum ('idle','queue_pressure','cherry_pick','games','fake_activity','deal_at_risk','custom');

-- ---------- الموظفون ----------
create table employees (
  id            text primary key,
  code          text unique not null,
  name          text not null,
  whatsapp      text not null default '',
  role          role_t not null default 'employee',
  active        boolean not null default true,
  super_monitor boolean not null default false,
  consent_at    timestamptz,                 -- وقت موافقة الموظف على المراقبة المعلنة (null = لم يوافق)
  avatar_color  text not null default '#6366f1',
  created_at    timestamptz not null default now()
);

-- ---------- الحالة اللحظية (في الإنتاج يفضَّل Upstash/Redis؛ الجدول للاستمرارية فقط) ----------
create table live_status (
  employee_id        text primary key references employees(id) on delete cascade,
  status             employee_status_t not null default 'offline',
  presence           presence_state_t  not null default 'not_started',
  online             boolean not null default false,
  typing             boolean not null default false,
  typing_wpm         integer not null default 0,
  last_heartbeat_at  bigint  not null default 0,   -- epoch ms
  last_mouse_move_at bigint,
  last_reply_at      bigint,
  last_opened_msg_at bigint,
  current_window     text,
  current_conversation text,
  current_activity   text,
  meta_focused       boolean not null default true,
  extension_connected boolean not null default false,
  agent_connected    boolean not null default false,
  live_watching      boolean not null default false,
  spotlight          boolean not null default false,
  super_monitor      boolean not null default false
);

-- ---------- الورديات ----------
create table shifts (
  id            text primary key,
  employee_id   text not null references employees(id) on delete cascade,
  started_at    timestamptz not null,
  first_msg_at  timestamptz,
  ended_at      timestamptz,
  handover_notes text
);
create index shifts_emp_idx on shifts (employee_id, started_at desc);

-- ---------- الاستراحات ----------
create table breaks (
  id          text primary key,
  employee_id text not null references employees(id) on delete cascade,
  type        break_type_t not null default 'break',
  started_at  timestamptz not null,
  ended_at    timestamptz
);
create index breaks_emp_idx on breaks (employee_id, started_at desc);

-- ---------- أحداث النشاط (المفردة) ----------
create table activities (
  id          text primary key,
  employee_id text not null references employees(id) on delete cascade,
  type        activity_type_t not null,
  channel     channel_t not null,
  ref         text,
  at          timestamptz not null default now()
);
create index activities_emp_at_idx on activities (employee_id, at desc);

-- ---------- العدّادات اليومية ----------
create table counters_daily (
  employee_id text not null references employees(id) on delete cascade,
  date        date not null,
  msgs        integer not null default 0,
  comments    integer not null default 0,
  orders      integer not null default 0,
  open_no_reply integer not null default 0,
  tasks_done  integer not null default 0,
  avg_gap_ms  integer,
  typing_wpm  integer,
  active_ms   bigint not null default 0,
  primary key (employee_id, date)
);

-- ---------- تقييمات الردود (AI) ----------
create table reviews (
  id              text primary key,
  employee_id     text not null references employees(id) on delete cascade,
  conversation_ref text not null default '',
  verdict         reply_verdict_t not null,
  score           integer not null default 0,
  ai_notes        text not null default '',
  sample_text     text not null default '',
  evidence_url    text,
  at              timestamptz not null default now(),
  approved_by     text references employees(id) on delete set null
);
create index reviews_emp_at_idx on reviews (employee_id, at desc);

-- ---------- النقاط ----------
create table points (
  id          text primary key,
  employee_id text not null references employees(id) on delete cascade,
  delta       integer not null,
  reason      text not null default '',
  source      text not null default 'manual',   -- 'ai' | 'manual'
  at          timestamptz not null default now()
);
create index points_emp_idx on points (employee_id);

-- ---------- المخالفات ----------
create table violations (
  id             text primary key,
  employee_id    text not null references employees(id) on delete cascade,
  type           text not null,
  severity       violation_severity_t not null default 'medium',
  reason         text not null default '',
  screenshot_url text,
  image_url      text,
  link           text,
  at             timestamptz not null default now(),
  acknowledged_at timestamptz,
  reply          text
);
create index violations_emp_at_idx on violations (employee_id, at desc);

-- ---------- الإشعارات ----------
create table notifications (
  id        text primary key,
  type      notification_type_t not null,
  from_id   text not null,                 -- admin id أو 'system'
  to_id     text not null,                 -- employee id أو 'all'
  body      text not null default '',
  audio_url text,
  at        timestamptz not null default now(),
  read_at   timestamptz,
  reply     text
);
create index notifications_to_idx on notifications (to_id, at desc);

-- ---------- الشات الداخلي ----------
create table chat_messages (
  id      text primary key,
  from_id text not null,
  to_id   text not null,                   -- employee id أو 'team'
  body    text not null default '',
  at      timestamptz not null default now(),
  read_by jsonb not null default '[]'::jsonb
);
create index chat_to_idx on chat_messages (to_id, at desc);

-- ---------- التنبيهات (إدارة بالاستثناء) ----------
create table alerts (
  id          text primary key,
  employee_id text references employees(id) on delete set null,
  kind        alert_kind_t not null,
  severity    violation_severity_t not null default 'medium',
  message     text not null default '',
  at          timestamptz not null default now(),
  resolved_at timestamptz
);
create index alerts_open_idx on alerts (resolved_at, at desc);

-- ---------- لقطات صندوق الوارد (سلسلة زمنية) ----------
create table inbox_snapshots (
  id              bigint generated always as identity primary key,
  unread_messages integer not null default 0,
  unread_comments integer not null default 0,
  at              timestamptz not null default now()
);

-- ---------- اللقطات (الصورة في تخزين كائنات؛ هنا المسار فقط) ----------
create table screenshots (
  id           text primary key,
  employee_id  text not null references employees(id) on delete cascade,
  storage_path text not null,              -- مسار R2/Supabase Storage (بدل data URL)
  width        integer not null default 0,
  height       integer not null default 0,
  is_violation boolean not null default false,
  ocr_text     text,
  at           timestamptz not null default now()
);
create index screenshots_emp_at_idx on screenshots (employee_id, at desc);

-- ---------- الخط الزمني ----------
create table timeline_events (
  id          text primary key,
  employee_id text not null references employees(id) on delete cascade,
  kind        text not null,               -- window | activity | status | capture
  label       text not null default '',
  category    text not null default 'other', -- work | social | games | entertainment | other
  at          timestamptz not null default now()
);
create index timeline_emp_at_idx on timeline_events (employee_id, at desc);

-- ---------- هيستوري المتصفح (يُسحب بموافقة) ----------
create table history_items (
  id          text primary key,
  employee_id text not null references employees(id) on delete cascade,
  url         text not null,
  title       text not null default '',
  visit_at    timestamptz not null,
  at          timestamptz not null default now()
);
create index history_emp_idx on history_items (employee_id, visit_at desc);

-- ---------- طابور ميتا الإجباري ----------
create table queue_tasks (
  id           text primary key,
  channel      channel_t not null default 'messenger',
  customer_ref text not null,
  preview      text not null default '',
  link         text,
  external_id  text,                        -- معرّف المحادثة في ميتا (dedup عند المزامنة)
  priority     queue_priority_t not null default 'normal',
  status       queue_status_t not null default 'waiting',
  enqueued_at  timestamptz not null default now(),
  assigned_to  text references employees(id) on delete set null,
  assigned_at  timestamptz,
  done_at      timestamptz,
  wait_ms      bigint,
  handle_ms    bigint
);
create index queue_status_idx on queue_tasks (status, priority, enqueued_at);
create unique index queue_external_active_idx on queue_tasks (external_id) where external_id is not null and status in ('waiting','assigned');

-- ---------- مؤشرات KPI (سلسلة زمنية) ----------
create table metrics (
  at             timestamptz primary key,
  unread         integer not null default 0,
  comments       integer not null default 0,
  queue_waiting  integer not null default 0,
  queue_assigned integer not null default 0,
  queue_done     integer not null default 0,
  online         integer not null default 0,
  avg_handle_ms  bigint
);

-- ---------- سجل التدقيق (أثر أفعال الإدارة — append-only) ----------
create table audit_log (
  id          text primary key,
  at          timestamptz not null default now(),
  actor_id    text not null,
  actor_name  text not null default '',
  action      text not null,               -- admin_login, employee_create/update/delete, flags_set, violation_add, point_add, command_send, night_mode, settings_update, queue_assign/skip, notification_send
  target_id   text,
  target_name text,
  details     text not null default '',
  ip          text
);
create index audit_at_idx     on audit_log (at desc);
create index audit_actor_idx  on audit_log (actor_id);
create index audit_action_idx on audit_log (action);

-- ---------- إعدادات التطبيق (صف واحد) ----------
create table app_config (
  id                 integer primary key default 1 check (id = 1),
  google_sheet_webhook text not null default '',
  ntfy_topic         text not null default '',
  queue_strict       boolean not null default true
);
insert into app_config (id) values (1) on conflict (id) do nothing;

-- ============================================================================
-- RLS: مفعّل على الكل. الـ backend بمفتاح service_role يتخطّاه ويفرض الصلاحيات في الكود.
-- بدون سياسات عامة = لا وصول مباشر من anon/authenticated (آمن افتراضيًا).
-- ============================================================================
alter table employees        enable row level security;
alter table live_status      enable row level security;
alter table shifts           enable row level security;
alter table breaks           enable row level security;
alter table activities       enable row level security;
alter table counters_daily   enable row level security;
alter table reviews          enable row level security;
alter table points           enable row level security;
alter table violations       enable row level security;
alter table notifications    enable row level security;
alter table chat_messages    enable row level security;
alter table alerts           enable row level security;
alter table inbox_snapshots  enable row level security;
alter table screenshots      enable row level security;
alter table timeline_events  enable row level security;
alter table history_items    enable row level security;
alter table queue_tasks      enable row level security;
alter table metrics          enable row level security;
alter table audit_log        enable row level security;
alter table app_config       enable row level security;

-- مثال لسياسات الوصول المباشر من المتصفح لاحقًا (لو اتخلّينا عن طبقة الـ backend كوسيط):
--   الأدمن يقرأ كل حاجة:
--     create policy admin_read_all on violations for select
--       using ( (auth.jwt() ->> 'role') = 'admin' );
--   الموظف يقرأ سجلّه فقط:
--     create policy emp_self_read on violations for select
--       using ( employee_id = (auth.jwt() ->> 'employee_id') );
--   سجل التدقيق للأدمن فقط ولا يُحدَّث/يُحذف (append-only) حتى منه:
--     create policy audit_admin_read on audit_log for select
--       using ( (auth.jwt() ->> 'role') = 'admin' );
--     (لا سياسات update/delete إطلاقًا — الإدراج عبر service_role فقط.)
