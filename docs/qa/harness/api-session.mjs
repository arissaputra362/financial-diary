const BASE = process.env.QA_BASE || "http://localhost:3010";
const out = [];
const rec = (id, name, pass, detail) => { out.push({ id, name, pass, detail }); console.log(`${pass ? "PASS" : "FAIL"} [${id}] ${name} :: ${detail}`); };
const cookieOf = (r) => (typeof r.headers.getSetCookie === "function" ? r.headers.getSetCookie() : []).map((c) => c.split(";")[0]).join("; ");
async function req(path, { method = "GET", cookie, body } = {}) {
  const headers = {}; if (cookie) headers.cookie = cookie; if (body) headers["content-type"] = "application/json";
  const r = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data, cookie: cookieOf(r) };
}
const login = (email, password) => req("/api/auth/login", { method: "POST", body: { email, password } });

const l = await login("qa-owner@test.local", "QATest123!");
rec("SES-1", "login -> 200 + cookie", l.status === 200 && !!l.cookie, `status=${l.status}`);
const me1 = await req("/api/auth/me", { cookie: l.cookie });
rec("SES-2", "GET /me authenticated -> 200", me1.status === 200, `status=${me1.status}`);
const badCookie = await req("/api/auth/me", { cookie: "financial_planner_session=not-a-jwt" });
rec("SES-3", "invalid token -> 401", badCookie.status === 401, `status=${badCookie.status}`);
const lo = await req("/api/auth/logout", { method: "POST", cookie: l.cookie });
rec("SES-4", "logout -> 200", lo.status === 200, `status=${lo.status} setCookie=${lo.cookie ? "clear" : "none"}`);
const meAfter = await req("/api/auth/me", { cookie: l.cookie });
rec("SES-5", "old session after logout -> 401 (revoked)", meAfter.status === 401, `status=${meAfter.status}`);
const l2 = await login("qa-owner@test.local", "QATest123!");
const me2 = await req("/api/auth/me", { cookie: l2.cookie });
rec("SES-6", "re-login -> new session works", l2.status === 200 && me2.status === 200, `login=${l2.status} me=${me2.status}`);

const summary = { pass: out.filter((r) => r.pass).length, fail: out.filter((r) => !r.pass).length, results: out };
const fs = await import("node:fs"); fs.writeFileSync("docs/qa/harness/results-session.json", JSON.stringify(summary, null, 2));
console.log(`\nSUMMARY pass=${summary.pass} fail=${summary.fail}`);
