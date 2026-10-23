/*
  T-009 / F6 OCR privacy QA harness (QA-owned, scratch). SAFE by design:
  it only exercises the DEDUP short-circuit and read routes. It never triggers a
  live Gemini or Vercel Blob call (dedupe returns before blob.put; the image
  route's authorized 200 path is intentionally NOT called here).
  Covers C-19/C-28/C-29 + AC-F6-10 read-side: generic cross-uploader 409,
  same-uploader reuse, job uploader-only, image-route 401/404, Lihat-struk signal.
  Guard: localhost + financial_planner_qa_f6 only.
*/
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

const BASE=process.env.QA_BASE||"http://localhost:3012";
function dbUrl(){ const raw=process.env.DATABASE_URL||""; let u; try{u=new URL(raw);}catch{throw new Error("DATABASE_URL missing/invalid");}
  const host=u.hostname,port=u.port||"5432",db=u.pathname.replace(/^\//,"");
  if(!["localhost","127.0.0.1","::1"].includes(host)||port!=="5432"||db!=="financial_planner_qa_f6") throw new Error("Refusing non-local DB "+host+"/"+db);
  return u.protocol+"//"+u.username+":"+u.password+"@"+u.host+u.pathname; }
const DB=dbUrl();
function q(sql){ return execFileSync("psql",[DB,"-At","-c",sql],{encoding:"utf8"}).trim(); }
function q1(sql){ const v=q(sql); return v===""?null:v; }

const results=[];
function rec(id,name,pass,detail){ results.push({id,name,pass:!!pass,detail}); console.log((pass?"PASS":"FAIL")+" ["+id+"] "+name+" :: "+detail); }
async function req(path,opts){ opts=opts||{}; const method=opts.method||"GET"; const h=Object.assign({},opts.headers||{}); if(opts.body!==undefined) h["content-type"]="application/json"; if(opts.cookie) h.cookie=opts.cookie;
  const r=await fetch(BASE+path,{method,headers:h,body:opts.body===undefined?undefined:JSON.stringify(opts.body)}); let data=null; try{data=await r.json();}catch{}
  const sc=typeof r.headers.getSetCookie==="function"?r.headers.getSetCookie():[]; return {status:r.status,data:data,cookie:sc.map(function(c){return c.split(";")[0];}).join("; ")}; }
function post(p,o){ o=Object.assign({},o||{}); o.method="POST"; return req(p,o); }
function jakartaToday(){ return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()); }
const today=jakartaToday();
const RUN=Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const PREFIX="qa-t009-ocr-"+RUN+"-";
function em(t){ return PREFIX+t+"@test.local"; }
const PW="password123";
let phase="start";
const RID=randomUUID(), JID=randomUUID();

