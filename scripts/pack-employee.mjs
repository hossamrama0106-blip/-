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
  "  extension/   إضافة كروم (تُحمّل Load unpacked)",
  "  agent/       برنامج ويندوز (اختياري — نافذة/خمول/لقطات)",
  "  تثبيت.bat   خطوات سريعة",
  "",
  "التثبيت:",
  "  1) كروم: chrome://extensions ← Developer mode ← Load unpacked ← اختر مجلد extension",
  "  2) افتح أيقونة الإضافة ← (أول مرة) ⚙ إعدادات الخادم ← حط رابط النظام ← حفظ",
  "  3) ادخل باسم المستخدم وكلمة السر من الإدارة ← وافق على إشعار المتابعة",
  "  4) (اختياري) البرنامج: افتح agent/config.json وحط backend/username/password ثم:",
  "     python agent/khiam_agent.py",
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
  "echo [1/3] برنامج الويندوز (Agent):",
  'if exist "%~dp0agent\\config.json" (',
  "  echo     - config.json موجود.",
  ") else (",
  '  copy "%~dp0agent\\config.example.json" "%~dp0agent\\config.json" >nul',
  "  echo     - اتعمل agent\\config.json  ^<^< افتحه وحط backend واسم المستخدم وكلمة السر.",
  ")",
  'echo     - للقطات الشاشة (اختياري): pip install -r "%~dp0agent\\requirements.txt"',
  "echo.",
  "echo [2/3] اضافة كروم:",
  "echo     1) افتح: chrome://extensions",
  "echo     2) فعّل: Developer mode",
  'echo     3) Load unpacked واختر: "%~dp0extension"',
  "echo     4) ايقونة الاضافة ^> (اول مرة) ⚙ اعدادات الخادم ^> حط رابط النظام",
  "echo.",
  "echo [3/3] الدخول:",
  "echo     ادخل باسم المستخدم وكلمة السر ^> وافق على اشعار المتابعة.",
  'echo     تشغيل البرنامج: python "%~dp0agent\\khiam_agent.py"',
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
