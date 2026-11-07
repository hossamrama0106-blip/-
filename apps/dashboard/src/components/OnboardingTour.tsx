// جولة تعريفية للإدارة — تظهر أول دخول (مرة واحدة)، وتُعاد من زر ؟ في الشريط العلوي.
// تشرح كل قسم في الداشبورد. حسّاسة للدور: شرائح المدير فقط تُخفى عن قائد الفريق.
import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useDash } from "../store";

const SEEN_KEY = "khiam_onboard_v1";

interface Slide {
  icon: string;
  title: string;
  body: string;
  adminOnly?: boolean;
}

const SLIDES: Slide[] = [
  { icon: "👋", title: "أهلاً بك في Khiam Ops", body: "لوحة إدارة فريق خدمة العملاء — مراقبة معلنة بموافقة. الجولة دي بتشرحلك كل قسم بسرعة. تقدر تعيدها في أي وقت من زر ؟ فوق." },
  { icon: "📊", title: "الشريط العلوي", body: "مؤشرات لحظية: الرسائل والتعليقات غير المقروءة، طابور ميتا، عدد الموظفين النشطين. لمّا المتبقّي يزيد عن 25 بيظهر وضع الذروة 🔥." },
  { icon: "👥", title: "الفريق المباشر", body: "لكل موظف بطاقة: حالته الآن (بيكتب / داخل محادثة / يشاهد / خامل / غير متصل)، عدّاداته (رسائل، تعليقات، أوردرات)، وآخر نشاط. اضغط أي بطاقة لكل التفاصيل." },
  { icon: "📋", title: "طابور ميتا الإجباري", body: "المحادثات الواردة بتتوزّع على الموظفين بالترتيب (المميّز أولاً). بتشوف مين بيعالج إيه، كام منتظر، ومتوسط الانتظار والمعالجة." },
  { icon: "🏆", title: "المقارنة والترتيب", body: "ترتيب الفريق: الأفضل والأضعف أداءً، الأكثر ردًّا وأوردرات، أسرع رد. يساعدك تدير بالاستثناء بدل متابعة الكل." },
  { icon: "🖥️", title: "لوحة الموظف", body: "عند الضغط على موظف: الخط الزمني لكل خطوة، آخر لقطة شاشة، تقييمات ردوده 🟢🟡🔴، مخالفاته، تفعيل المراقبة الفائقة، وتصدير تقريره للواتساب." },
  { icon: "📄", title: "التقارير والسجلات", body: "📊 مؤشرات الأداء (رسوم) · 📄 التقرير اليومي للفريق · 🧾 سجل التدقيق (أثر كل فعل إدارة). كلها من أزرار الشريط العلوي." },
  { icon: "🌙", title: "الرادار الليلي", body: "لمّا تفعّله، يرصد الخمول والترفيه تلقائيًا ويسجّل مخالفات — مفيد في الشيفتات المسائية أو ساعات الضغط المنخفض." },
  { icon: "📢", title: "النداء الصوتي", body: "ابعت رسالة منطوقة لكل الموظفين فورًا من زر 📢 — زي اللاسلكي، بتتنطق عندهم في المتصفح مباشرةً." },
  { icon: "⚙️", title: "الإعدادات والتكاملات", body: "من زر ⚙️: ربط Groq (تقييم ذكي) و R2 (تخزين اللقطات) وواتساب، وضبط عتبات التنبيهات. (المدير فقط)", adminOnly: true },
  { icon: "➕", title: "إضافة الفريق", body: "أضف كل موظف من زر ➕ إضافة موظف — باسم مستخدم وكلمة سر ودور (موظف / قائد فريق / مدير). (المدير فقط)", adminOnly: true },
  { icon: "✅", title: "جاهز للبدء", body: "دي كل الأساسيات. أول ما الموظفون يفتحوا الإكستنشن والبرنامج هيظهروا «متصل» وتبدأ المتابعة. بالتوفيق!" },
];

export default function OnboardingTour() {
  const { showTour, setShowTour, role } = useDash(
    useShallow((s) => ({ showTour: s.showTour, setShowTour: s.setShowTour, role: s.role })),
  );
  const slides = useMemo(() => SLIDES.filter((s) => !s.adminOnly || role === "admin"), [role]);
  const [i, setI] = useState(0);

  useEffect(() => {
    if (showTour) setI(0);
  }, [showTour]);

  if (!showTour) return null;
  const idx = Math.min(i, slides.length - 1);
  const s = slides[idx];
  const last = idx >= slides.length - 1;

  function close() {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* الوضع الخاص قد يمنع التخزين */
    }
    setShowTour(false);
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4" onClick={close}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg bg-ink-850 border border-ink-700 rounded-2xl p-7 shadow-2xl">
        <div className="flex justify-between items-center mb-2">
          <div className="text-xs text-slate-500">جولة تعريفية · {idx + 1}/{slides.length}</div>
          <button onClick={close} className="text-slate-400 hover:text-white text-xl leading-none px-2" title="إغلاق">✕</button>
        </div>

        <div className="text-center py-6">
          <div className="text-6xl mb-4">{s.icon}</div>
          <div className="text-xl font-extrabold text-white mb-2">{s.title}</div>
          <div className="text-slate-300 leading-7 text-sm max-w-md mx-auto">{s.body}</div>
        </div>

        <div className="flex justify-center gap-1.5 mb-5">
          {slides.map((_, k) => (
            <span key={k} className={`h-1.5 rounded-full transition-all ${k === idx ? "w-6 bg-brand-400" : "w-1.5 bg-ink-700"}`} />
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={close} className="text-sm text-slate-400 hover:text-white px-3 py-2">تخطّي</button>
          <div className="flex-1" />
          {idx > 0 && (
            <button onClick={() => setI(idx - 1)} className="text-sm bg-ink-800 border border-ink-700 rounded-lg px-4 py-2 text-slate-200 hover:bg-ink-700">
              السابق
            </button>
          )}
          <button onClick={() => (last ? close() : setI(idx + 1))} className="text-sm bg-brand-500 hover:bg-brand-400 text-white rounded-lg px-5 py-2 font-bold">
            {last ? "ابدأ ✅" : "التالي"}
          </button>
        </div>
      </div>
    </div>
  );
}
