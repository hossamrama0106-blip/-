-- ============================================================================
--  Khiam Ops — جدول لقطة الحالة (ops_snapshot)
--  شغّل ده لو كنت طبّقت schema.sql قبل ما الجدول ده يتضاف (آمن تشغّله أكتر من مرة).
--  Supabase → SQL Editor → الصق → Run.
-- ============================================================================

create table if not exists ops_snapshot (
  id         integer primary key default 1 check (id = 1),
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table ops_snapshot enable row level security;
-- بدون سياسات عامة = لا وصول من anon/authenticated. الـ backend بمفتاح service_role يتخطّى RLS.
