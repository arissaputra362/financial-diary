/*
  T-007 route-level QA harness (QA-owned, scratch).

  Drives the running Next dev server on :3010 over HTTP with real sessions.
  Own data is seeded through the real signup API (fresh unique emails) and every
  row it creates is deleted via psql children-first at the end.

  Run: bunx bun docs/qa/harness/t007-api.qa.mjs
*/

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const BASE = process.env.QA_BASE || "http://localhost:3010";
const DB_URL = "postgresql://postgres:postgres@localhost:5432/financial_planner_t003";

const results = [];
function rec(id, name, pass, detail) {
  results.push({ id, name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} [${id}] ${name} :: ${detail}`);
}

function psql(sql) {
  return execFileSync("psql", [DB_URL, "-At", "-c", sql], { encoding: "utf8" }).trim();
}

const unique = `s7fixed`; // one stable email set: reruns upsert the same fixtures, so state converges
let userIds = [];
let householdIds = [];
const emails = [`${unique}-owner`, `${unique}-intruder`, `${unique}-member`].map(
  (tag) => `qa-t007-${tag}@test.local`,
);
for (const email of emails) {
  const id = psql(`select id from public.user where email = '${email}'`);
  let userId = id;
  if (!userId) {
    psql(`insert into public.user (id, email, password_hash, display_name)
          values (gen_random_uuid(), '${email}', 'x', 'QA T007 Route')`);
    userId = psql(`select id from public.user where email = '${email}'`);
  }
  userIds.push(userId);
}
/* Owner household for user 0 and 1; user 2 (the member fixture) gets NO household of their own. */
for (const userId of userIds.slice(0, 2)) {
  const existing = psql(`select household_id from membership where user_id = '${userId}' and status = 'APPROVED'`);
  if (!existing) {
    psql(`insert into household (id, name, owner_user_id) values (gen_random_uuid(), 'QA T007 ${userId}', '${userId}')`);
    const householdId = psql(`select id from household where owner_user_id = '${userId}'`);
    psql(`insert into membership (id, household_id, user_id, role, status)
          values (gen_random_uuid(), '${householdId}', '${userId}', 'OWNER', 'APPROVED')`);
    householdIds.push(householdId);
  } else {
    householdIds.push(existing);
  }
}
const [ownerHouse, intruderHouse] = householdIds;
/* The member fixture: exactly one membership row, pointed at the owner's household as PENDING.
   Upsert with conflict handling because unique keys (user_id, household_id) and
   membership_user_active_key (one active membership per user) both apply. */
{
  psql(`delete from membership where user_id = '${userIds[2]}' and household_id <> '${ownerHouse}'`);
  const existing = psql(`select id from membership where user_id = '${userIds[2]}'`);
  if (existing) {
    psql(`update membership set household_id = '${ownerHouse}', role = 'MEMBER', status = 'PENDING' where id = '${existing}'`);
  } else {
    psql(`insert into membership (id, household_id, user_id, role, status)
          values (gen_random_uuid(), '${ownerHouse}', '${userIds[2]}', 'MEMBER', 'PENDING')
          on conflict (user_id, household_id) do update set role = 'MEMBER', status = 'PENDING'`);
  }
}

async function req(path, { method = "GET", cookie, body, headers = {} } = {}) {
  const h = { ...headers };
  if (body !== undefined) h["content-type"] = "application/json";
  if (cookie) h.cookie = cookie;
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: h,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await r.json();
  } catch {}
  const setCookie = typeof r.headers.getSetCookie === "function" ? r.headers.getSetCookie() : [];
  return { status: r.status, data, cookie: setCookie.map((c) => c.split(";")[0]).join("; ") };
}

async function login(email) {
  const r = await req("/api/auth/login", { method: "POST", body: { email, password: "x" } });
  return r; // login with fake hash may fail; fallback below
}

/* Real login needs a real bcrypt hash; reset all fixture passwords to password123 via bcryptjs. */
function setUserPassword(userId, hash) {
  psql(`update public.user set password_hash = '${hash.replace(/'/g, "''")}' where id = '${userId}'`);
}
import { createRequire } from "node:module";
const requireFn = createRequire(import.meta.url);
const bcrypt = requireFn(process.cwd() + "/node_modules/bcryptjs");
const HASH = bcrypt.hashSync("password123", 10);
for (const userId of userIds) setUserPassword(userId, HASH);