try{
  phase="setup";
  const owner=await post("/api/auth/signup",{body:{email:em("owner"),displayName:"QA OCR Owner",password:PW}});
  const ownerCookie=owner.cookie, ownerId=owner.data.user.id, hh=owner.data.household.id;
  const inv=await post("/api/family/invites",{cookie:ownerCookie});
  const member=await post("/api/auth/signup",{body:{email:em("member"),displayName:"QA OCR Member",password:PW,inviteCode:inv.data.plaintextCode}});
  const memberCookie=member.cookie, memberId=member.data.user.id;
  const mid=q1("select id from membership where user_id='"+memberId+"'");
  await post("/api/family/members/"+mid+"/approve",{cookie:ownerCookie});
  const pW=await post("/api/wallets",{cookie:ownerCookie,body:{name:"OCR Pribadi",scope:"PERSONAL"}});
  const sW=await post("/api/wallets",{cookie:ownerCookie,body:{name:"OCR Bersama",scope:"SHARING"}});
  rec("SETUP","actors + wallets ready",owner.status===201&&member.status===201&&pW.status===201&&sW.status===201,"owner="+owner.status+" member="+member.status+" pW="+pW.status+" sW="+sW.status);

  const bytes=new TextEncoder().encode("qa-ocr-fixture-"+randomUUID());
  const hash=createHash("sha256").update(bytes).digest("hex");
  const size=bytes.byteLength;
  const draft=JSON.stringify({merchant:"Toko QA",totalAmountMinor:35000,currencyCode:"IDR",occurredAt:today,category:"food",taxAmountMinor:null,confidence:0.92,missingFields:[],notes:null});
  q("insert into receipt (id,household_id,uploaded_by_user_id,content_sha256,mime_type,size_bytes,storage_key) values ('"+RID+"','"+hh+"','"+ownerId+"','"+hash+"','image/png',"+size+",'receipts/"+hh+"/"+hash+"')");
  q("insert into ocr_job (id,receipt_id,status,model,result_json,confidence,completed_at) values ('"+JID+"','"+RID+"','SUCCEEDED','gemini-qa','"+draft+"',0.92,now())");
  rec("SEED","receipt + SUCCEEDED job seeded (uploader=owner)",q1("select count(*) from receipt where id='"+RID+"'")==="1"&&q1("select count(*) from ocr_job where id='"+JID+"'")==="1","receipt=1 job=1");

  async function upload(cookie){
    const fd=new FormData();
    fd.append("file", new Blob([bytes],{type:"image/png"}), "struk.png");
    const r=await fetch(BASE+"/api/ocr/receipts",{method:"POST",headers:{cookie:cookie},body:fd});
    let data=null; try{data=await r.json();}catch{}
    return {status:r.status,data:data};
  }

  phase="C-19";
  const memberDup=await upload(memberCookie);
  const mKeys=memberDup.data?Object.keys(memberDup.data):[];
  rec("C19-1","cross-uploader duplicate -> 409 DUPLICATE_RECEIPT",memberDup.status===409&&memberDup.data.error.code==="DUPLICATE_RECEIPT","status="+memberDup.status+" code="+memberDup.data.error.code);
  rec("C19-2","cross-uploader 409 body is generic: only {error}, no job/draft/receiptId/uploader",JSON.stringify(mKeys)===JSON.stringify(["error"])&&!/receiptId|uploadedBy|uploader|job|draft/i.test(JSON.stringify(memberDup.data)),"keys="+mKeys.join(","));

  const ownerDup=await upload(ownerCookie);
  rec("C19-3","same-uploader retry -> 409 with own job+draft+flag (reuse own job)",ownerDup.status===409&&!!ownerDup.data.job&&ownerDup.data.job.id===JID&&"draft" in ownerDup.data,"status="+ownerDup.status+" job="+(ownerDup.data.job&&ownerDup.data.job.id)+" flag="+(ownerDup.data.job&&ownerDup.data.job.receiptSharedWithHousehold));

  phase="C-29";
  const memberJob=await req("/api/ocr/jobs/"+JID,{cookie:memberCookie});
  rec("C29-1","non-uploader GET job -> 404 (uploader-only)",memberJob.status===404&&memberJob.data.error.code==="NOT_FOUND","status="+memberJob.status+" code="+memberJob.data.error.code);
  const ownerJob=await req("/api/ocr/jobs/"+JID,{cookie:ownerCookie});
  rec("C29-2","uploader GET job -> 200 job+draft; flag false before any sharing link",ownerJob.status===200&&ownerJob.data.draft&&ownerJob.data.job.receiptSharedWithHousehold===false,"status="+ownerJob.status+" flag="+ownerJob.data.job.receiptSharedWithHousehold+" draftMerchant="+(ownerJob.data.draft&&ownerJob.data.draft.merchant));

  phase="IMG-auth";
  const unauth=await req("/api/ocr/receipts/"+RID+"/image");
  rec("IMG-1","unauthenticated image request -> 401",unauth.status===401,"status="+unauth.status);
  const memberImgNoLink=await req("/api/ocr/receipts/"+RID+"/image",{cookie:memberCookie});
  rec("IMG-2","non-uploader, no link -> 404 generic (no byte, no Blob call)",memberImgNoLink.status===404&&memberImgNoLink.data.error.code==="NOT_FOUND","status="+memberImgNoLink.status+" code="+memberImgNoLink.data.error.code);
  const unknownImg=await req("/api/ocr/receipts/"+randomUUID()+"/image",{cookie:ownerCookie});
  rec("IMG-3","unknown receipt id -> 404 identical message",unknownImg.status===404&&unknownImg.data.error.message===memberImgNoLink.data.error.message,"unknown='"+unknownImg.data.error.message+"' nolink='"+memberImgNoLink.data.error.message+"'");

  phase="C-30-signal";
  const pTx=await post("/api/transactions",{cookie:ownerCookie,body:{type:"MONEY_OUT",amountMinor:35000,category:"food",occurredAt:today,source:"OCR",receiptId:RID,walletId:pW.data.id}});
  rec("C30-1","owner saves OCR tx on PERSONAL wallet -> 201",pTx.status===201,"status="+pTx.status);
  const pTxId=pTx.data.transactions[0].id;
  const ownerTxP=await req("/api/transactions?limit=50",{cookie:ownerCookie});
  const ownerRow=(ownerTxP.data.rows||[]).find(function(r){return r.id===pTxId;});
  rec("C30-2","owner sees Lihat-struk signal (receiptId non-null) on own PERSONAL row",ownerRow&&ownerRow.receiptId===RID,"receiptId="+(ownerRow&&ownerRow.receiptId));
  const memberTxP=await req("/api/transactions?limit=50",{cookie:memberCookie});
  rec("C30-3","member does NOT see the PERSONAL OCR row",!(memberTxP.data.rows||[]).some(function(r){return r.id===pTxId;}),"visible="+(memberTxP.data.rows||[]).some(function(r){return r.id===pTxId;}));
  const memberImgPersonalLink=await req("/api/ocr/receipts/"+RID+"/image",{cookie:memberCookie});
  rec("C30-4","member image for PERSONAL-only-linked receipt -> 404 (union not satisfied)",memberImgPersonalLink.status===404,"status="+memberImgPersonalLink.status);

  const sTx=await post("/api/transactions",{cookie:ownerCookie,body:{type:"MONEY_OUT",amountMinor:35000,category:"food",occurredAt:today,source:"OCR",receiptId:RID,walletId:sW.data.id}});
  rec("C28-1","owner links same receipt to a SHARING transaction -> 201",sTx.status===201,"status="+sTx.status);
  const sTxId=sTx.data.transactions[0].id;
  const ownerJobShared=await req("/api/ocr/jobs/"+JID,{cookie:ownerCookie});
  rec("C28-2","uploader job flag now true (receipt share-visible via union)",ownerJobShared.data.job.receiptSharedWithHousehold===true,"flag="+ownerJobShared.data.job.receiptSharedWithHousehold);
  const memberTxS=await req("/api/transactions?limit=50",{cookie:memberCookie});
  const memberShareRow=(memberTxS.data.rows||[]).find(function(r){return r.id===sTxId;});
  rec("C28-3","member sees SHARING row with receiptId signal (can Lihat struk)",memberShareRow&&memberShareRow.receiptId===RID,"receiptId="+(memberShareRow&&memberShareRow.receiptId));
  const memberJobAfter=await req("/api/ocr/jobs/"+JID,{cookie:memberCookie});
  rec("C29-3","C-29: non-uploader still 404 on job after image is share-visible",memberJobAfter.status===404,"status="+memberJobAfter.status);

  rec("BLOCKED-IMG-200","authorized image 200-byte path intentionally NOT executed (would call live Vercel Blob; not permitted in QA)",true,"authorized actors: owner (uploader) and member (SHARING union) - route logic inspected; byte path deferred to a Blob-mocked/approved environment");
} catch(err){
  rec("HARNESS","unexpected exception during phase="+phase,false,"EXCEPTION: "+((err&&err.stack)||err));
} finally {
  const LIKE=PREFIX+"%";
  const uidSel="select id from public.user where email like '"+LIKE+"'";
  const hhSel="select id from household where owner_user_id in ("+uidSel+")";
  try{
    q("delete from membership_event where membership_id in (select id from membership where user_id in ("+uidSel+"))");
    q("delete from session where user_id in ("+uidSel+")");
    q("delete from idempotency_key where user_id in ("+uidSel+")");
    q("delete from \"transaction\" where household_id in ("+hhSel+")");
    q("delete from ocr_job where receipt_id in (select id from receipt where household_id in ("+hhSel+"))");
    q("delete from receipt where household_id in ("+hhSel+")");
    q("delete from wallet where household_id in ("+hhSel+")");
    q("delete from household_budget where household_id in ("+hhSel+")");
    q("delete from advisor_insight where household_id in ("+hhSel+")");
    q("delete from savings_goal where household_id in ("+hhSel+")");
    q("delete from membership where household_id in ("+hhSel+") or user_id in ("+uidSel+")");
    q("delete from invite where household_id in ("+hhSel+")");
    q("delete from household where owner_user_id in ("+uidSel+")");
    q("delete from public.user where email like '"+LIKE+"'");
  }catch(e){ console.log("CLEANUP_ERROR: "+e.message); }
  const leftover=q1("select count(*) from public.user where email like '"+LIKE+"'");
  rec("CLEANUP","zero fixture users remain",leftover==="0","users="+leftover);
}
const passed=results.filter(function(r){return r.pass;}).length;
writeFileSync("docs/qa/harness/t009-ocr-results.json",JSON.stringify({run:RUN,prefix:PREFIX,pass:passed,fail:results.length-passed,total:results.length,results:results},null,2));
console.log("\nSUMMARY pass="+passed+" fail="+(results.length-passed)+" total="+results.length);
process.exit(results.length-passed===0?0:1);

