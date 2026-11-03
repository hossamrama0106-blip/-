// تحقق مدخلات خفيف بدون مكتبات — يرفض الإدخال المشوّه/الخبيث بـ ValidationError.
// app.onError يحوّلها إلى استجابة 400 نظيفة (بدل تمرير إدخال فاسد أو رمي 500).
// يناسب فلسفة المشروع صفر-اعتماديات (زي رسوم SVG الخالصة والإكستنشن بلا build).

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export type Rule = (value: unknown, field: string) => unknown;

function present(v: unknown): boolean {
  return v !== undefined && v !== null;
}

/** نص: min/max طول، trim افتراضي، optional، allowEmpty */
export function str(opts: { min?: number; max?: number; optional?: boolean; trim?: boolean; allowEmpty?: boolean } = {}): Rule {
  return (v, field) => {
    if (!present(v)) {
      if (opts.optional) return undefined;
      throw new ValidationError(`${field}: مطلوب`);
    }
    if (typeof v !== "string") throw new ValidationError(`${field}: يجب أن يكون نصًا`);
    const s = opts.trim === false ? v : v.trim();
    if (s === "" && !opts.allowEmpty) {
      if (opts.optional) return undefined;
      throw new ValidationError(`${field}: مطلوب`);
    }
    if (opts.min != null && s.length < opts.min) throw new ValidationError(`${field}: قصير جدًا (الحد الأدنى ${opts.min})`);
    if (opts.max != null && s.length > opts.max) throw new ValidationError(`${field}: طويل جدًا (الحد الأقصى ${opts.max})`);
    return s;
  };
}

/** رقم: int، min/max، optional. يرفض NaN/Infinity والنصوص غير الرقمية. */
export function num(opts: { int?: boolean; min?: number; max?: number; optional?: boolean } = {}): Rule {
  return (v, field) => {
    if (!present(v)) {
      if (opts.optional) return undefined;
      throw new ValidationError(`${field}: مطلوب`);
    }
    const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
    if (!Number.isFinite(n)) throw new ValidationError(`${field}: يجب أن يكون رقمًا`);
    if (opts.int && !Number.isInteger(n)) throw new ValidationError(`${field}: يجب أن يكون عددًا صحيحًا`);
    if (opts.min != null && n < opts.min) throw new ValidationError(`${field}: أصغر من الحد (${opts.min})`);
    if (opts.max != null && n > opts.max) throw new ValidationError(`${field}: أكبر من الحد (${opts.max})`);
    return n;
  };
}

/** قيمة بوليانية صريحة */
export function bool(opts: { optional?: boolean } = {}): Rule {
  return (v, field) => {
    if (!present(v)) {
      if (opts.optional) return undefined;
      throw new ValidationError(`${field}: مطلوب`);
    }
    if (typeof v !== "boolean") throw new ValidationError(`${field}: يجب أن يكون true/false`);
    return v;
  };
}

/** قيمة من مجموعة مسموحة (enum) */
export function oneOf(values: readonly string[], opts: { optional?: boolean } = {}): Rule {
  return (v, field) => {
    if (!present(v)) {
      if (opts.optional) return undefined;
      throw new ValidationError(`${field}: مطلوب`);
    }
    if (typeof v !== "string" || !values.includes(v)) throw new ValidationError(`${field}: قيمة غير مسموحة`);
    return v;
  };
}

/** قائمة بحد أقصى/أدنى للعناصر (المحتوى يُقصّ/يُعالج لاحقًا في الستور) */
export function arr(opts: { min?: number; max?: number; optional?: boolean } = {}): Rule {
  return (v, field) => {
    if (!present(v)) {
      if (opts.optional) return undefined;
      throw new ValidationError(`${field}: مطلوب`);
    }
    if (!Array.isArray(v)) throw new ValidationError(`${field}: يجب أن يكون قائمة`);
    if (opts.min != null && v.length < opts.min) throw new ValidationError(`${field}: عناصر قليلة (الحد الأدنى ${opts.min})`);
    if (opts.max != null && v.length > opts.max) throw new ValidationError(`${field}: عناصر كثيرة (الحد الأقصى ${opts.max})`);
    return v;
  };
}

/** تحقّق من جسم الطلب مقابل شكل محدّد؛ يرمي ValidationError عند أول خطأ. يتجاهل الحقول غير المعرّفة. */
export function parse<T = Record<string, unknown>>(raw: unknown, shape: Record<string, Rule>): T {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ValidationError("الطلب يجب أن يكون كائن JSON");
  const out: Record<string, unknown> = {};
  for (const key in shape) {
    const parsed = shape[key]((raw as Record<string, unknown>)[key], key);
    if (parsed !== undefined) out[key] = parsed;
  }
  return out as T;
}
