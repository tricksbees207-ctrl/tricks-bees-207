// Genuine Chrome UI acceptance against the disposable local Supabase Auth + PostgREST.
// Temporary in-memory HTML substitution prevents any production API contact.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {createHmac,randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';

const api='http://127.0.0.1:54321',host='http://127.0.0.1:8765';
assert.equal(process.env.WINTER_LOCAL_SUPABASE_URL,api,'Never connect to a hosted project');
const anon=process.env.ANON_KEY;
assert(anon&&anon.length>30,'Local Supabase anonymous key missing');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'winter-browser-'));
const vendor=path.join(scratch,'supabase.mjs');
execFileSync('./node_modules/.bin/esbuild',
 ['@supabase/supabase-js','--bundle','--platform=browser','--format=esm','--target=es2022','--outfile='+vendor],
 {stdio:'pipe'});
const pages=new Map();
for(const name of ['apiary-log.html','winter-readiness.html']){
 const source=fs.readFileSync(name,'utf8');
 assert(source.includes('https://mkypanucvttinkjggxzv.supabase.co'));
 const testCopy=source.replaceAll('https://mkypanucvttinkjggxzv.supabase.co',api)
  .replaceAll('sb_publishable_-mN1hBm5z7YCjBzg_LDU4g_5C3N8ejJ',anon)
  .replaceAll(/https:\/\/esm\.sh\/@supabase\/supabase-js@2(?:\.118\.0)?/g,'/vendor/supabase.mjs');
 assert(!testCopy.includes('mkypanucvttinkjggxzv'));
 assert(!testCopy.includes('esm.sh/@supabase/supabase-js'));
 pages.set('/'+name,testCopy);
}
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,host).pathname;
 let result,type='text/javascript; charset=utf-8';
 if(pages.has(pathname)){result=pages.get(pathname);type='text/html; charset=utf-8';}
 else if(pathname==='/vendor/supabase.mjs')result=fs.readFileSync(vendor);
 else if(/^\/js\/[a-z0-9._-]+\.js$/.test(pathname)&&fs.existsSync('.'+pathname))
  result=fs.readFileSync('.'+pathname);
 else{res.writeHead(404);res.end('Not found');return;}
 res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(result);
});
await new Promise((resolve,reject)=>server.listen(8765,'127.0.0.1',err=>err?reject(err):resolve()));
async function call(route,options={}){
 const {method='GET',token=anon,body}=options;
 const resp=await fetch(api+route,{method,
 headers:{apikey:anon,Authorization:'Bearer '+token,
 ...(body===undefined?{}:{'Content-Type':'application/json'})},
 ...(body===undefined?{}:{body:JSON.stringify(body)})});
 const raw=await resp.text();let value;
 try{value=JSON.parse(raw);}catch{value=raw;}
 if(!resp.ok)throw Error('Disposable API '+route.split('?')[0]+' HTTP '+resp.status+' code '+(value?.code||'unknown'));
 return value;
}
function decode32(text){
 const alpha='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let value=0,bits=0;const out=[];
 for(const ch of text.toUpperCase().replace(/=|[\s-]/g,'')){
  const pos=alpha.indexOf(ch);assert(pos>=0);
  value=(value<<5)|pos;bits+=5;
  if(bits>=8){bits-=8;out.push((value>>>bits)&255);}
 }
 return Buffer.from(out);
}
function totp(secret){
 const counter=Buffer.alloc(8);
 counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
 const h=createHmac('sha1',decode32(secret)).update(counter).digest();
 const i=h[19]&15;
 return String((h.readUInt32BE(i)&0x7fffffff)%1000000).padStart(6,'0');
}
const email='winter-browser-'+randomBytes(7).toString('hex')+'@example.test';
const password='T3st-'+randomBytes(24).toString('base64url')+'!';
const signup=await call('/auth/v1/signup',{method:'POST',body:{email,password}});
assert(signup.access_token&&/^[a-f0-9-]{36}$/i.test(signup.user?.id));
const factor=await call('/auth/v1/factors',{method:'POST',token:signup.access_token,
 body:{factor_type:'totp',friendly_name:'Disposable Winter browser test'}});
assert(factor.id&&factor.totp?.secret);
const challenge=await call('/auth/v1/factors/'+factor.id+'/challenge',
 {method:'POST',token:signup.access_token,body:{}});
const initial=await call('/auth/v1/factors/'+factor.id+'/verify',
 {method:'POST',token:signup.access_token,
 body:{challenge_id:challenge.id,code:totp(factor.totp.secret)}});
