// بوت التعليقات — يجلب تعليقات صفحة/حساب الأعمال عبر Meta Graph API (المسار الرسمي المتوافق مع الشروط).
// نائم بدون META_PAGE_ACCESS_TOKEN (زي R2/واتساب). بدون أي مكتبة — fetch خام.
// المحرّك نفسه (التصنيف + الطابور) يعمل كمان عبر POST /api/comments/ingest لأي مصدر (ويبهوك/سكربت).

const TOKEN = process.env.META_PAGE_ACCESS_TOKEN || "";
const PAGE_ID = process.env.META_PAGE_ID || "me";
const VER = process.env.META_GRAPH_VERSION || "v21.0";
const POLL_MS = Math.max(20000, Number(process.env.COMMENTS_POLL_MS || 60000));
const FEED_LIMIT = Math.max(1, Number(process.env.COMMENTS_FEED_LIMIT || 10));

/** مربوط؟ (توكن صفحة ميتا موجود) */
export const commentsEnabled = (): boolean => !!TOKEN;
/** كل قد إيه يفحص (مللي ثانية) */
export const commentsPollMs = (): number => POLL_MS;

export interface RawComment {
  id: string;
  text: string;
  from: string;
  link: string | null;
  postId: string | null;
  createdTime: string | null;
}

/** يجلب أحدث التعليقات عبر آخر منشورات الصفحة. أفضل جهد — يرجّع [] عند أي خطأ (ما يكسرش البولر). */
export async function fetchComments(): Promise<RawComment[]> {
  if (!commentsEnabled()) return [];
  const fields = "id,permalink_url,comments.limit(25){id,message,from,created_time,permalink_url}";
  const url =
    `https://graph.facebook.com/${VER}/${encodeURIComponent(PAGE_ID)}/feed` +
    `?fields=${encodeURIComponent(fields)}&limit=${FEED_LIMIT}&access_token=${encodeURIComponent(TOKEN)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error("graph " + res.status);
    const data: any = await res.json();
    const out: RawComment[] = [];
    for (const post of data.data || []) {
      const postId = post.id || null;
      for (const c of post.comments?.data || []) {
        if (!c?.id || !c?.message) continue;
        out.push({
          id: String(c.id),
          text: String(c.message),
          from: c.from?.name || "",
          link: c.permalink_url || post.permalink_url || null,
          postId,
          createdTime: c.created_time || null,
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}
