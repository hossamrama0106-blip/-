# Khiam Ops backend — حاوية واحدة تقدّم الـAPI + الداشبورد المبنيّ (single origin).
# الباك stateful (الحالة في الذاكرة + لقطة دائمة في Supabase) — عملية واحدة، مش serverless.
# البناء من جذر المونوريبو:  docker build -f apps/backend/Dockerfile -t khiam-ops .
FROM node:24-slim
WORKDIR /app
RUN corepack enable

# تثبيت اعتماديات الـworkspace كامل (الباك يعتمد على @khiam/shared)
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --frozen-lockfile

# بناء الداشبورد الثابت ليقدّمه الباك من نفس الأصل
RUN pnpm --filter @khiam/dashboard build

WORKDIR /app/apps/backend
ENV NODE_ENV=production
ENV PORT=8787
# الداشبورد المبنيّ (الافتراضي صحيح: apps/dashboard/dist نسبةً لمجلد الباك)
# ENV DASHBOARD_DIST=../dashboard/dist
EXPOSE 8787

# الأسرار تُمرَّر وقت التشغيل عبر --env-file أو -e (مش داخل الصورة):
#   AUTH_SECRET, ADMIN_CODE, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY,
#   GROQ_API_KEY, R2_* ... (شوف DEPLOY.md و .env.example)
CMD ["pnpm", "start"]