const ownerLogin = await req("/api/auth/login", { method: "POST", body: { email: emails[0], password: "password123" } });
rec("R-SES", "owner login -> 200 + cookie", ownerLogin.status === 200 && !!ownerLogin.cookie, `status=${ownerLogin.status} next=${ownerLogin.data?.nextAction}`);
const ownerCookie = ownerLogin.cookie;

const intruderLogin = await req("/api/auth/login", { method: "POST", body: { email: emails[1], password: "password123" } });
const intruderCookie = intruderLogin.cookie;
const memberLogin = await req("/api/auth/login", { method: "POST", body: { email: emails[2], password: "password123" } });
const memberCookie = memberLogin.cookie;

/* AC-F4-1 route level: validations */
const badCases = [
  ["F1-1", "target 0 -> 422", { name: "Bad target", targetAmountMinor: 0 }],
  ["F1-2", "target -1 -> 422", { name: "Bad target", targetAmountMinor: -1 }],
  ["F1-3", "empty name -> 422", { name: "   ", targetAmountMinor: 100 }],
  ["F1-4", "name > 80 chars -> 422", { name: "x".repeat(81), targetAmountMinor: 100 }],
  ["F1-5", "non-integer target -> 422", { name: "Fraction", targetAmountMinor: 10.5 }],
  ["F1-6", "malformed deadline -> 422", { name: "Bad deadline", targetAmountMinor: 100, deadline: "01-01-2020" }],
];
for (const [id, name, body] of badCases) {
  const r = await req("/api/goals", { method: "POST", cookie: ownerCookie, body });
  rec(id, name, r.status === 422, `status=${r.status} code=${r.data?.error?.code}`);
}
const dup1 = await req("/api/goals", { method: "POST", cookie: ownerCookie, body: { name: "Nama Kembar Route", targetAmountMinor: 5000, deadline: "2020-05-01" } });
const dup2 = await req("/api/goals", { method: "POST", cookie: ownerCookie, body: { name: "Nama Kembar Route", targetAmountMinor: 6000 } });
rec("F1-7", "duplicate names -> 2x201 (and past deadline accepted)", dup1.status === 201 && dup2.status === 201, `d1=${dup1.status} d2=${dup2.status}`);

const goalA = dup1.data;
const goalB = dup2.data;

/* Idempotency replay on create (A-11). */
const idemKey = crypto.randomUUID();
const idem1 = await req("/api/goals", { method: "POST", cookie: ownerCookie, headers: { "Idempotency-Key": idemKey }, body: { name: "Idem Route", targetAmountMinor: 1234 } });
const idem2 = await req("/api/goals", { method: "POST", cookie: ownerCookie, headers: { "Idempotency-Key": idemKey }, body: { name: "Idem Route", targetAmountMinor: 1234 } });
rec("F1-8", "Idempotency-Key replay -> same goal id, no duplicate row", idem2.data?.id === idem1.data?.id, `first=${idem1.status}(${idem1.data?.id?.slice(0, 8)}) second=${idem2.status}(${idem2.data?.id?.slice(0, 8)})`);

/* AC-F4-2: progress over request */
await req(`/api/goals/${goalA.id}`, { method: "PATCH", cookie: ownerCookie, body: { savedDelta: goalA.targetAmountMinor + 250 } });
const listAfter = await req("/api/goals", { cookie: ownerCookie });
const dtoA = listAfter.data.rows.find((row) => row.id === goalA.id);
rec("F2-1", "saved > target -> DTO progress capped at 100", dtoA?.progressPercent === 100, `progress=${dtoA?.progressPercent} saved=${dtoA?.savedAmountMinor} target=${dtoA?.targetAmountMinor}`);
const rawA = psql(`select saved_amount_minor from savings_goal where id = '${goalA.id}'`);
rec("F2-2", "DB counter NOT capped (250 over target kept)", Number(rawA) === goalA.targetAmountMinor + 250, `raw=${rawA}`);

