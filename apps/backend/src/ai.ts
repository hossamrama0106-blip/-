// تقييم جودة ردود خدمة العملاء.
// يستخدم Groq لو فيه GROQ_API_KEY، وإلا heuristic محلي (نفس الواجهة) — فالنظام يعمل كامل بدون مفاتيح.
import type { ReplyVerdict } from "@khiam/shared";

export interface EvalMessage {
  role: "customer" | "agent" | string;
  text: string;
}
export interface EvalInput {
  messages: EvalMessage[];
  conversationRef?: string;
}
export interface EvalResult {
  verdict: ReplyVerdict;
  score: number; // 0..100
  notes: string;
  dealAtRisk: boolean;
  source: string; // اسم المزوّد الذي أنتج التقييم (groq/openrouter/gemini/local)
}

const POLITE = ["اهلا", "أهلا", "حضرتك", "تمام", "شكرا", "من فضلك", "لو سمحت", "يسعدنا", "ممنون", "👍", "🙏", "❤", "😊", "حاضر"];
const BUYING = ["سعر", "بكام", "المقاس", "مقاس", "الخامة", "خامة", "عايز", "اشتري", "هاخد", "التوصيل", "الشحن", "متوفر", "كاش", "فودافون", "انستا", "instapay"];
const QUESTION = ["؟", "?", "كام", "ازاي", "إزاي", "امتى", "فين", "هل", "متوفر", "ممكن"];

export function evaluateLocal(input: EvalInput): EvalResult {
  const msgs = input.messages || [];
  const lastAgent = [...msgs].reverse().find((m) => m.role === "agent");
  const lastCustomer = [...msgs].reverse().find((m) => m.role === "customer");
  const agentText = (lastAgent?.text || "").trim();
  const custText = (lastCustomer?.text || "").trim();

  // عميل بيتكلم والموظف لسه ما ردّش
  if (!agentText) {
    const dealAtRisk = BUYING.some((k) => custText.includes(k));
    return {
      verdict: "bad",
      score: 25,
      notes: "لا يوجد رد من الموظف" + (dealAtRisk ? " على عميل عنده نية شراء" : ""),
      dealAtRisk,
      source: "local",
    };
  }

  let score = 60;
  const notes: string[] = [];
  const len = agentText.length;

  if (len < 4) {
    score -= 35;
    notes.push("رد مقتضب جدًا");
  } else if (len > 15) {
    score += 8;
  }

  if (POLITE.some((k) => agentText.includes(k))) {
    score += 15;
    notes.push("مهذّب");
  } else {
    score -= 10;
    notes.push("بدون ترحيب");
  }

  if (QUESTION.some((k) => custText.includes(k))) {
    const hasInfo = /[0-9]/.test(agentText) || len > 20;
    if (hasInfo) {
      score += 15;
      notes.push("أجاب على الاستفسار");
    } else {
      score -= 15;
      notes.push("لم يجب على سؤال العميل بوضوح");
    }
  }

  const dealAtRisk = BUYING.some((k) => custText.includes(k)) && len < 10;
  if (dealAtRisk) notes.push("عميل عنده نية شراء ولم يُخدَم جيدًا");

  score = Math.max(5, Math.min(100, score));
  const verdict: ReplyVerdict = score >= 75 ? "good" : score >= 55 ? "ok" : "bad";
  return { verdict, score, notes: notes.join("، ") || "رد عادي", dealAtRisk, source: "local" };
}

// ---------- تصنيف تعليقات (بوت التعليقات) ----------
const ANGER = ["وحش", "زفت", "نصب", "نصابين", "احتيال", "زعلان", "غاضب", "سيئ", "سيء", "تأخير", "متأخر", "فين طلبي", "مردّيتوش", "مردتوش", "مبترّدوش", "شكوى", "بلاغ", "زباله", "زبالة", "خيبة", "وحشين"];

export interface CommentClass {
  priority: "normal" | "high" | "vip";
  intent: string;
  sentiment: "pos" | "neu" | "neg";
}

