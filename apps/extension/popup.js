const send = (type, data) =>
  new Promise((resolve) => chrome.runtime.sendMessage({ type, data }, (r) => resolve(r || { ok: false })));

const $ = (id) => document.getElementById(id);
const views = { login: $("loginView"), consent: $("consentView"), session: $("sessionView") };
function show(name) {
  for (const k in views) views[k].classList.toggle("hide", k !== name);
}

async function refresh() {
  const r = await send("session");
  const s = r.ok ? r.data : null;
  if (!s) return show("login");
  if (s.consentRequired) {
    show("consent");
  } else {
    $("who").textContent = s.name || s.code;
    $("whoSub").textContent = "الكود: " + s.code;
    show("session");
  }
}

$("loginBtn").addEventListener("click", async () => {
  const code = $("code").value.trim();
  const whatsapp = $("whatsapp").value.trim();
  $("err").textContent = "";
  if (!code) { $("err").textContent = "اكتب الكود"; return; }
  $("loginBtn").textContent = "جارٍ الدخول…";
  const r = await send("login", { code, whatsapp });
  $("loginBtn").textContent = "دخول";
  if (!r.ok) { $("err").textContent = r.error === "كود غير صحيح" ? "كود غير صحيح" : (r.error || "فشل الدخول"); return; }
  refresh();
});

$("consentBtn").addEventListener("click", async () => {
  await send("consent");
  refresh();
});

$("logoutBtn").addEventListener("click", async () => {
  await send("logout");
  refresh();
});

refresh();
