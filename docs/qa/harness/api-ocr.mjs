/* T-006 OCR integration harness against the running app (real Gemini + Blob + DB). */
import { readFileSync, writeFileSync } from "node:fs";
const BASE = process.env.QA_BASE || "http://localhost:3010";
const results = [];
const rec = (id, name, pass, detail) => { results.push({ id, name, pass, detail }); console.log(`${pass ? "PASS" : "FAIL"} [${id}] ${name} :: ${detail}`); };
const cookieOf = (r) => (typeof r.headers.getSetCookie === "function" ? r.headers.getSetCookie() : []).map((c) => c.split(";")[0]).join("; ");
async function login(email, password) {
  const r = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
  return { status: r.status, cookie: cookieOf(r) };
}
async function countActive(cookie) { const r = await fetch(`${BASE}/api/transactions?limit=50`, { headers: { cookie } }); const d = await r.json().catch(() => null); return (d?.rows ?? []).length; }
async function upload(cookie, bytes, filename, mime, withKey = true) {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: mime }), filename);
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (withKey) headers["idempotency-key"] = crypto.randomUUID();
  const r = await fetch(`${BASE}/api/ocr/receipts`, { method: "POST", headers, body: form });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data };
}
async function main() {
  const owner = await login("qa-owner@test.local", "QATest123!");
  const png = readFileSync("docs/qa/harness/fixtures/receipt.png");

  // 401 unauthenticated
  const anon = await upload(null, png, "receipt.png", "image/png");
  rec("OCR-0", "unauthenticated upload -> 401", anon.status === 401, `status=${anon.status}`);

  const before = await countActive(owner.cookie);

  // valid upload
  const up = await upload(owner.cookie, png, "receipt.png", "image/png");
  const job = up.data?.job; const draft = up.data?.draft;
  rec("OCR-1", "valid receipt upload -> 200 job+draft", up.status === 200 && job?.status === "SUCCEEDED" && !!draft, `status=${up.status} jobStatus=${job?.status} errorCode=${job?.errorCode}`);
  if (job?.status !== "SUCCEEDED") console.log("   job=", JSON.stringify(job).slice(0, 300));
  rec("OCR-2", "draft fields extracted (merchant/total/date/confidence)", !!draft && typeof draft.confidence === "number" && (draft.merchant !== null || draft.totalAmountMinor !== null), `draft=${JSON.stringify(draft).slice(0, 300)}`);
  rec("OCR-3", "draft total looks like the receipt (150000 +/- rounding)", !!draft && draft.totalAmountMinor !== null && Math.abs(draft.totalAmountMinor - 150000) <= 50000, `total=${draft?.totalAmountMinor}`);

  const after = await countActive(owner.cookie);
  rec("OCR-4", "OCR upload does NOT create a transaction", after === before, `before=${before} after=${after}`);

  // duplicate (same bytes, new key)
  const dup = await upload(owner.cookie, png, "receipt.png", "image/png");
  rec("OCR-5", "duplicate receipt -> 409 DUPLICATE_RECEIPT + job/draft", dup.status === 409 && dup.data?.error?.code === "DUPLICATE_RECEIPT" && !!dup.data?.job, `status=${dup.status} code=${dup.data?.error?.code} hasJob=${!!dup.data?.job} hasDraft=${!!dup.data?.draft}`);

  // invalid mime
  const gif = await upload(owner.cookie, png, "receipt.gif", "image/gif");
  rec("OCR-6", "invalid mime -> 422 FILE_INVALID", gif.status === 422 && gif.data?.error?.code === "FILE_INVALID", `status=${gif.status} code=${gif.data?.error?.code}`);

  // oversize
  const big = Buffer.alloc(4_194_305, 7);
  const over = await upload(owner.cookie, big, "big.png", "image/png");
  rec("OCR-7", "file > 4MB -> 422 FILE_INVALID", over.status === 422 && over.data?.error?.code === "FILE_INVALID", `status=${over.status} code=${over.data?.error?.code}`);

  // confirm draft -> transaction with source OCR
  if (job?.status === "SUCCEEDED" && draft) {
    const amount = draft.totalAmountMinor ?? 150000;
    const cat = draft.category && ["food","transport","bills","shopping","health","education","entertainment","gift_donation","other"].includes(draft.category) ? draft.category : "food";
    const confirm = await fetch(`${BASE}/api/transactions`, { method: "POST", headers: { "content-type": "application/json", cookie: owner.cookie, "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ type: "MONEY_OUT", amountMinor: amount, category: cat, occurredAt: new Date().toISOString().slice(0,10), merchant: draft.merchant ?? "Warung", source: "OCR", receiptId: job.receiptId }) });
    const cbody = await confirm.json().catch(() => null);
    rec("OCR-8", "confirm draft -> 201 source=OCR", confirm.status === 201 && cbody?.transactions?.[0]?.source === "OCR", `status=${confirm.status} source=${cbody?.transactions?.[0]?.source}`);
  } else {
    rec("OCR-8", "confirm draft -> 201 source=OCR", false, "skipped: draft not available (OCR-1 failed)");
  }

  const summary = { base: BASE, at: new Date().toISOString(), pass: results.filter((r) => r.pass).length, fail: results.filter((r) => !r.pass).length, results };
  writeFileSync("docs/qa/harness/results-ocr.json", JSON.stringify(summary, null, 2));
  console.log(`\nSUMMARY pass=${summary.pass} fail=${summary.fail} total=${results.length}`);
}
main().catch((e) => { console.error("OCR HARNESS ERROR", e); process.exit(1); });
