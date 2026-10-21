// Browser acceptance for embedded Winter auth/session clearing. Pure synthetic data, no network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';

const html=fs.readFileSync('winter-readiness.html','utf8');
const block=html.match(/<script type="module">([\s\S]*?)<\/script>/);
assert(block,'Embedded Winter application module missing');
let app=block[1];
app=app.replace(/^import .*;\s*$/gm,'');
const clientLine=app.split('\n').find(x=>x.startsWith('const client=createClient('));
assert(clientLine,'Supabase client constructor missing');
app=app.replace(clientLine,'const client=window.__syntheticWinterClient;');
const addon=`
window.__winterTest={
 fakeLogin(){
  verified={id:'synthetic-owner',email:'synthetic@example.invalid'};
  season={id:1,status:'open'};
  current={id:44};
  participations=[{id:44}];
  snapshots=[{id:55}];
  items=[{id:66}];
  observations=[{id:77}];
  seasonOutcomes=[{id:88}];
  currentOutcome={id:99};
  $('sessionLabel').textContent='Synthetic private data';
  $('winterDetail').hidden=false;
  $('winterDetail').dataset.syntheticSecret='private-should-clear';
  setSections('signed');
 },
 getState(){return {verified:!!verified,season:!!season,current:!!current,
  participants:participations.length,snapshots:snapshots.length,items:items.length,
  observations:observations.length,outcomes:seasonOutcomes.length,hasCurrentOutcome:!!currentOutcome
 }}
};`;
const script='const downloadCompleteBackup=()=>{};\n'+app+'\n'+addon;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:450,height:860}});
const page=await context.newPage();
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const isolatedHost='winter-fixture.invalid';
await page.route('**/*',route=>{
 const request=route.request();
 const url=new URL(request.url());
 if(url.hostname===isolatedHost&&url.pathname==='/winter-readiness.html'){
  return route.fulfill({status:200,contentType:'text/html',body:html.replace(block[0],'')});
 }
 return route.abort(); // Prohibit all real network access.
});
try {
 await page.goto('https://'+isolatedHost+'/winter-readiness.html?embedded=1&hive=42',{waitUntil:'domcontentloaded'});
 await page.addScriptTag({content:`
window.__authCallback=null;
window.__syntheticWinterClient={
 auth:{
  onAuthStateChange(callback){window.__authCallback=callback;return {data:{subscription:{unsubscribe(){}}}};},
  getSession:async()=>({data:{session:null},error:null}),
  signOut:async()=>({error:null})
 }
};`});
 await page.addScriptTag({type:'module',content:script});
 await page.waitForFunction(()=>window.__winterTest&&window.__authCallback);
 assert.equal(await page.locator('#signInPanel').isVisible(),true,'First screen is sign-in');
 assert.equal(await page.locator('[aria-label="Proposed hive navigation layout"]').isVisible(),false,'Embedded version hides duplicate disabled nav');
 assert.equal(await page.locator('#downloadWinterBackup').isVisible(),false,'Private ZIP is hidden while logged out');
 await page.evaluate(()=>window.__winterTest.fakeLogin());
 assert.equal(await page.locator('#workspace').isVisible(),true,'Authenticated workspace visible in synthetic state');
 assert.equal(await page.locator('#winterDetail').isVisible(),true,'Synthetic winter detail visible');
 assert.equal(await page.locator('#sessionLabel').innerText(),'Synthetic private data');
 await page.evaluate(()=>window.__authCallback('SIGNED_OUT',null));
 assert.equal(await page.locator('#workspace').isVisible(),false,'Cross-tab sign-out hides the private workspace');
 assert.equal(await page.locator('#winterDetail').isVisible(),false,'Cross-tab sign-out hides old hive detail');
 assert.equal(await page.locator('#sessionLabel').innerText(),'','Clear prior account info');
 assert.deepEqual(await page.evaluate(()=>window.__winterTest.getState()),
  {verified:false,season:false,current:false,participants:0,snapshots:0,items:0,
   observations:0,outcomes:0,hasCurrentOutcome:false});
 await page.evaluate(()=>window.__winterTest.fakeLogin());
 await page.locator('#signOut').click();
 assert.equal(await page.locator('#workspace').isVisible(),false,'Winter explicit sign-out also hides private workspace');
 assert.equal(await page.locator('#sessionLabel').innerText(),'');
 assert.deepEqual(errors,[],'No browser errors');
 console.log('PASS Chrome: embedded Winter hides duplicate navigation, gated private ZIP, external SIGNED_OUT clears cached state, and explicit sign-out hides records.');
}finally{
 await context.close();await browser.close();
}
