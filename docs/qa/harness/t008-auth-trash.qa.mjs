/*
  T-008 Phase-1 route-level QA harness (QA-owned, scratch).

  Covers, through the REAL HTTP routes + local PostgreSQL T-003 DB:
    AC-F1-1..F1-7  auth / invite / approval / session
    AC-F5-1..F5-4, AC-F5-7  transaction soft-delete / trash / restore / isolation

  Requires a running Next dev server (QA_BASE, default :3011).
  Run: QA_BASE=http://localhost:3011 bun docs/qa/harness/t008-auth-trash.qa.mjs
*/

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

const BASE = process.env.QA_BASE || "http://localhost:3011";

/* ── Hard local-DB guard: refuse anything but the verified local T-003 DB ── */
function localDbUrl() {
  const raw = process.env.DATABASE_URL || "";
  let u;
  try { u = new URL(raw); } catch { throw new Error("DATABASE_URL missing/invalid; refusing to run."); }
  const host = u.hostname;
  const port = u.port || "5432";
  const db = u.pathname.replace(/^\//, "");
  if (!["localhost", "127.0.0.1", "::1"].includes(host) || port !== "5432" || db !== "financial_planner_t003") {
    throw new Error(`Refusing non-local DB target (host=${host} port=${port} db=${db}).`);
  }
  const clean = `${u.protocol}//${u.username}:${u.password}@${u.host}${u.pathname}`;
  return clean;
}
const DB_URL = localDbUrl();

function q(sql) { return execFileSync("psql", [DB_URL, "-At", "-c", sql], { encoding: "utf8" }).trim(); }
function q1(sql) { const v = q(sql); return v === "" ? null : v; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function rec(id, name, pass, detail) {
  results.push({ id, name, pass: !!pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} [${id}] ${name} :: ${detail}`);
}

async function req(path, { method = "GET", cookie, body, headers = {} } = {}) {
  const h = { ...headers };
  if (body !== undefined) h["content-type"] = "application/json";
  if (cookie) h.cookie = cookie;
  const r = await fetch(`${BASE}${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  let data = null;
  try { data = await r.json(); } catch {}
  const sc = typeof r.headers.getSetCookie === "function" ? r.headers.getSetCookie() : [];
  return { status: r.status, data, setCookies: sc, cookie: sc.map((c) => c.split(";")[0]).join("; ") };
}
const post = (p, opts) => req(p, { ...opts, method: "POST" });

function jwtPayload(cookie) {
  const m = /financial_planner_session=([^;]+)/.exec(cookie || "");
  if (!m) return null;
  const parts = m[1].split(".");
  if (parts.length < 2) return null;
  try { return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")); } catch { return null; }
}
function sessionSetCookie(setCookies) {
  return setCookies.find((c) => c.startsWith("financial_planner_session=")) || "";
}
function jakartaToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const PREFIX = `qa-t008-phase1-${RUN}-`;
const em = (tag) => `${PREFIX}${tag}@test.local`;
const PW = "password123";
const OWNER = em("owner"), OWNERB = em("ownerb"), APPR = em("appr"), DECL = em("decl"), REVK = em("revk"), LG = em("lg");
const OWNER_EMAILS = [OWNER, OWNERB, APPR, DECL, REVK, LG];
const today = jakartaToday();

const userIds = [];
function remember(d, tag) { if (d?.user?.id) userIds.push(d.user.id); return d; }

let phase = "start";
try {
  /* ═══════════════════ AC-F1-1 owner signup ═══════════════════ */
  phase = "F1-1";
  const owner = remember(await post("/api/auth/signup", { body: { email: OWNER, displayName: "QA P1 Owner", password: PW } }), "owner");
  const ownerId = owner.data?.user?.id, householdA = owner.data?.household?.id;
  rec("F1-1a", "signup w/o invite -> 201 OWNER/APPROVED OPEN_HOME + household",
    owner.status === 201 && owner.data?.role === "OWNER" && owner.data?.status === "APPROVED" &&
    owner.data?.nextAction === "OPEN_HOME" && !!householdA,
    `status=${owner.status} role=${owner.data?.role} mstatus=${owner.data?.status} next=${owner.data?.nextAction} household=${!!householdA}`);

  rec("F1-1b", "DB: exactly 1 user + 1 OWNER household + 1 OWNER/APPROVED membership",
    q1(`select count(*) from public.user where email='${OWNER}'`) === "1" &&
    q1(`select count(*) from household where owner_user_id='${ownerId}'`) === "1" &&
    q1(`select count(*) from membership where user_id='${ownerId}' and role='OWNER' and status='APPROVED'`) === "1",
    `user=${q1(`select count(*) from public.user where email='${OWNER}'`)} household=${q1(`select count(*) from household where owner_user_id='${ownerId}'`)} membership=${q1(`select count(*) from membership where user_id='${ownerId}' and role='OWNER' and status='APPROVED'`)}`);

  const ownKeys = Object.keys(owner.data ?? {});
  rec("F1-1c", "signup response carries no ledger payload",
    !ownKeys.includes("balanceMinor") && !ownKeys.includes("transactions") && !ownKeys.includes("spentMinor") && !ownKeys.includes("budgetMinor"),
    `keys=${ownKeys.join(",")}`);

  const short = await post("/api/auth/signup", { body: { email: em("short"), displayName: "QA Short", password: "short" } });
  rec("F1-1d", "password < 8 -> 422 VALIDATION_ERROR", short.status === 422 && short.data?.error?.code === "VALIDATION_ERROR",
    `status=${short.status} code=${short.data?.error?.code}`);

  /* owner session + invite */
  const ownerLogin = await post("/api/auth/login", { body: { email: OWNER, password: PW } });
  const ownerCookie = ownerLogin.cookie;
  const sid1 = jwtPayload(ownerCookie)?.sid;

  const ownerB = remember(await post("/api/auth/signup", { body: { email: OWNERB, displayName: "QA P1 OwnerB", password: PW } }), "ownerb");
  const ownerBCookie = ownerB.cookie;

  /* ═══════════════════ AC-F1-2 invite -> PENDING ═══════════════════ */
  phase = "F1-2";
  const inv = await post("/api/family/invites", { cookie: ownerCookie });
  const code = inv.data?.plaintextCode, invAId = inv.data?.invite?.id;
  rec("F1-2pre", "owner creates invite -> 201 with 8-char one-time code",
    inv.status === 201 && typeof code === "string" && code.length === 8 && inv.data?.invite?.redeemedAt === null,
    `status=${inv.status} codeLen=${code?.length} redeemed=${inv.data?.invite?.redeemedAt}`);

  const appr = remember(await post("/api/auth/signup", { body: { email: APPR, displayName: "QA Appr", password: PW, inviteCode: code } }), "appr");
  const apprCookie = appr.cookie;
  const apprMid = q1(`select id from membership where user_id='${appr.data?.user?.id}'`);
  rec("F1-2a", "valid invite signup -> 201 PENDING WAIT_FOR_APPROVAL MEMBER (not APPROVED)",
    appr.status === 201 && appr.data?.status === "PENDING" && appr.data?.nextAction === "WAIT_FOR_APPROVAL" &&
    appr.data?.role === "MEMBER" && appr.data?.status !== "APPROVED",
    `status=${appr.status} mstatus=${appr.data?.status} next=${appr.data?.nextAction} role=${appr.data?.role}`);
  rec("F1-2b", "DB: invite redeemed_at set + membership PENDING + REQUESTED event",
    q1(`select redeemed_at is not null from invite where id='${invAId}'`) === "t" &&
    q1(`select status from membership where id='${apprMid}'`) === "PENDING" &&
    q1(`select count(*) from membership_event where membership_id='${apprMid}' and event_type='REQUESTED'`) === "1",
    `redeemed=${q1(`select redeemed_at is not null from invite where id='${invAId}'`)} mstatus=${q1(`select status from membership where id='${apprMid}'`)} reqEvents=${q1(`select count(*) from membership_event where membership_id='${apprMid}' and event_type='REQUESTED'`)}`);

  /* ═══════════════════ AC-F1-3 invalid/expired/revoked/reused equivalence ═══════════════════ */
  phase = "F1-3";
  const invExp = await post("/api/family/invites", { cookie: ownerCookie });
  const invRev = await post("/api/family/invites", { cookie: ownerCookie });
  q(`update invite set expires_at = now() - interval '1 day' where id='${invExp.data?.invite?.id}'`);
  q(`update invite set revoked_at = now() where id='${invRev.data?.invite?.id}'`);

  const wrong = await post("/api/auth/signup", { body: { email: em("wrong"), displayName: "QA Wrong", password: PW, inviteCode: "ZZZZZZZZ" } });
  const reused = await post("/api/auth/signup", { body: { email: em("reused"), displayName: "QA Reused", password: PW, inviteCode: code } });
  const expired = await post("/api/auth/signup", { body: { email: em("expired"), displayName: "QA Expired", password: PW, inviteCode: invExp.data?.plaintextCode } });
  const revoked = await post("/api/auth/signup", { body: { email: em("revoked"), displayName: "QA Revoked", password: PW, inviteCode: invRev.data?.plaintextCode } });
  const causes = [wrong, reused, expired, revoked];
  rec("F1-3a", "wrong/expired/revoked/reused -> all 400",
    causes.every((r) => r.status === 400), `statuses=${causes.map((r) => r.status).join(",")}`);
  const bodies = causes.map((r) => JSON.stringify(r.data?.error));
  rec("F1-3b", "four causes return byte-identical {code,message} (no enumeration)",
    new Set(bodies).size === 1 && wrong.data?.error?.code === "INVALID_INVITE" && wrong.data?.error?.message === "Kode undangan tidak valid atau sudah kedaluwarsa.",
    `uniqueBodies=${new Set(bodies).size} code=${wrong.data?.error?.code}`);

  /* ═══════════════════ AC-F1-4 non-approved denial ═══════════════════ */
  phase = "F1-4";
  const mePending = await req("/api/auth/me", { cookie: apprCookie });
  const dashPending = await req("/api/dashboard", { cookie: apprCookie });
  const txPending = await req("/api/transactions", { cookie: apprCookie });
  rec("F1-4a", "PENDING /api/dashboard -> 403 ACCESS_PENDING", dashPending.status === 403 && dashPending.data?.error?.code === "ACCESS_PENDING",
    `status=${dashPending.status} code=${dashPending.data?.error?.code}`);
  rec("F1-4b", "PENDING /api/transactions -> 403 ACCESS_PENDING", txPending.status === 403 && txPending.data?.error?.code === "ACCESS_PENDING",
    `status=${txPending.status} code=${txPending.data?.error?.code}`);
  rec("F1-4c", "PENDING /api/auth/me -> 200 allowed exception", mePending.status === 200 && mePending.data?.status === "PENDING",
    `status=${mePending.status} mstatus=${mePending.data?.status}`);
  rec("F1-4d", "403 body carries only the error envelope (no ledger data)",
    !!dashPending.data?.error && !Object.keys(dashPending.data).some((k) => ["balanceMinor", "transactions", "rows", "spending"].includes(k)),
    `keys=${Object.keys(dashPending.data ?? {}).join(",")}`);

  /* PENDING logout allowed */
  const invLg = await post("/api/family/invites", { cookie: ownerCookie });
  const lg = remember(await post("/api/auth/signup", { body: { email: LG, displayName: "QA Lg", password: PW, inviteCode: invLg.data?.plaintextCode } }), "lg");
  const lgLogout = await post("/api/auth/logout", { cookie: lg.cookie });
  const lgMe = await req("/api/auth/me", { cookie: lg.cookie });
  rec("F1-4e", "PENDING logout allowed (204) and old session then 401",
    lgLogout.status === 204 && lgMe.status === 401, `logout=${lgLogout.status} meAfter=${lgMe.status}`);

  /* DECLINED */
  const invDecl = await post("/api/family/invites", { cookie: ownerCookie });
  const decl = remember(await post("/api/auth/signup", { body: { email: DECL, displayName: "QA Decl", password: PW, inviteCode: invDecl.data?.plaintextCode } }), "decl");
  const declCookie = decl.cookie;
  const declMid = q1(`select id from membership where user_id='${decl.data?.user?.id}'`);
  const declRes = await post(`/api/family/members/${declMid}/decline`, { cookie: ownerCookie, body: { reason: "qa decline" } });
  rec("F1-5b", "PENDING->DECLINED transition 200 + DECLINED event",
    declRes.status === 200 && declRes.data?.status === "DECLINED" &&
    q1(`select count(*) from membership_event where membership_id='${declMid}' and event_type='DECLINED'`) === "1",
    `status=${declRes.status} mstatus=${declRes.data?.status} events=${q1(`select count(*) from membership_event where membership_id='${declMid}' and event_type='DECLINED'`)}`);
  const dashDecl = await req("/api/dashboard", { cookie: declCookie });
  const meDecl = await req("/api/auth/me", { cookie: declCookie });
  rec("F1-4f", "DECLINED /api/dashboard -> 403 ACCESS_DECLINED", dashDecl.status === 403 && dashDecl.data?.error?.code === "ACCESS_DECLINED",
    `status=${dashDecl.status} code=${dashDecl.data?.error?.code}`);
  rec("F1-4g", "DECLINED /api/auth/me -> 200 status DECLINED", meDecl.status === 200 && meDecl.data?.status === "DECLINED",
    `status=${meDecl.status} mstatus=${meDecl.data?.status}`);

  /* REVOKED (approve then revoke) */
  const invRevk = await post("/api/family/invites", { cookie: ownerCookie });
  const revk = remember(await post("/api/auth/signup", { body: { email: REVK, displayName: "QA Revk", password: PW, inviteCode: invRevk.data?.plaintextCode } }), "revk");
  const revkCookie = revk.cookie;
  const revkMid = q1(`select id from membership where user_id='${revk.data?.user?.id}'`);
  const revkApprove = await post(`/api/family/members/${revkMid}/approve`, { cookie: ownerCookie });
  const dashBeforeRevoke = await req("/api/dashboard", { cookie: revkCookie });
  const revkRes = await post(`/api/family/members/${revkMid}/revoke`, { cookie: ownerCookie, body: { reason: "qa revoke" } });
  const dashRevoked = await req("/api/dashboard", { cookie: revkCookie });
  const meRevoked = await req("/api/auth/me", { cookie: revkCookie });
  rec("F1-5c", "APPROVED->REVOKED transition 200 + REVOKED event",
    revkApprove.status === 200 && revkRes.status === 200 && revkRes.data?.status === "REVOKED" &&
    q1(`select count(*) from membership_event where membership_id='${revkMid}' and event_type='REVOKED'`) === "1",
    `approve=${revkApprove.status} revoke=${revkRes.status} events=${q1(`select count(*) from membership_event where membership_id='${revkMid}' and event_type='REVOKED'`)}`);
  rec("F1-4h", "APPROVED then REVOKED -> dashboard 403 ACCESS_REVOKED",
    dashBeforeRevoke.status === 200 && dashRevoked.status === 403 && dashRevoked.data?.error?.code === "ACCESS_REVOKED",
    `before=${dashBeforeRevoke.status} after=${dashRevoked.status} code=${dashRevoked.data?.error?.code}`);
  rec("F1-4i", "REVOKED /api/auth/me -> 200 status REVOKED", meRevoked.status === 200 && meRevoked.data?.status === "REVOKED",
    `status=${meRevoked.status} mstatus=${meRevoked.data?.status}`);

  /* ═══════════════════ AC-F1-5 transitions: valid/invalid/non-owner/OWNER target ═══════════════════ */
  phase = "F1-5";
  const apprApprove = await post(`/api/family/members/${apprMid}/approve`, { cookie: ownerCookie });
  rec("F1-5a", "PENDING->APPROVED transition 200 + APPROVED event",
    apprApprove.status === 200 && apprApprove.data?.status === "APPROVED" &&
    q1(`select count(*) from membership_event where membership_id='${apprMid}' and event_type='APPROVED'`) === "1",
    `status=${apprApprove.status} mstatus=${apprApprove.data?.status} events=${q1(`select count(*) from membership_event where membership_id='${apprMid}' and event_type='APPROVED'`)}`);

  const declEventsBefore = q1(`select count(*) from membership_event where membership_id='${declMid}'`);
  const invalidTrans = await post(`/api/family/members/${declMid}/approve`, { cookie: ownerCookie });
  const declEventsAfter = q1(`select count(*) from membership_event where membership_id='${declMid}'`);
  rec("F1-5d", "invalid DECLINED->APPROVED -> 409 INVALID_STATE_TRANSITION, no new event",
    invalidTrans.status === 409 && invalidTrans.data?.error?.code === "INVALID_STATE_TRANSITION" && declEventsBefore === declEventsAfter,
    `status=${invalidTrans.status} code=${invalidTrans.data?.error?.code} events ${declEventsBefore}->${declEventsAfter}`);

  const nonOwner = await post(`/api/family/members/${declMid}/approve`, { cookie: apprCookie });
  rec("F1-5e", "non-owner (APPROVED MEMBER) approve -> 403 ACCESS_DENIED",
    nonOwner.status === 403 && nonOwner.data?.error?.code === "ACCESS_DENIED",
    `status=${nonOwner.status} code=${nonOwner.data?.error?.code}`);

  const ownerMid = q1(`select id from membership where user_id='${ownerId}' and role='OWNER'`);
  const ownerSelfApprove = await post(`/api/family/members/${ownerMid}/approve`, { cookie: ownerCookie });
  const ownerSelfRevoke = await post(`/api/family/members/${ownerMid}/revoke`, { cookie: ownerCookie, body: { reason: "self" } });
  rec("F1-5f", "OWNER as target -> 409 INVALID_STATE_TRANSITION (approve + self-revoke)",
    ownerSelfApprove.status === 409 && ownerSelfApprove.data?.error?.code === "INVALID_STATE_TRANSITION" &&
    ownerSelfRevoke.status === 409 && ownerSelfRevoke.data?.error?.code === "INVALID_STATE_TRANSITION",
    `approve=${ownerSelfApprove.status}/${ownerSelfApprove.data?.error?.code} revoke=${ownerSelfRevoke.status}/${ownerSelfRevoke.data?.error?.code}`);

  /* ═══════════════════ AC-F1-6 sessions ═══════════════════ */
  phase = "F1-6";
  const login2 = await post("/api/auth/login", { body: { email: OWNER, password: PW } });
  const p2 = jwtPayload(login2.cookie);
  rec("F1-6a", "JWT TTL is 15 min (exp - iat = 900)", !!p2 && p2.exp - p2.iat === 900, `ttl=${p2 ? p2.exp - p2.iat : "n/a"}`);
  const claimKeys = p2 ? Object.keys(p2).sort() : [];
  rec("F1-6b", "JWT claims == {sub,sid,token_version,iat,exp}, no role/household_id",
    JSON.stringify(claimKeys) === JSON.stringify(["exp", "iat", "sid", "sub", "token_version"]) && !("role" in (p2 ?? {})) && !("household_id" in (p2 ?? {})),
    `keys=${claimKeys.join(",")}`);
  rec("F1-6g", "login mints a new sid (anti session fixation)", !!sid1 && !!p2?.sid && sid1 !== p2.sid,
    `sid1=${sid1?.slice(0, 8)} sid2=${p2?.sid?.slice(0, 8)}`);
  rec("F1-7c", "token version is v1 and sub is the owner id", p2?.token_version === "v1" && p2?.sub === ownerId,
    `tv=${p2?.token_version} sub=${p2?.sub?.slice(0, 8)}`);

  const meOwner = await req("/api/auth/me", { cookie: login2.cookie });
  const reissue = sessionSetCookie(meOwner.setCookies);
  rec("F1-6c", "protected request reissues the sliding session cookie (same sid)",
    meOwner.status === 200 && reissue.startsWith("financial_planner_session=") && jwtPayload(reissue)?.sid === p2?.sid,
    `status=${meOwner.status} reissued=${!!reissue} sameSid=${jwtPayload(reissue)?.sid === p2?.sid}`);
  const rawLoginCookie = sessionSetCookie(login2.setCookies);
  rec("F1-6d", "session cookie flags HttpOnly / Secure / SameSite=Lax",
    /HttpOnly/i.test(rawLoginCookie) && /Secure/i.test(rawLoginCookie) && /SameSite=Lax/i.test(rawLoginCookie),
    `flags=httpOnly:${/HttpOnly/i.test(rawLoginCookie)},secure:${/Secure/i.test(rawLoginCookie)},lax:${/SameSite=Lax/i.test(rawLoginCookie)}`);

  const lgOwner = await post("/api/auth/logout", { cookie: login2.cookie });
  const revokedAt = q1(`select revoked_at is not null from session where id='${p2?.sid}'`);
  const cleared = sessionSetCookie(lgOwner.setCookies);
  const meAfterLogout = await req("/api/auth/me", { cookie: login2.cookie });
  rec("F1-6e", "logout -> 204, session revoked_at set, cookie cleared (Max-Age=0)",
    lgOwner.status === 204 && revokedAt === "t" && /Max-Age=0/.test(cleared) && meAfterLogout.status === 401,
    `logout=${lgOwner.status} revoked=${revokedAt} cleared=${/Max-Age=0/.test(cleared)} me=${meAfterLogout.status}`);

  const login4 = await post("/api/auth/login", { body: { email: OWNER, password: PW } });
  const sid4 = jwtPayload(login4.cookie)?.sid;
  q(`update session set expires_at = '2000-01-01T00:00:00Z' where id='${sid4}'`);
  const expiredMe = await req("/api/auth/me", { cookie: login4.cookie });
  rec("F1-6h", "session past absolute expiry -> 401", expiredMe.status === 401, `status=${expiredMe.status}`);

  /* ═══════════════════ AC-F1-7 revalidation ═══════════════════ */
  phase = "F1-7";
  const apprAfter = await req("/api/dashboard", { cookie: apprCookie });
  rec("F1-7a", "approved member regains access on the next request (was 403 PENDING)", apprAfter.status === 200,
    `status=${apprAfter.status}`);

  /* ═══════════════════ AC-F5-1 soft delete + calculation effect ═══════════════════ */
  phase = "F5-1";
  async function mkTx(type, amountMinor, category) {
    const r = await post("/api/transactions", { cookie: ownerCookie, body: { type, amountMinor, category, occurredAt: today } });
    return { id: r.data?.transactions?.[0]?.id, status: r.status };
  }
  const tIn = await mkTx("MONEY_IN", 500000, "income");
  const tOut1 = await mkTx("MONEY_OUT", 100000, "food");
  const tOut2 = await mkTx("MONEY_OUT", 200000, "transport");
  const dash0 = await req("/api/dashboard", { cookie: ownerCookie });
  rec("F5-pre", "baseline dashboard balance=200000 spending=300000",
    dash0.status === 200 && dash0.data?.balanceMinor === 200000 && dash0.data?.spending?.totalOutMinor === 300000,
    `balance=${dash0.data?.balanceMinor} spent=${dash0.data?.spending?.totalOutMinor}`);

  const del2 = await post(`/api/transactions/${tOut2.id}/trash`, { cookie: ownerCookie });
  rec("F5-1a", "trash transaction -> 200 with deletedAt filled, alreadyDeleted=false",
    del2.status === 200 && !!del2.data?.deletedAt && del2.data?.alreadyDeleted === false,
    `status=${del2.status} deletedAt=${!!del2.data?.deletedAt} alreadyDeleted=${del2.data?.alreadyDeleted}`);
  const row2 = q(`select (deleted_at is not null)::text || '|' || coalesce(deleted_by_user_id::text,'NULL') || '|' || amount_minor::text from transaction where id='${tOut2.id}'`);
  rec("F5-1b", "DB: row still exists (not hard delete) with deleted_at + deleted_by_user_id + amount intact",
    row2 === `true|${ownerId}|200000`, `row=${row2}`);
  const activeAfterDel = await req("/api/transactions?limit=50", { cookie: ownerCookie });
  const activeIds = (activeAfterDel.data?.rows ?? []).map((r) => r.id);
  rec("F5-1c", "deleted record gone from active list", activeAfterDel.status === 200 && !activeIds.includes(tOut2.id) && activeIds.includes(tOut1.id),
    `activeRows=${activeIds.length} hasDeleted=${activeIds.includes(tOut2.id)}`);
  const dash1 = await req("/api/dashboard", { cookie: ownerCookie });
  rec("F5-1d", "dashboard excludes deleted: balance=400000 spending=100000",
    dash1.data?.balanceMinor === 400000 && dash1.data?.spending?.totalOutMinor === 100000,
    `balance=${dash1.data?.balanceMinor} spent=${dash1.data?.spending?.totalOutMinor}`);

  /* ═══════════════════ AC-F5-3 trash scope / order / pagination ═══════════════════ */
  phase = "F5-3";
  const t3 = await mkTx("MONEY_OUT", 30000, "shopping");
  const t4 = await mkTx("MONEY_OUT", 40000, "health");
  const t5 = await mkTx("MONEY_OUT", 50000, "bills");
  for (const t of [t3, t4, t5]) { await post(`/api/transactions/${t.id}/trash`, { cookie: ownerCookie }); await sleep(60); }
  const trashList = await req("/api/transactions/trash?limit=50", { cookie: ownerCookie });
  const trashIds = (trashList.data?.rows ?? []).map((r) => r.id);
  const expectedOrder = [t5.id, t4.id, t3.id, tOut2.id];
  rec("F5-3a", "trash ordered deleted_at DESC", JSON.stringify(trashIds) === JSON.stringify(expectedOrder),
    `order=${trashIds.map((i) => i.slice(0, 4)).join(",")}`);
  rec("F5-3b", "trash has only soft-deleted rows (active excluded) and is household-scoped",
    trashList.status === 200 && (trashList.data?.rows ?? []).every((r) => r.deletedAt !== null) && !trashIds.includes(tOut1.id) && !trashIds.includes(tIn.id),
    `rows=${trashIds.length} allDeleted=${(trashList.data?.rows ?? []).every((r) => r.deletedAt !== null)}`);
  const trashB = await req("/api/transactions/trash?limit=50", { cookie: ownerBCookie });
  const bIds = (trashB.data?.rows ?? []).map((r) => r.id);
  rec("F5-3c", "household B trash never shows household A records", trashB.status === 200 && !expectedOrder.some((id) => bIds.includes(id)),
    `Brows=${bIds.length}`);

  const page1 = await req("/api/transactions/trash?limit=2", { cookie: ownerCookie });
  const p1Ids = (page1.data?.rows ?? []).map((r) => r.id);
  const page2 = await req(`/api/transactions/trash?limit=2&cursor=${encodeURIComponent(page1.data?.nextCursor ?? "")}`, { cookie: ownerCookie });
  const p2Ids = (page2.data?.rows ?? []).map((r) => r.id);
  rec("F5-3d", "trash cursor pagination: page1=[t5,t4], nextCursor present, page2=[t3,tOut2], no dup/loss",
    JSON.stringify(p1Ids) === JSON.stringify([t5.id, t4.id]) && !!page1.data?.nextCursor &&
    JSON.stringify(p2Ids) === JSON.stringify([t3.id, tOut2.id]),
    `page1=${p1Ids.map((i) => i.slice(0, 4)).join(",")} cursor=${!!page1.data?.nextCursor} page2=${p2Ids.map((i) => i.slice(0, 4)).join(",")}`);

  /* ═══════════════════ AC-F5-4 restore preserves data + recalculation ═══════════════════ */
  phase = "F5-4";
  const before = q(`select occurred_at::text || '|' || amount_minor::text || '|' || created_by_user_id from transaction where id='${tOut2.id}'`);
  const restore2 = await post(`/api/transactions/${tOut2.id}/restore`, { cookie: ownerCookie });
  const after = q(`select (deleted_at is null)::text || '|' || coalesce(deleted_by_user_id::text,'NULL') || '|' || occurred_at::text || '|' || amount_minor::text || '|' || created_by_user_id from transaction where id='${tOut2.id}'`);
  rec("F5-4a", "restore -> 200 deletedAt null alreadyActive=false", restore2.status === 200 && restore2.data?.deletedAt === null && restore2.data?.alreadyActive === false,
    `status=${restore2.status} deletedAt=${restore2.data?.deletedAt} alreadyActive=${restore2.data?.alreadyActive}`);
  rec("F5-4b", "restore clears deleted_at/deleted_by and preserves occurred_at/amount/created_by",
    after === `true|NULL|${before}`, `after=${after} before=${before}`);
  const activeAfterRestore = await req("/api/transactions?limit=50", { cookie: ownerCookie });
  const restoreIds = (activeAfterRestore.data?.rows ?? []).map((r) => r.id);
  const dash2 = await req("/api/dashboard", { cookie: ownerCookie });
  rec("F5-4c", "restored record back in active list and recalculated (balance back to 200000)",
    restoreIds.includes(tOut2.id) && dash2.data?.balanceMinor === 200000,
    `inActive=${restoreIds.includes(tOut2.id)} balance=${dash2.data?.balanceMinor}`);

  /* ═══════════════════ AC-F5-7 cross-household 404 generic ═══════════════════ */
  phase = "F5-7";
  const crossTrash = await post(`/api/transactions/${tIn.id}/trash`, { cookie: ownerBCookie });
  const crossRestore = await post(`/api/transactions/${tOut2.id}/restore`, { cookie: ownerBCookie });
  const unknownId = randomUUID();
  const unknownTrash = await post(`/api/transactions/${unknownId}/trash`, { cookie: ownerBCookie });
  rec("F5-7a", "cross-household trash by id -> 404 NOT_FOUND (not 403)",
    crossTrash.status === 404 && crossTrash.data?.error?.code === "NOT_FOUND",
    `status=${crossTrash.status} code=${crossTrash.data?.error?.code}`);
  rec("F5-7b", "cross-household restore by id -> 404 NOT_FOUND", crossRestore.status === 404 && crossRestore.data?.error?.code === "NOT_FOUND",
    `status=${crossRestore.status} code=${crossRestore.data?.error?.code}`);
  rec("F5-7c", "cross-household message identical to unknown-id (no existence leak)",
    crossTrash.data?.error?.message === unknownTrash.data?.error?.message && crossTrash.status === unknownTrash.status,
    `cross='${crossTrash.data?.error?.message}' unknown='${unknownTrash.data?.error?.message}'`);

  /* verify household A transactions unchanged by B attempts */
  rec("F5-7d", "B's cross-household attempts did not mutate A's rows",
    q1(`select deleted_at is null from transaction where id='${tIn.id}'`) === "t" && q1(`select deleted_at is null from transaction where id='${tOut2.id}'`) === "t",
    `tInActive=${q1(`select deleted_at is null from transaction where id='${tIn.id}'`)} tOut2Active=${q1(`select deleted_at is null from transaction where id='${tOut2.id}'`)}`);
} catch (err) {
  rec("HARNESS", `unexpected exception during phase=${phase}`, false, `EXCEPTION: ${err.message}`);
} finally {
  /* ═══════════════════ cleanup children-first, by email prefix ═══════════════════ */
  const LIKE = `${PREFIX}%`;
  const uidSel = `select id from public.user where email like '${LIKE}'`;
  const hhSel = `select id from household where owner_user_id in (${uidSel})`;
  try {
    q(`delete from membership_event where membership_id in (select id from membership where user_id in (${uidSel}))`);
    q(`delete from session where user_id in (${uidSel})`);
    q(`delete from idempotency_key where user_id in (${uidSel})`);
    q(`delete from ocr_job where receipt_id in (select id from receipt where household_id in (${hhSel}))`);
    q(`delete from receipt where household_id in (${hhSel})`);
    q(`delete from transaction where household_id in (${hhSel})`);
    q(`delete from household_budget where household_id in (${hhSel})`);
    q(`delete from advisor_insight where household_id in (${hhSel})`);
    q(`delete from savings_goal where household_id in (${hhSel})`);
    q(`delete from membership where household_id in (${hhSel}) or user_id in (${uidSel})`);
    q(`delete from invite where household_id in (${hhSel})`);
    q(`delete from household where owner_user_id in (${uidSel})`);
    q(`delete from public.user where email like '${LIKE}'`);
  } catch (e) {
    console.log(`CLEANUP_ERROR: ${e.message}`);
  }
  const leftover = q1(`select count(*) from public.user where email like '${LIKE}'`);
  const leftoverTx = q1(`select count(*) from transaction t join public.user u on u.id=t.created_by_user_id where u.email like '${LIKE}'`);
  rec("CLEANUP", "zero generated fixture users / transactions remain", leftover === "0" && leftoverTx === "0",
    `users=${leftover} transactions=${leftoverTx} prefix=${PREFIX}`);
}

const passed = results.filter((r) => r.pass).length;
writeFileSync("docs/qa/harness/t008-auth-trash-results.json", JSON.stringify({ run: RUN, prefix: PREFIX, pass: passed, fail: results.length - passed, results }, null, 2));
console.log(`\nSUMMARY pass=${passed} fail=${results.length - passed} total=${results.length}`);
