/*
  T-009 / F6 wallet HTTP actor-matrix QA harness (QA-owned, scratch).

  Exercises the REAL HTTP routes against the local migrated scratch DB
  (financial_planner_dev_t009r1) with a real Next server:
    AC-F6-1..AC-F6-8, AC-F6-11; design C-27/C-31; journey W1..W10, W14/W15.
  OCR byte-serving (Blob/Gemini) is NOT invoked; see docs/qa report.

  Guard: refuses any DATABASE_URL that is not localhost + financial_planner_dev_t009r1.
  Run: QA_BASE=http://localhost:3012 bun docs/qa/harness/t009-wallets.qa.mjs
*/
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

const BASE = process.env.QA_BASE || "http://localhost:3012";

function localDbUrl() {
  const raw = process.env.DATABASE_URL || "";
  let u;
  try { u = new URL(raw); } catch { throw new Error("DATABASE_URL missing/invalid; refusing to run."); }
  const host = u.hostname, port = u.port || "5432", db = u.pathname.replace(/^\//, "");
  if (!["localhost","127.0.0.1","::1"].includes(host) || port !== "5432" || db !== "financial_planner_dev_t009r1") {
    throw new Error("Refusing non-local DB target (host=" + host + " port=" + port + " db=" + db + ").");
  }
  return u.protocol + "//" + u.username + ":" + u.password + "@" + u.host + u.pathname;
}
const DB_URL = localDbUrl();
function q(sql){ return execFileSync("psql",[DB_URL,"-At","-c",sql],{encoding:"utf8"}).trim(); }
function q1(sql){ const v=q(sql); return v===""?null:v; }

const results=[];
function rec(id,name,pass,detail){ results.push({id,name,pass:!!pass,detail}); console.log((pass?"PASS":"FAIL")+" ["+id+"] "+name+" :: "+detail); }

async function req(path,opts){
  opts=opts||{};
  const method=opts.method||"GET";
  const h=Object.assign({},opts.headers||{});
  if(opts.body!==undefined) h["content-type"]="application/json";
  if(opts.cookie) h.cookie=opts.cookie;
  const r=await fetch(BASE+path,{method,headers:h,body:opts.body===undefined?undefined:JSON.stringify(opts.body)});
  let data=null; try{data=await r.json();}catch{}
  const sc=typeof r.headers.getSetCookie==="function"?r.headers.getSetCookie():[];
  const cookieOut=sc.map(function(c){return c.split(";")[0];}).join("; ");
  return {status:r.status,data:data,cookie:cookieOut};
}
function post(p,o){ o=Object.assign({},o||{}); o.method="POST"; return req(p,o); }
function patch(p,o){ o=Object.assign({},o||{}); o.method="PATCH"; return req(p,o); }
function put(p,o){ o=Object.assign({},o||{}); o.method="PUT"; return req(p,o); }

function jakartaToday(){ return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()); }
const today=jakartaToday();

const RUN=Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const PREFIX="qa-t009-wallet-"+RUN+"-";
function em(t){ return PREFIX+t+"@test.local"; }
const PW="password123";
const OWNER=em("owner"),MEMBER=em("member"),PENDING=em("pending"),OWNERB=em("ownerb"),REVK=em("revk");

let phase="start";

