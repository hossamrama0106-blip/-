#!/usr/bin/env node
// يبني release/khiam-employee-pack.zip (إكستنشن + برنامج + تعليمات) لتوزيعه على الموظفين.
// شغّله من جذر المشروع:  node scripts/pack-employee.mjs
// ملاحظة: الإكستنشن يحمل DEFAULT_BACKEND الحالي من background.js — عدّله لرابط الإنتاج قبل التحزيم،
//         أو يضبط كل موظف الرابط من البوب (⚙ إعدادات الخادم).
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const README_TXT = [
  "حزمة الموظف — Khiam Ops",
  "",
  "المحتوى:",
  "  KhiamOps-Setup.exe   مثبّت البرنامج (دبل-كليك — يتسطّب ويشتغل في الخلفية)",
  "  extension/           إضافة كروم (تُحمّل Load unpacked)",
  "  install.bat          خطوات سريعة",
  "  agent/               مصدر البرنامج (بديل لو حبيت تشغّله ببايثون)",
  "",
  "التثبيت (3 خطوات):",
  "  1) البرنامج: دبل-كليك على KhiamOps-Setup.exe ← Next ← فعّل «تشغيل تلقائي مع ويندوز» ← تثبيت.",
  "     (لو ظهر تحذير ويندوز الأزرق: More info ← Run anyway)",
  "  2) الإضافة: كروم ← chrome://extensions ← Developer mode ← Load unpacked ← اختر مجلد extension.",
  "  3) الدخول: افتح أيقونة الإضافة والبرنامج ← ادخل باسم المستخدم وكلمة السر من الإدارة ← وافق على إشعار المتابعة.",
  "",
  "داخل البرنامج: فعّل «ابدأ المراقبة تلقائيًّا» — بعدها يشتغل لوحده في الخلفية مع علامة ✓.",
  "",
  "ملاحظة: النظام معلن — يسجّل الرسائل والتعليقات والأوردرات وحالة العمل أثناء الشيفت.",
].join("\r\n");

const INSTALL_BAT = [
  "@echo off",
  "chcp 65001 >nul",
  "echo ============================================",
  "echo    Khiam Ops - تثبيت حزمة الموظف",
  "echo ============================================",
  "echo.",
  "echo [1/3] البرنامج:",
  'if exist "%~dp0KhiamOps-Setup.exe" (',
  '  echo     شغّل المثبّت... (Next ثم فعّل: تشغيل تلقائي مع ويندوز)',
  '  start "" "%~dp0KhiamOps-Setup.exe"',
  ") else (",
  '  echo     المثبّت غير موجود - شغّل البرنامج ببايثون: python "%~dp0agent\\khiam_agent.py"',
  ")",
  "echo.",
  "echo [2/3] اضافة كروم:",
  "echo     1) افتح: chrome://extensions",
  "echo     2) فعّل: Developer mode (أعلى يمين)",
  'echo     3) Load unpacked واختر: "%~dp0extension"',
  "echo.",
  "echo [3/3] الدخول:",
  "echo     افتح ايقونة الاضافة والبرنامج ^> ادخل باسم المستخدم وكلمة السر ^> وافق على اشعار المتابعة.",
  "echo.",
  "pause",
].join("\r\n");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "release");
const pack = join(outDir, "khiam-employee-pack");
const zip = join(outDir, "khiam-employee-pack.zip");

await rm(pack, { recursive: true, force: true });
await rm(zip, { force: true });
await mkdir(pack, { recursive: true });

// 1) الإكستنشن (كل ملفات apps/extension — تُحمّل Load unpacked)
await cp(join(root, "apps/extension"), join(pack, "extension"), { recursive: true });

// 2) البرنامج (ملفات التشغيل فقط — بلا config.json الشخصي ولا الكاش)
await mkdir(join(pack, "agent"), { recursive: true });
for (const f of ["khiam_agent.py", "config.example.json", "requirements.txt", "README.md", "build_exe.bat", "khiam_installer.iss"]) {
  const src = join(root, "agent", f);
  if (existsSync(src)) await cp(src, join(pack, "agent", f));
}

// 2ب) المثبّت الجاهز (دبل-كليك) لو مبنيّ — ده المسار الأساسي للموظف (بلا بايثون)
const setupExe = join(root, "agent", "Output", "KhiamOps-Setup.exe");
if (existsSync(setupExe)) {
  await cp(setupExe, join(pack, "KhiamOps-Setup.exe"));
  console.log("  + KhiamOps-Setup.exe (مثبّت جاهز)");
} else {
  console.log("  ! KhiamOps-Setup.exe غير موجود — شغّل agent/build_installer.bat الأول لإضافته للحزمة.");
}

// 3) تعليمات + تثبيت (أسماء ASCII لتفادي تشويه ترميز أسماء الملفات في بعض أدوات الفك)
await writeFile(join(pack, "README.txt"), README_TXT, "utf8");
await writeFile(join(pack, "install.bat"), INSTALL_BAT, "utf8");

// 4) ضغط إلى zip
if (process.platform === "win32") {
  execFileSync("powershell", ["-NoProfile", "-Command", `Compress-Archive -Path "${pack}\\*" -DestinationPath "${zip}" -Force`], { stdio: "inherit" });
} else {
  execFileSync("zip", ["-r", zip, "."], { cwd: pack, stdio: "inherit" });
}
console.log("✅ تم:", zip);
