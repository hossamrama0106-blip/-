// تقييم جودة ردود خدمة العملاء.
// يستخدم Groq لو فيه GROQ_API_KEY، وإلا heuristic محلي (نفس الواجهة) — فالنظام يعمل كامل بدون مفاتيح.
import type { ReplyVerdict } from "@khiam/shared";

const GROQ_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

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
  source: "groq" | "local";
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

async function evaluateWithGroq(input: EvalInput): Promise<EvalResult> {
  const convo = (input.messages || [])
    .map((m) => `${m.role === "agent" ? "الموظف" : "العميل"}: ${m.text}`)
    .join("\n");
  const sys =
    'أنت مقيّم جودة خدمة عملاء لمتجر ملابس مصري. قيّم آخر رد من "الموظف". ' +
    'أعد JSON فقط بالشكل: {"verdict":"good|ok|bad","score":0-100,"notes":"سبب مختصر بالعربي","dealAtRisk":true|false}. ' +
    "good=ممتاز ومهذّب وأجاب، ok=مقبول، bad=مقتضب أو لم يجب أو غير مهذّب. dealAtRisk=true لو العميل عنده نية شراء ولم يُخدَم جيدًا.";
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: sys },
        { role: "user", content: convo },
      ],
    }),
  });
  if (!res.ok) throw new Error("groq " + res.status);
  const data: any = await res.json();
  const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
  const verdict: ReplyVerdict = ["good", "ok", "bad"].includes(parsed.verdict) ? parsed.verdict : "ok";
  return {
    verdict,
    score: Number(parsed.score) || 60,
    notes: String(parsed.notes || "تقييم Groq"),
    dealAtRisk: !!parsed.dealAtRisk,
    source: "groq",
  };
}

export async function evaluateReply(input: EvalInput): Promise<EvalResult> {
  if (GROQ_KEY) {
    try {
      return await evaluateWithGroq(input);
    } catch {
      // fallback للمحلي عند أي خطأ
    }
  }
  return evaluateLocal(input);
}

export const aiMode = () => (GROQ_KEY ? "groq" : "local");