try{
  phase="setup";
  const owner=await post("/api/auth/signup",{body:{email:OWNER,displayName:"QA Owner",password:PW}});
  const ownerCookie=owner.cookie, ownerId=owner.data&&owner.data.user&&owner.data.user.id, hhA=owner.data&&owner.data.household&&owner.data.household.id;

  const inv=await post("/api/family/invites",{cookie:ownerCookie});
  const member=await post("/api/auth/signup",{body:{email:MEMBER,displayName:"QA Member",password:PW,inviteCode:inv.data&&inv.data.plaintextCode}});
  const memberCookie=member.cookie, memberId=member.data&&member.data.user&&member.data.user.id;
  const memberMid=q1("select id from membership where user_id='"+memberId+"'");
  const memberApprove=await post("/api/family/members/"+memberMid+"/approve",{cookie:ownerCookie});

  const invP=await post("/api/family/invites",{cookie:ownerCookie});
  const pending=await post("/api/auth/signup",{body:{email:PENDING,displayName:"QA Pending",password:PW,inviteCode:invP.data&&invP.data.plaintextCode}});
  const pendingCookie=pending.cookie;

  const ownerB=await post("/api/auth/signup",{body:{email:OWNERB,displayName:"QA Owner B",password:PW}});
  const ownerBCookie=ownerB.cookie;

  rec("SETUP","owner+approved member+pending+ownerB created",owner.status===201&&memberApprove.status===200&&pending.data&&pending.data.status==="PENDING"&&ownerB.status===201,
    "owner="+owner.status+" approve="+memberApprove.status+" pending="+(pending.data&&pending.data.status));

  phase="F6-1";
  const def=await post("/api/wallets",{cookie:ownerCookie,body:{name:"Default Scope"}});
  rec("F6-1a","create without scope -> 201 PERSONAL, opening blank -> 0",def.status===201&&def.data.scope==="PERSONAL"&&def.data.openingBalanceMinor===0&&def.data.balanceMinor===0,
    "status="+def.status+" scope="+def.data.scope+" open="+def.data.openingBalanceMinor);

  const personalA=await post("/api/wallets",{cookie:ownerCookie,body:{name:"Pribadi A",scope:"PERSONAL",openingBalanceMinor:100000}});
  const sharingA=await post("/api/wallets",{cookie:ownerCookie,body:{name:"Bersama A",scope:"SHARING",purpose:"Biaya rumah"}});
  const personalM=await post("/api/wallets",{cookie:memberCookie,body:{name:"Pribadi M",scope:"PERSONAL"}});
  rec("F6-1b","owner creates PERSONAL+SHARING; member creates PERSONAL (all approved)",
    personalA.status===201&&sharingA.status===201&&personalM.status===201,
    "pA="+personalA.status+" sA="+sharingA.status+" pM="+personalM.status);
  const personalAId=personalA.data.id, sharingAId=sharingA.data.id, personalMId=personalM.data.id;
  await post("/api/transactions",{cookie:ownerCookie,body:{type:"MONEY_IN",amountMinor:1000,category:"income",occurredAt:today,walletId:personalAId}});

  const empty=await post("/api/wallets",{cookie:ownerCookie,body:{name:"   "}});
  const long=await post("/api/wallets",{cookie:ownerCookie,body:{name:"x".repeat(81)}});
  const longPurpose=await post("/api/wallets",{cookie:ownerCookie,body:{name:"P",purpose:"y".repeat(81)}});
  const neg=await post("/api/wallets",{cookie:ownerCookie,body:{name:"Neg",openingBalanceMinor:-1}});
  rec("F6-1c","name empty/81 chars, purpose 81, opening -1 -> 422",
    empty.status===422&&long.status===422&&longPurpose.status===422&&neg.status===422,
    "empty="+empty.status+" name81="+long.status+" purpose81="+longPurpose.status+" neg="+neg.status);
  rec("F6-1d","opening negative fieldErrors.openingBalanceMinor present",!!(neg.data&&neg.data.error&&neg.data.error.fieldErrors&&neg.data.error.fieldErrors.openingBalanceMinor),JSON.stringify(neg.data&&neg.data.error&&neg.data.error.fieldErrors));

  const pendingCreate=await post("/api/wallets",{cookie:pendingCookie,body:{name:"Nope"}});
  rec("F6-1e","PENDING create wallet -> 403 ACCESS_PENDING",pendingCreate.status===403&&pendingCreate.data.error.code==="ACCESS_PENDING",
    "status="+pendingCreate.status+" code="+pendingCreate.data.error.code);

  phase="F6-3";
  const scopePatch=await patch("/api/wallets/"+personalAId,{cookie:ownerCookie,body:{scope:"SHARING"}});
  rec("F6-3a","PATCH scope PERSONAL->SHARING -> 422 VALIDATION_ERROR fieldErrors.scope",
    scopePatch.status===422&&scopePatch.data.error.code==="VALIDATION_ERROR"&&!!(scopePatch.data.error.fieldErrors&&scopePatch.data.error.fieldErrors.scope),
    "status="+scopePatch.status+" code="+scopePatch.data.error.code+" fe="+JSON.stringify(scopePatch.data.error.fieldErrors));
  const afterScope=await req("/api/wallets/"+personalAId,{cookie:ownerCookie});
  rec("F6-3b","scope unchanged after rejected mutation",afterScope.data.scope==="PERSONAL","scope="+afterScope.data.scope);

  const namePatch=await patch("/api/wallets/"+sharingAId,{cookie:memberCookie,body:{name:"Bersama A (edit member)",purpose:"updated"}});
  rec("F6-3c","any APPROVED member edits SHARING name/purpose -> 200",namePatch.status===200&&namePatch.data.name==="Bersama A (edit member)","status="+namePatch.status+" name="+namePatch.data.name);

  const memberEditPersonal=await patch("/api/wallets/"+personalAId,{cookie:memberCookie,body:{name:"hack"}});
  rec("F6-3d","member edits other's PERSONAL -> 404 (no existence leak, not 403)",memberEditPersonal.status===404&&memberEditPersonal.data.error.code==="NOT_FOUND","status="+memberEditPersonal.status+" code="+memberEditPersonal.data.error.code);

  const memberArchiveSharing=await post("/api/wallets/"+sharingAId+"/archive",{cookie:memberCookie});
  rec("F6-3e","non-creator member archives SHARING -> 403 ACCESS_DENIED",memberArchiveSharing.status===403&&memberArchiveSharing.data.error.code==="ACCESS_DENIED","status="+memberArchiveSharing.status+" code="+memberArchiveSharing.data.error.code);

  const archW=await post("/api/wallets",{cookie:ownerCookie,body:{name:"Arsip Bersama",scope:"SHARING"}});
  const archWId=archW.data.id;
  await post("/api/transactions",{cookie:ownerCookie,body:{type:"MONEY_IN",amountMinor:50000,category:"income",occurredAt:today,walletId:archWId}});
  const arch=await post("/api/wallets/"+archWId+"/archive",{cookie:ownerCookie});
  const activeList=await req("/api/wallets?view=active",{cookie:ownerCookie});
  const archivedList=await req("/api/wallets?view=archived",{cookie:ownerCookie});
  function has(list,id){ return (list||[]).some(function(w){return w.id===id;}); }
  rec("F6-3f","creator archives SHARING -> 200; gone from active, present in archived",
    arch.status===200&&!has(activeList.data.wallets,archWId)&&has(archivedList.data.wallets,archWId),
    "archive="+arch.status+" inActive="+has(activeList.data.wallets,archWId)+" inArchived="+has(archivedList.data.wallets,archWId));

  const memberRestore=await post("/api/wallets/"+archWId+"/restore",{cookie:memberCookie});
  rec("F6-3g","non-creator restore SHARING -> 403",memberRestore.status===403&&memberRestore.data.error.code==="ACCESS_DENIED","status="+memberRestore.status+" code="+memberRestore.data.error.code);
  const ownerRestore=await post("/api/wallets/"+archWId+"/restore",{cookie:ownerCookie});
  rec("F6-3h","creator restore SHARING -> 200 archivedAt null",ownerRestore.status===200&&ownerRestore.data.archivedAt===null,"status="+ownerRestore.status+" archivedAt="+ownerRestore.data.archivedAt);

  await post("/api/wallets/"+archWId+"/archive",{cookie:ownerCookie});
  const useArchived=await post("/api/transactions",{cookie:ownerCookie,body:{type:"MONEY_OUT",amountMinor:1000,category:"food",occurredAt:today,walletId:archWId}});
  const transferToArchived=await post("/api/transactions",{cookie:ownerCookie,body:{type:"TRANSFER",amountMinor:1000,occurredAt:today,fromWalletId:personalAId,toWalletId:archWId}});
  rec("F6-3i","archived wallet rejected for new tx and transfer -> 422 WALLET_UNAVAILABLE",
    useArchived.status===422&&useArchived.data.error.code==="WALLET_UNAVAILABLE"&&transferToArchived.status===422,
    "tx="+useArchived.status+"/"+useArchived.data.error.code+" transfer="+transferToArchived.status+"/"+transferToArchived.data.error.code);

  phase="F6-2";
  const memberList=await req("/api/wallets?view=all",{cookie:memberCookie});
  const mlIds=(memberList.data.wallets||[]).map(function(w){return w.id;});
  rec("F6-2a","member list shows SHARING + own PERSONAL, never other's PERSONAL",
    mlIds.indexOf(sharingAId)>=0&&mlIds.indexOf(personalMId)>=0&&mlIds.indexOf(personalAId)<0,
    "sharing="+(mlIds.indexOf(sharingAId)>=0)+" ownPersonal="+(mlIds.indexOf(personalMId)>=0)+" otherPersonal="+(mlIds.indexOf(personalAId)>=0));
  const getOther=await req("/api/wallets/"+personalAId,{cookie:memberCookie});
  rec("F6-2b","member GET other's PERSONAL by id -> 404",getOther.status===404&&getOther.data.error.code==="NOT_FOUND","status="+getOther.status);
  const crossHh=await req("/api/wallets/"+sharingAId,{cookie:ownerBCookie});
  rec("F6-2c","cross-household GET SHARING -> 404",crossHh.status===404&&crossHh.data.error.code==="NOT_FOUND","status="+crossHh.status);
  const unknown=await req("/api/wallets/"+randomUUID(),{cookie:memberCookie});
  rec("F6-2d","unknown id message identical to private id (no existence leak)",unknown.data.error.message===getOther.data.error.message,"unknown='"+unknown.data.error.message+"' private='"+getOther.data.error.message+"'");

  phase="F6-4";
  const noWallet=await post("/api/transactions",{cookie:ownerCookie,body:{type:"MONEY_OUT",amountMinor:1000,category:"food",occurredAt:today}});
  rec("F6-4a","MONEY_OUT without walletId -> 422 walletId",noWallet.status===422&&!!(noWallet.data.error.fieldErrors&&noWallet.data.error.fieldErrors.walletId),"status="+noWallet.status+" fe="+JSON.stringify(noWallet.data.error.fieldErrors));
  const noWalletIn=await post("/api/transactions",{cookie:ownerCookie,body:{type:"MONEY_IN",amountMinor:1000,category:"income",occurredAt:today}});
  rec("F6-4b","MONEY_IN without walletId -> 422",noWalletIn.status===422,"status="+noWalletIn.status);

  const balW=await post("/api/wallets",{cookie:ownerCookie,body:{name:"Balance W",scope:"PERSONAL"}});
  const balWId=balW.data.id;
  await post("/api/transactions",{cookie:ownerCookie,body:{type:"MONEY_IN",amountMinor:100000,category:"income",occurredAt:today,walletId:balWId}});
  await post("/api/transactions",{cookie:ownerCookie,body:{type:"MONEY_OUT",amountMinor:30000,category:"food",occurredAt:today,walletId:balWId}});
  const balGet=await req("/api/wallets/"+balWId,{cookie:ownerCookie});
  rec("F6-4c","server balance = opening + in - out = 70000",balGet.data.balanceMinor===70000,"balance="+balGet.data.balanceMinor);

  const foreignWallet=await post("/api/transactions",{cookie:ownerCookie,body:{type:"MONEY_OUT",amountMinor:1000,category:"food",occurredAt:today,walletId:personalMId}});
  rec("F6-4d","owner tx to member's PERSONAL wallet -> 404 safe",foreignWallet.status===404&&foreignWallet.data.error.code==="NOT_FOUND","status="+foreignWallet.status+" code="+foreignWallet.data.error.code);

  const big=await post("/api/transactions",{cookie:ownerCookie,body:{type:"MONEY_IN",amountMinor:500000,category:"income",occurredAt:today,walletId:balWId}});
  const trashBig=await post("/api/transactions/"+big.data.transactions[0].id+"/trash",{cookie:ownerCookie});
  const balAfterTrash=await req("/api/wallets/"+balWId,{cookie:ownerCookie});
  rec("F6-4e","trashed row excluded from balance (back to 70000)",trashBig.status===200&&balAfterTrash.data.balanceMinor===70000,"trash="+trashBig.status+" balance="+balAfterTrash.data.balanceMinor);

  phase="F6-5";
  const sameTransfer=await post("/api/transactions",{cookie:ownerCookie,body:{type:"TRANSFER",amountMinor:1000,occurredAt:today,fromWalletId:balWId,toWalletId:balWId}});
  rec("F6-5a","transfer same wallet -> 422 + differing-from-target message",sameTransfer.status===422&&!!(sameTransfer.data.error.fieldErrors&&sameTransfer.data.error.fieldErrors.toWalletId),"status="+sameTransfer.status+" code="+sameTransfer.data.error.code+" fe="+JSON.stringify(sameTransfer.data.error.fieldErrors));

  const crossTransfer=await post("/api/transactions",{cookie:ownerCookie,body:{type:"TRANSFER",amountMinor:25000,occurredAt:today,fromWalletId:balWId,toWalletId:sharingAId,note:"xfer priv"}});
  const legs=crossTransfer.data.transactions||[];
  rec("F6-5b","cross-scope transfer -> 201 two legs same group, one per wallet",
    crossTransfer.status===201&&legs.length===2&&legs[0].transferGroupId===legs[1].transferGroupId&&new Set(legs.map(function(l){return l.wallet&&l.wallet.id;})).size===2,
    "status="+crossTransfer.status+" legs="+legs.length+" groups="+new Set(legs.map(function(l){return l.transferGroupId;})).size);
  const crossGroup=legs[0]&&legs[0].transferGroupId;
  const outLeg=legs.find(function(l){return l.type==="MONEY_OUT";});
  const inLeg=legs.find(function(l){return l.type==="MONEY_IN";});

  const memberTx=await req("/api/transactions?limit=50",{cookie:memberCookie});
  const memberCross=(memberTx.data.rows||[]).filter(function(r){return r.transferGroupId===crossGroup||(outLeg&&r.id===outLeg.id)||(inLeg&&r.id===inLeg.id);});
  const memberGeneric=memberCross.length>0&&memberCross.every(function(r){return r.wallet===null&&r.note===null&&r.receiptId===null&&r.transferGroupId===null&&r.source===null&&r.category===null;});
  rec("F6-6a","member cross-scope rows are generic (wallet/note/receipt/group/source/category null)",
    memberGeneric,"memberRows="+memberCross.length+" sample="+JSON.stringify(memberCross[0]||null));
  rec("F6-6b","member still sees the SHARING leg amount/date (generic)",memberCross.some(function(r){return inLeg&&r.id===inLeg.id;}),"seesSharingLeg="+memberCross.some(function(r){return inLeg&&r.id===inLeg.id;}));

  const ownerTx=await req("/api/transactions?limit=50",{cookie:ownerCookie});
  const ownerCrossRows=(ownerTx.data.rows||[]).filter(function(r){return (outLeg&&r.id===outLeg.id)||(inLeg&&r.id===inLeg.id);});
  rec("F6-6c","owner sees both legs with wallet refs (and note not lost)",
    ownerCrossRows.length===2&&ownerCrossRows.every(function(r){return r.wallet!==null;})&&ownerCrossRows.every(function(r){return r.note==="xfer priv";}),
    "rows="+ownerCrossRows.length+" wallets="+JSON.stringify(ownerCrossRows.map(function(r){return r.wallet&&r.wallet.name;})));

  const memberTrashXfer=await post("/api/transactions/"+inLeg.id+"/trash",{cookie:memberCookie});
  rec("F6-5c","member (non-creator, non-owner) trashes cross-scope transfer -> 403",
    memberTrashXfer.status===403&&memberTrashXfer.data.error.code==="ACCESS_DENIED","status="+memberTrashXfer.status+" code="+memberTrashXfer.data.error.code);
  const ownerTrashXfer=await post("/api/transactions/"+inLeg.id+"/trash",{cookie:ownerCookie});
  const legsAfterTrash=q1("select count(*) from \"transaction\" where transfer_group_id='"+crossGroup+"' and deleted_at is not null");
  rec("F6-5d","owner trash -> both legs soft-deleted atomically",ownerTrashXfer.status===200&&String(legsAfterTrash)==="2","status="+ownerTrashXfer.status+" deletedLegs="+legsAfterTrash);
  const ownerRestoreXfer=await post("/api/transactions/"+inLeg.id+"/restore",{cookie:ownerCookie});
  const legsAfterRestore=q1("select count(*) from \"transaction\" where transfer_group_id='"+crossGroup+"' and deleted_at is null");
  rec("F6-5e","owner restore -> both legs active atomically",ownerRestoreXfer.status===200&&String(legsAfterRestore)==="2","status="+ownerRestoreXfer.status+" activeLegs="+legsAfterRestore);

  phase="F6-7";
  const dashOwner=await req("/api/dashboard",{cookie:ownerCookie});
  const dashMember=await req("/api/dashboard",{cookie:memberCookie});
  rec("F6-7a","dashboard exposes sharedBalanceMinor and personalBalanceMinor separately",
    typeof dashOwner.data.sharedBalanceMinor==="number"&&typeof dashOwner.data.personalBalanceMinor==="number",
    "shared="+dashOwner.data.sharedBalanceMinor+" personal="+dashOwner.data.personalBalanceMinor);
  const memberPersonal=dashMember.data.personalBalanceMinor;
  const ownerPersonal=dashOwner.data.personalBalanceMinor;
  rec("F6-7b","member personal summary excludes owner's PERSONAL balances",memberPersonal===0&&ownerPersonal!==0,
    "memberPersonal="+memberPersonal+" ownerPersonal="+ownerPersonal);
  const memberCardIds=(dashMember.data.wallets||[]).map(function(w){return w.id;});
  rec("F6-7c","dashboard carousel has active wallets only and hides other's PERSONAL",
    memberCardIds.indexOf(archWId)<0&&memberCardIds.indexOf(personalAId)<0&&memberCardIds.indexOf(sharingAId)>=0,
    "archivedInCarousel="+(memberCardIds.indexOf(archWId)>=0)+" ownerPersonal="+(memberCardIds.indexOf(personalAId)>=0));
  rec("F6-7d","archived SHARING balance still counted in shared total (>=50000)",
    dashOwner.data.sharedBalanceMinor>=50000,"shared="+dashOwner.data.sharedBalanceMinor);

  phase="F6-8";
  await post("/api/transactions",{cookie:ownerCookie,body:{type:"MONEY_OUT",amountMinor:9000,category:"food",occurredAt:today,walletId:balWId}});
  const sharingOutW=await post("/api/wallets",{cookie:ownerCookie,body:{name:"Sharing Out W",scope:"SHARING"}});
  const sharingOutId=sharingOutW.data.id;
  await post("/api/transactions",{cookie:ownerCookie,body:{type:"MONEY_OUT",amountMinor:4000,category:"food",occurredAt:today,walletId:sharingOutId}});
  const dashSpend=await req("/api/dashboard",{cookie:ownerCookie});
  const spendTotal=dashSpend.data.spending.totalOutMinor;
  rec("F6-8a","dashboard spending counts SHARING MONEY_OUT only (4000), not PERSONAL (9000) nor transfers",
    spendTotal===4000,"spendingTotal="+spendTotal);
  const budgetPut=await put("/api/budget",{cookie:ownerCookie,body:{amountMinor:100000}});
  const budgetGet=await req("/api/budget",{cookie:ownerCookie});
  rec("F6-8b","budget PUT/GET spent SHARING-only = 4000, remaining 96000",budgetPut.status===200&&budgetGet.data.spentMinor===4000&&budgetGet.data.remainingMinor===96000,"put="+budgetPut.status+" spent="+budgetGet.data.spentMinor+" remaining="+budgetGet.data.remainingMinor);

  phase="F6-11";
  const pList=await req("/api/wallets",{cookie:pendingCookie});
  const pTx=await req("/api/transactions",{cookie:pendingCookie});
  const pDash=await req("/api/dashboard",{cookie:pendingCookie});
  rec("F6-11a","PENDING denied on wallets/transactions/dashboard -> 403 ACCESS_PENDING",
    pList.status===403&&pTx.status===403&&pDash.status===403&&pList.data.error.code==="ACCESS_PENDING",
    "list="+pList.status+" tx="+pTx.status+" dash="+pDash.status+" code="+pList.data.error.code);

  phase="W15";
  const pStill=await req("/api/wallets/"+personalAId,{cookie:memberCookie});
  const pTxCountHh=q1("select count(*) from \"transaction\" where wallet_id='"+personalAId+"'");
  rec("F6-15a","after scope mutation attempt, member still cannot see PERSONAL history (404)",
    pStill.status===404&&String(pTxCountHh)!=="0","status="+pStill.status+" personalTxRows="+pTxCountHh);

  phase="W14";
  const invR=await post("/api/family/invites",{cookie:ownerCookie});
  const revk=await post("/api/auth/signup",{body:{email:REVK,displayName:"QA Revk",password:PW,inviteCode:invR.data.plaintextCode}});
  const revkCookie=revk.cookie;
  const revkMid=q1("select id from membership where user_id='"+(revk.data.user.id)+"'");
  await post("/api/family/members/"+revkMid+"/approve",{cookie:ownerCookie});
  const revkBefore=await req("/api/wallets",{cookie:revkCookie});
  await post("/api/family/members/"+revkMid+"/revoke",{cookie:ownerCookie,body:{reason:"qa"}});
  const revkAfter=await req("/api/wallets",{cookie:revkCookie});
  rec("F6-14a","approved wallet access 200, after revoke -> 403 ACCESS_REVOKED",
    revkBefore.status===200&&revkAfter.status===403&&revkAfter.data.error.code==="ACCESS_REVOKED",
    "before="+revkBefore.status+" after="+revkAfter.status+" code="+revkAfter.data.error.code);

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
    q("delete from ocr_job where receipt_id in (select id from receipt where household_id in ("+hhSel+"))");
    q("delete from receipt where household_id in ("+hhSel+")");
    q("delete from \"transaction\" where household_id in ("+hhSel+")");
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
const out={run:RUN,prefix:PREFIX,pass:passed,fail:results.length-passed,total:results.length,results:results};
writeFileSync("docs/qa/harness/t009-wallets-devdb-results.json",JSON.stringify(out,null,2));
console.log("\nSUMMARY pass="+passed+" fail="+(results.length-passed)+" total="+results.length);
process.exit(results.length-passed===0?0:1);