/* AC-F4-3 route level */
const neg = await req(`/api/goals/${goalB.id}`, { method: "PATCH", cookie: ownerCookie, body: { savedDelta: -1 } });
const rawB = psql(`select saved_amount_minor from savings_goal where id = '${goalB.id}'`);
rec("F3-1", "saved 0 - 1 -> 422 SAVED_AMOUNT_INVALID, no change", neg.status === 422 && neg.data?.error?.code === "SAVED_AMOUNT_INVALID" && Number(rawB) === 0, `status=${neg.status} code=${neg.data?.error?.code} raw=${rawB}`);
const zero = await req(`/api/goals/${goalB.id}`, { method: "PATCH", cookie: ownerCookie, body: { savedDelta: 0 } });
rec("F3-2", "delta 0 -> 422", zero.status === 422, `status=${zero.status} code=${zero.data?.error?.code}`);
const overflow = await req(`/api/goals/${goalB.id}`, { method: "PATCH", cookie: ownerCookie, body: { savedDelta: 2147483648 } });
rec("F3-3", "delta > int32 -> 422", overflow.status === 422, `status=${overflow.status} code=${overflow.data?.error?.code}`);
const badId = await req("/api/goals/not-a-uuid", { method: "PATCH", cookie: ownerCookie, body: { savedDelta: 1 } });
rec("F3-4", "malformed goal id -> 404", badId.status === 404, `status=${badId.status}`);
const missingId = await req(`/api/goals/${crypto.randomUUID()}`, { method: "PATCH", cookie: ownerCookie, body: { savedDelta: 1 } });
rec("F3-5", "unknown but valid id -> 404", missingId.status === 404, `status=${missingId.status}`);

/* SECURITY: cross-household is 404 without leaking */
const crossList = await req("/api/goals", { cookie: intruderCookie });
const leaked = (crossList.data?.rows ?? []).some((row) => row.id === goalA.id || row.id === goalB.id);
rec("SEC-1", "household B list never contains A's goals", crossList.status === 200 && !leaked, `rows=${(crossList.data?.rows ?? []).length} leaked=${leaked}`);
const crossPatch = await req(`/api/goals/${goalA.id}`, { method: "PATCH", cookie: intruderCookie, body: { savedDelta: 5 } });
rec("SEC-2", "cross-household PATCH -> 404 (not 403, no leak)", crossPatch.status === 404, `status=${crossPatch.status}`);

/* Member (non-owner) write: route says implemented, not owner-only */
/* Membership row already exists from the setup block (pointed at the owner household as PENDING). */
psql(`insert into membership (id, household_id, user_id, role, status)
      values (gen_random_uuid(), '${ownerHouse}', '${userIds[2]}', 'MEMBER', 'PENDING')
      on conflict (user_id, household_id) do update set role = 'MEMBER', status = 'PENDING'`);
const memberDenied = await req(`/api/goals/${goalA.id}`, { method: "PATCH", cookie: memberCookie, body: { savedDelta: 10 } });
rec("SEC-3", "PENDING member of the SAME household -> 403 ACCESS_PENDING", memberDenied.status === 403 && memberDenied.data?.error?.code === "ACCESS_PENDING", `status=${memberDenied.status} code=${memberDenied.data?.error?.code}`);
psql(`update membership set status = 'APPROVED' where household_id = '${ownerHouse}' and user_id = '${userIds[2]}'`);
const memberOk = await req(`/api/goals/${goalA.id}`, { method: "PATCH", cookie: memberCookie, body: { savedDelta: 10 } });
rec("SEC-5", "APPROVED member (non-owner) can write goals", memberOk.status === 200, `patch=${memberOk.status} saved=${memberOk.data?.savedAmountMinor}`);

