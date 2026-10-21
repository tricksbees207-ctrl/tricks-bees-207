// Full local Supabase Auth (GoTrue MFA) + PostgREST integration acceptance.
// Runs ONLY in disposable CI; uses never-real accounts and never logs secrets.
import assert from 'node:assert/strict';
import {createHmac,randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const url=process.env.WINTER_LOCAL_SUPABASE_URL||'http://127.0.0.1:54321';
const apikey=process.env.ANON_KEY;
assert(apikey&&apikey.length>30,'Local Supabase ANON_KEY missing');
assert(/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(url),'Refuse nonlocal Supabase API destination');

async function call(route,{method='GET',token=apikey,body,expectOk=true}={}){
 const response=await fetch(url+route,{
  method,headers:{apikey,Authorization:'Bearer '+token,
   ...(body===undefined?{}:{'Content-Type':'application/json'}),Accept:'application/json'},
  ...(body===undefined?{}:{body:JSON.stringify(body)})});
 const text=await response.text();
 let value;
 try{value=text?JSON.parse(text):null;}catch{value=text;}
 if(expectOk&&!response.ok){
  // Never print JWTs, MFA secrets or identifying account data from the response.
  throw new Error('Local API '+method+' '+route.split('?')[0]+' failed with HTTP '+response.status+
    ' and code '+(typeof value==='object'?value?.code||value?.error_code||'unknown':'non-JSON'));
 }
 return {status:response.status,ok:response.ok,data:value};
}
function decodeJwt(jwt){
 return JSON.parse(Buffer.from(jwt.split('.')[1],'base64url').toString('utf8'));
}
function base32(str){
 const digits='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
 let bits=0,value=0,result=[];
 for(const ch of str.toUpperCase().replace(/=|\s|-/g,'')){
  const pos=digits.indexOf(ch);assert(pos>=0,'Invalid local TOTP secret encoding');
  value=(value<<5)|pos;bits+=5;
  if(bits>=8){bits-=8;result.push((value>>>bits)&255);}
 }
 return Buffer.from(result);
}
function totp(secret,offset=0){
 const count=Math.floor(Date.now()/30000)+offset;
 const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(count));
 const digest=createHmac('sha1',base32(secret)).update(counter).digest();
 const i=digest[19]&15;
 return String((digest.readUInt32BE(i)&0x7fffffff)%1000000).padStart(6,'0');
}
async function signup(account){
 const email='winter-local-'+randomBytes(7).toString('hex')+'@example.test';
 const password='T3st-'+randomBytes(24).toString('base64url')+'!';
 let data=(await call('/auth/v1/signup',{method:'POST',body:{email,password}})).data;
 if(!data?.access_token){
  data=(await call('/auth/v1/token?grant_type=password',
   {method:'POST',body:{email,password}})).data;
 }
 assert(data?.access_token&&data?.user?.id,'Local email signup must produce a session');
 assert.equal(decodeJwt(data.access_token).aal,'aal1','New session should be AAL1 before MFA');
 console.log('LOCAL AUTH: '+account+' created disposable signed-in AAL1 user');
 return {id:data.user.id,aal1:data.access_token};
}
async function verifyMfa(acct,label){
 const enroll=(await call('/auth/v1/factors',{method:'POST',token:acct.aal1,
   body:{factor_type:'totp',friendly_name:'Winter CI '+label}})).data;
 assert(enroll?.id&&enroll?.totp?.secret,'Local TOTP enroll response incomplete');
 const challenge=(await call('/auth/v1/factors/'+encodeURIComponent(enroll.id)+'/challenge',
   {method:'POST',token:acct.aal1,body:{}})).data;
 assert(challenge?.id,'Local TOTP challenge missing ID');
 let verified;
 for(const off of [0,-1,1]){
  const v=await call('/auth/v1/factors/'+encodeURIComponent(enroll.id)+'/verify',{
   method:'POST',token:acct.aal1,
   body:{challenge_id:challenge.id,code:totp(enroll.totp.secret,off)},expectOk:false
  });
  if(v.ok){verified=v.data;break;}
 }
 assert(verified?.access_token,'Local GoTrue did not verify a real TOTP challenge');
 assert.equal(decodeJwt(verified.access_token).aal,'aal2','MFA verification must issue AAL2 JWT');
 acct.aal2=verified.access_token;
 console.log('LOCAL AUTH: '+label+' verified TOTP and promoted to AAL2');
}
function seedColony(userId,number){
 assert(/^[0-9a-f-]{36}$/i.test(userId),'Bad synthetic user UUID');
 execFileSync('psql',['-X','-v','ON_ERROR_STOP=1','-c',
   `INSERT INTO public."Hive_Colonies"(hive_id,user_id,colony_name,colony_status)
    VALUES (1,'${userId}'::uuid,'Synthetic API colony ${number}','active');`],{stdio:'pipe'});
}
const a=await signup('A');
const b=await signup('B');
seedColony(a.id,1);seedColony(b.id,2);

