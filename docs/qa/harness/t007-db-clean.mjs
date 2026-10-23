// QA T-007 scratch: idempotent DB cleanup for a set of email prefixes (children-first FK order).
import { execFileSync } from "node:child_process";

const DB_URL = "postgresql://postgres:postgres@localhost:5432/financial_planner_t003";

const prefixes = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ["qa-t007"];
const emails = prefixes.flatMap(
  (p) => psql(`SELECT email FROM public.user WHERE email LIKE '${p}%'`).split("\n").filter(Boolean).map((s) => s.trim()),
);

function psql(sql) {
  return execFileSync("psql", [DB_URL, "-At", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8" }).trim();
}

for (const email of emails) {
  const q = (s) => s.replaceAll("'", "''");
  psql(`DO ${"$$"} DECLARE r record; uid uuid;
BEGIN
  SELECT u.id INTO uid FROM public.user u WHERE u.email = '${q(email)}';
  IF uid IS NULL THEN RETURN; END IF;
  FOR r IN SELECT id FROM household WHERE owner_user_id = uid OR id IN (SELECT household_id FROM membership WHERE user_id = uid) LOOP
    DELETE FROM advisor_insight WHERE household_id = r.id;
    DELETE FROM savings_goal WHERE household_id = r.id;
    DELETE FROM transaction WHERE household_id = r.id;
    DELETE FROM ocr_job USING receipt WHERE ocr_job.receipt_id = receipt.id AND receipt.household_id = r.id;
    DELETE FROM receipt WHERE household_id = r.id;
    DELETE FROM invite WHERE household_id = r.id;
    DELETE FROM household_budget WHERE household_id = r.id;
    DELETE FROM membership_event WHERE membership_id IN (SELECT id FROM membership WHERE household_id = r.id);
    DELETE FROM membership WHERE household_id = r.id;
    DELETE FROM household WHERE id = r.id;
  END LOOP;
  DELETE FROM membership_event WHERE actor_user_id = uid;
  DELETE FROM session WHERE user_id = uid;
  DELETE FROM idempotency_key WHERE user_id = uid;
  DELETE FROM membership WHERE user_id = uid;
  DELETE FROM public.user WHERE id = uid;
END ${"$$"}`);
  const left = psql(`SELECT count(*) FROM public.user WHERE email = '${q(email)}'`);
  if (left !== "0") throw new Error(`cleanup failed: ${email} still present (count=${left})`);
  console.log(`cleaned ${email}`);
}
console.log(`done; emails processed = ${emails.length}`);
