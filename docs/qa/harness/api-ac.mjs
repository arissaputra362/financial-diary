/*
  T-006 API-level integration harness (QA-owned, not a deliverable).
  Drives the running Next app over HTTP with a real cookie. Evidence: results JSON.
*/
const BASE = process.env.QA_BASE || "http://localhost:3000";
const results = [];
function rec(id, name, pass, detail) {
  results.push({ id, name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} [${id}] ${name} :: ${detail}`);
}
const today = () => new Date().toISOString().slice(0, 10);
const future = () => new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);

async function login(email, password) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }),
  });
  let body = null; try { body = await r.json(); } catch {}
  const setc = typeof r.headers.getSetCookie === "function" ? r.headers.getSetCookie() : [];
  const cookie = setc.map((c) => c.split(";")[0]).join("; ");
  return { status: r.status, body, cookie, setCookieCount: setc.length };
}
async function api(path, { method = "GET", cookie, body, headers = {} } = {}) {
  const h = { ...headers };
  if (body !== undefined && !h["content-type"]) h["content-type"] = "application/json";
  if (cookie) h.cookie = cookie;
  const r = await fetch(`${BASE}${path}`, { method, headers: h, body: body === undefined ? undefined : (typeof body === "string" ? body : JSON.stringify(body)) });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data, setCookie: (typeof r.headers.getSetCookie === "function" ? r.headers.getSetCookie() : []).length };
}
const key = () => crypto.randomUUID();

async function main() {
  // ── Auth baseline (T-004 regression) ──
  const bad = await login("nobody@test.local", "WrongPass123!");
  rec("AUTH-1", "login wrong creds -> 401", bad.status === 401, `status=${bad.status}`);

  const owner = await login("qa-owner@test.local", "QATest123!");
  rec("AUTH-2", "owner login -> 200 OPEN_HOME + cookie", owner.status === 200 && owner.body?.nextAction === "OPEN_HOME" && owner.setCookieCount > 0, `status=${owner.status} nextAction=${owner.body?.nextAction} cookies=${owner.setCookieCount}`);

  const noAuth = await api("/api/transactions");
  rec("AUTH-3", "GET /api/transactions no cookie -> 401", noAuth.status === 401, `status=${noAuth.status}`);

  const list0 = await api("/api/transactions", { cookie: owner.cookie });
  const activeRows = list0.data?.rows ?? [];
  rec("AUTH-4", "owner list loads active rows", list0.status === 200 && activeRows.length >= 5, `status=${list0.status} rows=${activeRows.length}`);

  const pending = await login("qa-pending@test.local", "QATest123!");
  const pendingList = await api("/api/transactions", { cookie: pending.cookie });
  rec("AUTH-5", "non-approved member -> 403 ACCESS_PENDING", pendingList.status === 403 && pendingList.data?.error?.code === "ACCESS_PENDING", `status=${pendingList.status} code=${pendingList.data?.error?.code}`);

  // ── Manual transaction happy path (T1) ──
  const m1 = await api("/api/transactions", { method: "POST", cookie: owner.cookie, body: { type: "MONEY_OUT", amountMinor: 50000, category: "food", occurredAt: today(), merchant: "QA Harness Merchant" } });
  const created = m1.data?.transactions?.[0];
  rec("TX-1", "manual MONEY_OUT create -> 201 + DTO", m1.status === 201 && created?.amountMinor === 50000 && created?.source === "MANUAL" && "amountMinor" in created, `status=${m1.status} amount=${created?.amountMinor}`);  const futureCreate = await api("/api/transactions", { method: "POST", cookie: owner.cookie, body: { type: "MONEY_OUT", amountMinor: 1000, category: "food", occurredAt: future() } });
  rec("TX-2", "future occurredAt -> 422", futureCreate.status === 422, `status=${futureCreate.status} code=${futureCreate.data?.error?.code} field=${JSON.stringify(futureCreate.data?.error?.fieldErrors)}`);

  // ── Boundaries (AC-F3-1) ──
  const cases = [
    ["BD-1", "amount 0 -> 422", { type: "MONEY_OUT", amountMinor: 0, category: "food", occurredAt: today() }],
    ["BD-2", "amount -1 -> 422", { type: "MONEY_OUT", amountMinor: -1, category: "food", occurredAt: today() }],
    ["BD-3", "amount 2147483648 -> 422 AMOUNT_OUT_OF_RANGE", { type: "MONEY_OUT", amountMinor: 2147483648, category: "food", occurredAt: today() }],
    ["BD-4", "invalid category -> 422", { type: "MONEY_OUT", amountMinor: 1000, category: "not_a_category", occurredAt: today() }],
    ["BD-5", "note > 500 -> 422", { type: "MONEY_OUT", amountMinor: 1000, category: "food", occurredAt: today(), note: "x".repeat(501) }],
    ["BD-6", "merchant > 120 -> 422", { type: "MONEY_OUT", amountMinor: 1000, category: "food", occurredAt: today(), merchant: "x".repeat(121) }],
  ];
  for (const [id, name, payload] of cases) {
    const r = await api("/api/transactions", { method: "POST", cookie: owner.cookie, body: payload });
    const expectedCode = id === "BD-3" ? "AMOUNT_OUT_OF_RANGE" : "VALIDATION_ERROR";
    rec(id, name, r.status === 422 && (id !== "BD-3" || r.data?.error?.code === expectedCode), `status=${r.status} code=${r.data?.error?.code}`);
  }

  // max valid amount accepted
  const maxOk = await api("/api/transactions", { method: "POST", cookie: owner.cookie, body: { type: "MONEY_IN", amountMinor: 2147483647, category: "income", occurredAt: today() } });
  rec("BD-7", "amount = int32 max accepted -> 201", maxOk.status === 201, `status=${maxOk.status}`);

  // ── Idempotency (AC-F3-8) ──
  const payload = { type: "MONEY_OUT", amountMinor: 12345, category: "food", occurredAt: today(), merchant: "Idem Test" };
  const k1 = key();
  const idem1 = await api("/api/transactions", { method: "POST", cookie: owner.cookie, headers: { "idempotency-key": k1 }, body: payload });
  const idem2 = await api("/api/transactions", { method: "POST", cookie: owner.cookie, headers: { "idempotency-key": k1 }, body: payload });
  rec("IDEM-1", "same key + same payload -> replay identical", idem1.status === 201 && idem2.status === 201 && JSON.stringify(idem1.data) === JSON.stringify(idem2.data), `s1=${idem1.status} s2=${idem2.status}`);
  const idem3 = await api("/api/transactions", { method: "POST", cookie: owner.cookie, headers: { "idempotency-key": k1 }, body: { ...payload, amountMinor: 99999 } });
  rec("IDEM-2", "same key + different payload -> 409 IDEMPOTENCY_CONFLICT", idem3.status === 409 && idem3.data?.error?.code === "IDEMPOTENCY_CONFLICT", `status=${idem3.status} code=${idem3.data?.error?.code}`);

  // ── Soft delete + restore (AC-F5) ──
  const target = await api("/api/transactions", { method: "POST", cookie: owner.cookie, body: { type: "MONEY_OUT", amountMinor: 777, category: "other", occurredAt: today(), merchant: "Delete Me" } });
  const tid = target.data?.transactions?.[0]?.id;
  const del = await api(`/api/transactions/${tid}/trash`, { method: "POST", cookie: owner.cookie });
  rec("DEL-1", "soft delete -> 200", del.status === 200, `status=${del.status}`);
  const afterDel = await api("/api/transactions", { cookie: owner.cookie });
  const stillActive = (afterDel.data?.rows ?? []).some((r) => r.id === tid);
  const trash = await api("/api/transactions/trash", { cookie: owner.cookie });
  const inTrash = (trash.data?.rows ?? []).some((r) => r.id === tid);
  rec("DEL-2", "deleted row hidden from active, present in trash", !stillActive && inTrash, `activeHas=${stillActive} trashHas=${inTrash}`);
  const delAgain = await api(`/api/transactions/${tid}/trash`, { method: "POST", cookie: owner.cookie });
  rec("DEL-3", "double trash -> 200 ALREADY_DELETED", delAgain.status === 200 && delAgain.data?.error?.code === "ALREADY_DELETED", `status=${delAgain.status} code=${delAgain.data?.error?.code} body=${JSON.stringify(delAgain.data)}`);
  const restore = await api(`/api/transactions/${tid}/restore`, { method: "POST", cookie: owner.cookie });
  rec("DEL-4", "restore -> 200", restore.status === 200, `status=${restore.status}`);
  const restoreAgain = await api(`/api/transactions/${tid}/restore`, { method: "POST", cookie: owner.cookie });
  rec("DEL-5", "restore already-active -> 200 ALREADY_ACTIVE", restoreAgain.status === 200 && restoreAgain.data?.error?.code === "ALREADY_ACTIVE", `status=${restoreAgain.status} code=${restoreAgain.data?.error?.code} body=${JSON.stringify(restoreAgain.data)}`);

  // ── Cross-household isolation (AC-F5-7) ──
  const ownerB = await login("qa-owner-b@test.local", "QATest123!");
  const crossDel = await api(`/api/transactions/${tid}/trash`, { method: "POST", cookie: ownerB.cookie });
  rec("XH-1", "cross-household trash by id -> 404 (not 403)", crossDel.status === 404 && crossDel.data?.error?.code === "NOT_FOUND", `status=${crossDel.status} code=${crossDel.data?.error?.code}`);
  const bList = await api("/api/transactions", { cookie: ownerB.cookie });
  const bRows = bList.data?.rows ?? [];
  const leaked = bRows.some((r) => r.merchant === "QA Harness Merchant" || r.merchant === "Toko Dihapus");
  rec("XH-2", "household B list does not leak A rows", bRows.length >= 1 && !leaked, `B rows=${bRows.length} leaked=${leaked}`);
  const invalidId = await api(`/api/transactions/not-a-uuid/trash`, { method: "POST", cookie: owner.cookie });
  rec("XH-3", "malformed id -> 400", invalidId.status === 400, `status=${invalidId.status} code=${invalidId.data?.error?.code}`);

  // ── Transfer (AC-F3-3) — expected to expose the schema conflict ──
  const transfer = await api("/api/transactions", { method: "POST", cookie: owner.cookie, body: { type: "TRANSFER", amountMinor: 300000, occurredAt: today() } });
  const legs = transfer.data?.transactions ?? [];
  rec("TRF-1", "transfer create -> 201 with 2 legs", transfer.status === 201 && legs.length === 2, `status=${transfer.status} legs=${legs.length} body=${JSON.stringify(transfer.data).slice(0, 300)}`);

  // ── DB dtype check via API list (AC-F3-2) ──
  const listFinal = await api("/api/transactions", { cookie: owner.cookie });
  const sample = (listFinal.data?.rows ?? []).find((r) => r.amountMinor === 50000);
  rec("DTO-1", "DTO uses amountMinor integer + suffix", sample !== undefined && Number.isInteger(sample.amountMinor), `sample=${JSON.stringify(sample)}`);

  const summary = { base: BASE, at: new Date().toISOString(), pass: results.filter((r) => r.pass).length, fail: results.filter((r) => !r.pass).length, results };
  const fs = await import("node:fs");
  fs.writeFileSync("docs/qa/harness/results-api.json", JSON.stringify(summary, null, 2));
  console.log(`\nSUMMARY pass=${summary.pass} fail=${summary.fail} total=${results.length}`);
}
main().catch((e) => { console.error("HARNESS ERROR", e); process.exit(1); });