assert(initial.access_token,'Initial TOTP verification failed');
// GoTrue rejects reusing a TOTP code. Wait for a new period before UI MFA.
const period=Math.floor(Date.now()/30000);
while(Math.floor(Date.now()/30000)===period)
 await new Promise(resolve=>setTimeout(resolve,750));

execFileSync('psql',['-X','-v','ON_ERROR_STOP=1','-c',
 'INSERT INTO public."Hive_Colonies" (id,hive_id,user_id,colony_name,colony_status) VALUES '+
 "(401,1,'"+signup.user.id+"'::uuid,'Genuine Browser Colony','active');"],{stdio:'pipe'});
// Match the existing production colony ownership/MFA policy, for this fixture only.
execFileSync('psql',['-X','-v','ON_ERROR_STOP=1','-c',
 'ALTER TABLE public."Hive_Colonies" ENABLE ROW LEVEL SECURITY;'+
 'CREATE POLICY browser_owner_read ON public."Hive_Colonies" FOR SELECT TO authenticated '+
 "USING (user_id=auth.uid() AND auth.jwt()->>'aal'='aal2');"],{stdio:'pipe'});

const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1200,height:900}});
const page=await context.newPage();
const errors=[],outside=[];
context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
await context.route('**/*',route=>{
 const u=new URL(route.request().url());
 if(u.protocol==='http:'&&u.hostname==='127.0.0.1'&&[54321,8765].includes(Number(u.port)))
  return route.continue();
 outside.push(u.hostname);return route.abort();
});
try{
 await page.goto(host+'/apiary-log.html',{waitUntil:'domcontentloaded'});
 await page.locator('#email').fill(email);
 await page.locator('#password').fill(password);
 await page.locator('#loginForm button[type="submit"]').click();
 await page.locator('#mfaChallenge').waitFor({state:'visible',timeout:30000});
 assert.equal(await page.locator('#dashboard').isVisible(),false,'AAL1 cannot display private dashboard');
 await page.locator('#mfaChallengeCode').fill(totp(factor.totp.secret));
 await page.locator('#mfaChallengeForm button[type="submit"]').click();
 await page.locator('#dashboard').waitFor({state:'visible',timeout:35000});
 console.log('PASS CHROME: actual parent password + 6-digit MFA sign-in');

 const token=await page.evaluate(()=>{
  const key=Object.keys(localStorage).find(k=>k.startsWith('sb-')&&k.endsWith('-auth-token'));
  return key?JSON.parse(localStorage.getItem(key))?.access_token:null;
 });
 assert(token,'Parent session missing after MFA');
 const season=await call('/rest/v1/rpc/winter_start_season',{method:'POST',token,
  body:{p_start_year:2026}});
 assert(Number.isInteger(season)&&season>0,'Create season through real REST');
 await page.getByRole('tab',{name:'Hives',exact:true}).click();
 const hive1=page.locator('#hiveList button').filter({hasText:'Hive 1:'});
 await hive1.waitFor({state:'visible',timeout:30000});
 await hive1.click();
 await page.getByRole('tab',{name:'Winter',exact:true}).click();
 const frame=page.frameLocator('#winterFrame');
 await frame.locator('#workspace').waitFor({state:'visible',timeout:35000});
 assert.equal(await frame.locator('#signInPanel').isVisible(),false,'Child must share MFA session');
 await frame.locator('#colonyList').getByText('Genuine Browser Colony')
  .waitFor({state:'visible',timeout:25000});
 assert.equal(await frame.locator('#winterBackupSection').isVisible(),false);
 console.log('PASS CHROME: embedded Winter inherits authenticated session and scoped colony');

 const hive2=page.locator('#hiveList button').filter({hasText:'Hive 2:'});
 await hive2.click();
 await page.waitForFunction(()=>document.querySelector('#winterFrame')?.getAttribute('src')?.endsWith('hive=2'));
 await frame.locator('#workspace').waitFor({state:'visible',timeout:35000});
 assert.equal(await frame.locator('#colonyList').getByText('Genuine Browser Colony').count(),0,
  'Other hive must not display first hive colony');
 await page.locator('#logout').click();
 await page.waitForFunction(()=>!document.querySelector('#winterFrame')?.hasAttribute('src'));
 assert.equal(await page.locator('#dashboard').isVisible(),false);
 assert.deepEqual(outside,[],'Unexpected external network request');
 assert.deepEqual(errors,[],'Unexpected browser JavaScript error');
 console.log('PASS LOCAL SUPABASE BROWSER: real MFA, iframe session, hive switch and sign-out');
}finally{
 await context.close();await browser.close();
 await new Promise(resolve=>server.close(resolve));
 fs.rmSync(scratch,{recursive:true,force:true});
}