/** تصنيف تعليق محليًّا (فوري، بلا تكلفة): أولوية + نية + مشاعر — لتغذية الطابور. */
export function classifyComment(text: string): CommentClass {
  const t = (text || "").trim();
  if (BUYING.some((k) => t.includes(k))) return { priority: "vip", intent: "نية شراء", sentiment: "pos" };
  if (ANGER.some((k) => t.includes(k))) return { priority: "high", intent: "شكوى/غضب", sentiment: "neg" };
  if (QUESTION.some((k) => t.includes(k))) return { priority: "high", intent: "استفسار", sentiment: "neu" };
  return { priority: "normal", intent: "تعليق", sentiment: "neu" };
}

// موجّه متعدد المزوّدين (AI Fallback Router): يجرّب المزوّدين المتاحين بالترتيب وينزل للتقييم المحلي.
const SYS =
  'أنت مقيّم جودة خدمة عملاء لمتجر ملابس مصري. قيّم آخر رد من "الموظف". ' +
  'أعد JSON فقط: {"verdict":"good|ok|bad","score":0-100,"notes":"سبب مختصر بالعربي","dealAtRisk":true|false}. ' +
  "good=ممتاز ومهذّب وأجاب، ok=مقبول، bad=مقتضب أو لم يجب أو غير مهذّب. dealAtRisk=true لو العميل عنده نية شراء ولم يُخدَم جيدًا.";

function buildConvo(input: EvalInput): string {
  return (input.messages || []).map((m) => `${m.role === "agent" ? "الموظف" : "العميل"}: ${m.text}`).join("\n");
}

function parseResult(txt: string): EvalResult {
  const parsed = JSON.parse(txt || "{}");
  const verdict: ReplyVerdict = ["good", "ok", "bad"].includes(parsed.verdict) ? parsed.verdict : "ok";
  return { verdict, score: Number(parsed.score) || 60, notes: String(parsed.notes || ""), dealAtRisk: !!parsed.dealAtRisk, source: "local" };
}

// Groq و OpenRouter متوافقان مع واجهة OpenAI
async function evalOpenAICompat(input: EvalInput, url: string, key: string, model: string): Promise<EvalResult> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYS },
        { role: "user", content: buildConvo(input) },
      ],
    }),
  });
  if (!res.ok) throw new Error("ai " + res.status);
  const data: any = await res.json();
  return parseResult(data.choices?.[0]?.message?.content || "{}");
}

async function evalGemini(input: EvalInput, key: string, model: string): Promise<EvalResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: SYS + "\n\n" + buildConvo(input) }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
    }),
  });
  if (!res.ok) throw new Error("gemini " + res.status);
  const data: any = await res.json();
  return parseResult(data.candidates?.[0]?.content?.parts?.[0]?.text || "{}");
}

interface Provider {
  name: string;
  run: (input: EvalInput) => Promise<EvalResult>;
}

function providers(): Provider[] {
  const list: Provider[] = [];
  const groq = process.env.GROQ_API_KEY;
  const openrouter = process.env.OPENROUTER_API_KEY;
  const gemini = process.env.GEMINI_API_KEY;
  if (groq) list.push({ name: "groq", run: (i) => evalOpenAICompat(i, "https://api.groq.com/openai/v1/chat/completions", groq, process.env.GROQ_MODEL || "openai/gpt-oss-120b") });
  if (openrouter) list.push({ name: "openrouter", run: (i) => evalOpenAICompat(i, "https://openrouter.ai/api/v1/chat/completions", openrouter, process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free") });
  if (gemini) list.push({ name: "gemini", run: (i) => evalGemini(i, gemini, process.env.GEMINI_MODEL || "gemini-1.5-flash") });
  return list;
}

export async function evaluateReply(input: EvalInput): Promise<EvalResult> {
  for (const p of providers()) {
    try {
      const r = await p.run(input);
      return { ...r, source: p.name };
    } catch {
      // جرّب المزوّد التالي عند أي خطأ/امتلاء حد
    }
  }
  return evaluateLocal(input);
}

export function aiMode(): string {
  const names = providers().map((p) => p.name);
  return names.length ? names.join("→") + "→local" : "local";
}