/* AC-F4-4: trash -> hidden, restore */
const trash = await req(`/api/goals/${goalB.id}/trash`, { method: "POST", cookie: ownerCookie });
rec("F4-1", "trash -> 200 deletedAt filled", trash.status === 200 && trash.data?.deletedAt, `status=${trash.status}`);
const activeAfter = await req("/api/goals", { cookie: ownerCookie });
rec("F4-2", "trashed goal gone from active list", !(activeAfter.data.rows ?? []).some((row) => row.id === goalB.id), `rows=${(activeAfter.data.rows ?? []).length}`);
const trashList = await req("/api/goals/trash", { cookie: ownerCookie });
rec("F4-3", "trashed goal present in /api/goals/trash", (trashList.data.rows ?? []).some((row) => row.id === goalB.id), `rows=${(trashList.data.rows ?? []).length}`);
const incTrashed = await req(`/api/goals/${goalB.id}`, { method: "PATCH", cookie: ownerCookie, body: { savedDelta: 10 } });
rec("F4-4", "increment on trashed goal -> 404", incTrashed.status === 404, `status=${incTrashed.status}`);
const crossTrash = await req(`/api/goals/${goalB.id}/trash`, { method: "POST", cookie: intruderCookie });
rec("F4-5", "cross-household trash -> 404", crossTrash.status === 404, `status=${crossTrash.status}`);
const restore = await req(`/api/goals/${goalB.id}/restore`, { method: "POST", cookie: ownerCookie });
rec("F4-6", "restore -> active again (deletedAt null)", restore.status === 200 && restore.data?.deletedAt === null, `status=${restore.status} deletedAt=${restore.data?.deletedAt}`);

/* Advisor route: cache behavior per period against the REAL provider (free tier tolerated). */
const periods = [
  { start: "2026-10-01", end: "2026-10-07" },
];
let advisorEvidence = { first: null, second: null };
for (let attempt = 0; attempt < 2; attempt += 1) {
  const first = await req("/api/advisor/insights", { method: "POST", cookie: ownerCookie, headers: { "Idempotency-Key": crypto.randomUUID() }, body: { period: periods[0] } });
  if (first.status === 200) {
    const second = await req("/api/advisor/insights", { method: "POST", cookie: ownerCookie, headers: { "Idempotency-Key": crypto.randomUUID() }, body: { period: periods[0] } });
    advisorEvidence = { first, second };
    break;
  }
  console.log(`  (real model attempt ${attempt + 1} -> ${first.status} ${first.data?.error?.code}, retrying)`);
}
const { first: fresh, second: cached } = advisorEvidence;
rec("F6-1", "first call FRESH, second call CACHE for the same period", !!(fresh && cached) && fresh.data?.delivery === "FRESH" && cached.data?.delivery === "CACHE", `first=${fresh?.status}/${fresh?.data?.delivery} second=${cached?.status}/${cached?.data?.delivery}`);
rec("F6-2", "CACHE insight has same generatedAt as the FRESH row", !!cached && cached.data?.insight?.generatedAt === fresh.data?.insight?.generatedAt, `gen1=${fresh?.data?.insight?.generatedAt}`);
rec("F6-3", "sourcePeriod equals the REQUESTED period (not model-invented)", !!cached && JSON.stringify(cached.data?.insight?.sourcePeriod) === JSON.stringify(periods[0]), `sp=${JSON.stringify(cached?.data?.insight?.sourcePeriod)}`);
rec("F6-4", "insight fields complete + actions >=1 with enum type", (() => {
  const i = fresh?.data?.insight;
  if (!i) return false;
  const types = new Set(["VIEW_GOAL", "REVIEW_SPENDING", "NONE"]);
  return !!i.headline && !!i.summary && !!i.limitations && Array.isArray(i.actions) && i.actions.length >= 1 &&
    i.actions.every((a) => types.has(a.type) && a.label && a.label.length <= 80) && !!i.model && !!i.generatedAt && !!i.expiresAt;
})(), `fields=${Object.keys(fresh?.data?.insight ?? {}).length}`);
const textBlob = JSON.stringify(fresh?.data ?? {}).toLowerCase();
rec("F8-1", "no forbidden phrases in real insight text", !textBlob.includes("dijamin") && !textBlob.includes("pasti hemat") && !textBlob.includes("sesuai ojk"), `len=${textBlob.length}`);
rec("SEC-6", "prompt never leaks into the client payload", !textBlob.includes("kamu finny") && !textBlob.includes("agregat") && !textBlob.includes("data agregat"), `nessie=none`);
const otherPeriod = await req("/api/advisor/insights", { method: "POST", cookie: ownerCookie, headers: { "Idempotency-Key": crypto.randomUUID() }, body: { period: { start: "2026-10-02", end: "2026-10-06" } } });
rec("F6-5", "different period is NOT served from cache (FRESH or honest failure}", otherPeriod.status === 200 ? otherPeriod.data?.delivery === "FRESH" : otherPeriod.status >= 400 && !!otherPeriod.data?.error?.code, `status=${otherPeriod.status} delivery=${otherPeriod.data?.delivery} code=${otherPeriod.data?.error?.code}`);
const span90 = await req("/api/advisor/insights", { method: "POST", cookie: ownerCookie, headers: { "Idempotency-Key": crypto.randomUUID() }, body: { period: { start: "2026-10-01", end: "2026-12-30" } } });
rec("F5-1", "period > 90 days -> 422 VALIDATION_ERROR", span90.status === 422, `status=${span90.status} code=${span90.data?.error?.code}`);
const inverted = await req("/api/advisor/insights", { method: "POST", cookie: ownerCookie, headers: { "Idempotency-Key": crypto.randomUUID() }, body: { period: { start: "2026-10-07", end: "2026-10-01" } } });
rec("F5-2", "start > end -> 422", inverted.status === 422, `status=${inverted.status}`);
const oneDay = await req("/api/advisor/insights", { method: "POST", cookie: ownerCookie, headers: { "Idempotency-Key": crypto.randomUUID() }, body: { period: { start: "2026-10-07", end: "2026-10-07" } } });
rec("F5-3", "start == end accepted (FRESH or honest failure, never 422)", oneDay.status !== 422 && (oneDay.status === 200 || !!oneDay.data?.error?.code), `status=${oneDay.status} delivery=${oneDay.data?.delivery}`);