// Both accounts and the anonymous role are blocked before verified MFA.
const noMfa=await call('/rest/v1/Winter_Seasons?select=id',{token:a.aal1});
assert.deepEqual(noMfa.data,[],'AAL1 must see no season records');
const anon=await call('/rest/v1/Winter_Seasons?select=id',{expectOk:false});
assert(!anon.ok,'Anonymous API caller must not read Winter table');
const noMfaWrite=await call('/rest/v1/rpc/winter_start_season',{
 method:'POST',token:a.aal1,body:{p_start_year:2030},expectOk:false});
assert(!noMfaWrite.ok,'AAL1 must not create a winter season via RPC');
console.log('LOCAL REST: anonymous and AAL1 table/RPC access denied');

await verifyMfa(a,'A');
await verifyMfa(b,'B');

const seasonA=(await call('/rest/v1/rpc/winter_start_season',
 {method:'POST',token:a.aal2,body:{p_start_year:2030}})).data;
assert(Number.isInteger(seasonA)&&seasonA>0,'Owner A season creation failed');
const ownerA=(await call('/rest/v1/Winter_Seasons?select=id,user_id,start_year',
 {token:a.aal2})).data;
assert.equal(ownerA.length,1);
assert.equal(ownerA[0].user_id,a.id);

const partsA=(await call('/rest/v1/Winter_Participation?select=id,colony_id,season_id',
 {token:a.aal2})).data;
assert.equal(partsA.length,1,'Owner A should have one synthetic Winter participant');
const checksA=(await call('/rest/v1/Winter_Checklist_Items?select=id,participation_id',
 {token:a.aal2})).data;
assert.equal(checksA.length,10,'Winter start should create ten checklist items through REST-visible RLS');

const otherB=(await call('/rest/v1/Winter_Seasons?select=id',{token:b.aal2})).data;
assert.deepEqual(otherB,[],'MFA-verified account B cannot read owner A season');
const aStillAal1=(await call('/rest/v1/Winter_Seasons?select=id',{token:a.aal1})).data;
assert.deepEqual(aStillAal1,[],'Original AAL1 token must not see Winter records');
const wrongOwnerClose=await call('/rest/v1/rpc/winter_close_season',{
 method:'POST',token:b.aal2,
 body:{p_season_id:seasonA,p_unresolved:{},p_closure_notes:null},expectOk:false});
assert(!wrongOwnerClose.ok,'Another AAL2 owner must not close the first owner\'s season');

const snapshotVersion=(await call('/rest/v1/rpc/winter_close_season',{
 method:'POST',token:a.aal2,body:{p_season_id:seasonA,
 p_unresolved:{[partsA[0].id]:'Synthetic unresolved winter closure'},p_closure_notes:null}})).data;
assert.equal(snapshotVersion,1,'First winter closure must save snapshot version one');
const history=(await call('/rest/v1/Winter_Snapshots?select=version,season_id',{token:a.aal2})).data;
assert.equal(history.length,1,'MFA owner must see saved winter snapshot');
const edit=await call('/rest/v1/Winter_Snapshots?id=eq.'+seasonA,{
 method:'PATCH',token:a.aal2,body:{version:999},expectOk:false});
assert(!edit.ok,'MFA owner must not directly edit immutable winter snapshots');
console.log('PASS LOCAL SUPABASE AUTH + REST: two authentic TOTP-AAL2 accounts, ownership isolation, 10 checklists, protected season RPC, immutable snapshot, anon/AAL1 denied.');
