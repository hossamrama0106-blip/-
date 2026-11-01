// اختبار تحمّل بسيط: يضرب الـ API بطلبات متزامنة ويقيس الإنتاجية وزمن الاستجابة.
// الاستخدام: node test/loadtest.mjs [مدة_ms] [تزامن]
const BASE = process.env.BASE || "http://localhost:8787";
const DURATION_MS = Number(process.argv[2] || 8000);
const CONCURRENCY = Number(process.argv[3] || 50);

const login = await fetch(BASE + "/api/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ code: "ADMIN" }),
}).then((r) => r.json());
const H = { "content-type": "application/json", authorization: "Bearer " + login.token };

const emps = (await fetch(BASE + "/api/employees", { headers: H }).then((r) => r.json())).employees;
const ids = emps.map((e) => e.id);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

let ok = 0;
let err = 0;
const lat = [];
const started = Date.now();

async function oneReq() {
  const eid = pick(ids);
  const r = Math.random();
  const t0 = performance.now();
  try {
    let res;
    if (r < 0.5) res = await fetch(BASE + "/api/presence", { method: "POST", headers: H, body: JSON.stringify({ employeeId: eid, typing: true, typingWpm: 40, currentWindow: "loadtest", mouseMoved: true }) });
    else if (r < 0.8) res = await fetch(BASE + "/api/activity", { method: "POST", headers: H, body: JSON.stringify({ employeeId: eid, type: "reply", channel: "messenger" }) });
    else res = await fetch(BASE + "/api/leaderboard", { headers: H });
    if (!res.ok) err++;
    else ok++;
    lat.push(performance.now() - t0);
  } catch {
    err++;
  }
}

async function worker() {
  while (Date.now() - started < DURATION_MS) await oneReq();
}

await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

const dur = (Date.now() - started) / 1000;
lat.sort((a, b) => a - b);
const pct = (p) => (lat[Math.floor(lat.length * p)] ?? 0).toFixed(1);
console.log(`المدة=${dur.toFixed(1)}s تزامن=${CONCURRENCY}`);
console.log(`ناجح=${ok} أخطاء=${err} الإنتاجية=${(ok / dur).toFixed(0)} req/s`);
console.log(`زمن الاستجابة: p50=${pct(0.5)}ms p95=${pct(0.95)}ms p99=${pct(0.99)}ms max=${(lat[lat.length - 1] ?? 0).toFixed(1)}ms`);