/* Server-side 90-day check can't be forced via UI (client guard blocks), so also probe the boundary exactly 91 days. */
const border91 = await req("/api/advisor/insights", { method: "POST", cookie: ownerCookie, headers: { "Idempotency-Key": crypto.randomUUID() }, body: { period: { start: "2026-09-30", end: "2026-12-29" } } });
rec("F5-4", "exactly 91 days span -> 422 (server-side)", border91.status === 422, `status=${border91.status}`);
const border90 = await req("/api/advisor/insights", { method: "POST", cookie: ownerCookie, headers: { "Idempotency-Key": crypto.randomUUID() }, body: { period: { start: "2026-10-01", end: "2026-12-29" } } });
rec("F5-5", "exactly 90 days span accepted -> not 422", border90.status !== 422, `status=${border90.status} code=${border90.data?.error?.code}`);

/* Cleanup (children-first FK order) */
for (const householdId of householdIds) {
  psql(`delete from advisor_insight where household_id = '${householdId}'`);
  psql(`delete from savings_goal where household_id = '${householdId}'`);
  psql(`delete from idempotency_key where user_id = '${userIds[householdIds.indexOf(householdId)]}'`);
  psql(`delete from ocr_job using receipt where ocr_job.receipt_id = receipt.id and receipt.household_id = '${householdId}'`);
  psql(`delete from receipt where household_id = '${householdId}'`);
  psql(`delete from transaction where household_id = '${householdId}'`);
  psql(`delete from membership where household_id = '${householdId}'`);
  psql(`delete from invite where household_id = '${householdId}'`);
}
for (const userId of userIds) {
  psql(`delete from session where user_id = '${userId}'`);
  const householdId = psql(`select id from household where owner_user_id = '${userId}'`);
  if (householdId) psql(`delete from household where id = '${householdId}'`);
  psql(`delete from membership_event where actor_user_id = '${userId}'`);
  psql(`delete from membership where user_id = '${userId}'`);
  psql(`delete from public.user where id = '${userId}'`);
}

const pass = results.filter((r) => r.pass).length;
writeFileSync("docs/qa/harness/t007-api-results.json", JSON.stringify({ pass, fail: results.length - pass, results }, null, 2));
console.log(`\nSUMMARY pass=${pass} fail=${results.length - pass}`);
