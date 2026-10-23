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
 showClosedHistory(){
  season={id:1,status:'closed',start_year:2026};
  current={id:44};
  snapshots=[3,2].map(version=>({
   version,created_at:'2026-10-20T19:15:53Z',
   snapshot:{participants:[{participation:{id:44,prep_assessment:'unassessed'},
    outcome:{outcome:'not_assessed'},unresolved_reason:'test only',
    checklist:[],observations:[],spring_inspections:[]}]}
  }));
  $('winterDetail').hidden=false;
  renderClosedColony();
 },
 scopeTwoHives(){
  season={id:1,status:'open',start_year:2026,started_at:'2026-10-21T12:00:00Z'};
  current=null;
  hives=[{id:42,hive_number:1,hive_name:'North Test Hive'},
         {id:43,hive_number:2,hive_name:'South Test Hive'}];
  colonies=[{id:101,hive_id:42,colony_name:'North Colony',colony_status:'active'},
            {id:102,hive_id:43,colony_name:'South Colony',colony_status:'active'}];
  participations=[{id:201,season_id:1,colony_id:101,participation:'included'},
                  {id:202,season_id:1,colony_id:102,participation:'included'}];
  snapshots=[];seasonOutcomes=[];
  renderSeason();renderColonies();
 },
 selectWrongHive(){
  return selectColony(participations.find(p=>p.colony_id===102));
 },
 queueDelayedRefresh(){
  let release;
  const delayed=new Promise(resolve=>{release=resolve;});
  window.__syntheticWinterClient.from=table=>{
   if(table==='Winter_Seasons')return {select:()=>({eq:()=>({maybeSingle:()=>delayed})})};
   return {select:()=>({data:[],error:null})};
  };
  window.__finishDelayedWinterRead=()=>release({data:null,error:null});
  window.__pendingWinterRead=refresh();
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
 const syntheticClientScript=`
window.__authCallback=null;
window.__syntheticWinterClient={
 auth:{
  onAuthStateChange(callback){window.__authCallback=callback;return {data:{subscription:{unsubscribe(){}}}};},
  getSession:async()=>({data:{session:null},error:null}),
  signOut:async()=>({error:null})
 }
};`;
 await page.addScriptTag({content:syntheticClientScript});
 await page.addScriptTag({type:'module',content:script});
 await page.waitForFunction(()=>window.__winterTest&&window.__authCallback);
 assert.equal(await page.locator('#signInPanel').isVisible(),true,'First screen is sign-in');
 assert.equal(await page.locator('[aria-label="Proposed hive navigation layout"]').isVisible(),false,'Embedded version hides duplicate disabled nav');
 assert.equal(await page.locator('#downloadWinterBackup').isVisible(),false,'Private ZIP is hidden while logged out');
 await page.evaluate(()=>window.__winterTest.fakeLogin());
 assert.equal(await page.locator('#workspace').isVisible(),true,'Authenticated workspace visible in synthetic state');
 assert.equal(await page.locator('#auth').isVisible(),false,'Verified embedded Winter hides the redundant sign-in card');
 assert.equal(await page.locator('#winterBackupSection').isVisible(),false,'Whole-apiary backup is not shown in a selected hive tab');
 assert.equal(await page.locator('#winterDetail').isVisible(),true,'Synthetic winter detail visible');
 assert.equal(await page.locator('#sessionLabel').innerText(),'Synthetic private data');

// Historical snapshot selector must stay legible at real phone widths.
// Version timestamps remain visible in the read-only details below the selector.
 await page.evaluate(()=>window.__winterTest.showClosedHistory());
 const versionSelect=page.locator('#closedView select');
 assert.deepEqual(await versionSelect.locator('option').allTextContents(),['Version 3','Version 2'],
  'Short labels prevent phone selector timestamp truncation');
 assert.equal(await versionSelect.getAttribute('id'),'winterHistoricalVersion');
 assert.equal(await page.locator('#closedView label').getAttribute('for'),'winterHistoricalVersion',
  'Version selector needs an accessible associated label');
 assert.match(await page.locator('#closedView').innerText(),/Closed .*read-only/,
  'Full closure date remains visible outside the selector');
 await page.setViewportSize({width:390,height:860});
 assert(await versionSelect.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}),
  'History selector must fit within a 390px viewport');
 await versionSelect.selectOption('2');
 assert.match(await page.locator('#closedView h3').innerText(),/Version 2/,
  'Choosing an earlier version must render that historical snapshot');

 await page.evaluate(()=>window.__winterTest.scopeTwoHives());
 const visibleColonies=await page.locator('#colonyList').innerText();
 assert.match(visibleColonies,/North Colony/,'The selected hive colony must show');
 assert.doesNotMatch(visibleColonies,/South Colony/,'Never show another hive colony in the selected view');
 assert.match(await page.locator('#seasonSummary').innerText(),/1 included · 0 excluded/,
  'Winter participation summary must reflect only the selected hive');
 assert.equal(await page.locator('#startSeason').isVisible(),false,'No all-hive season start from an individual hive');
 assert.equal(await page.locator('#seasonClosureControls').count(),0,'No all-hive close/reopen controls inside one hive');
 assert.equal(await page.getByRole('link',{name:'Open full Winter Readiness'}).getAttribute('href'),'winter-readiness.html');
 await assert.rejects(page.evaluate(()=>window.__winterTest.selectWrongHive()),/does not belong to the selected hive/,
  'Must reject direct opening of a colony from another hive');
 await page.evaluate(()=>window.__authCallback('SIGNED_OUT',null));
 assert.equal(await page.locator('#workspace').isVisible(),false,'Cross-tab sign-out hides the private workspace');
 assert.equal(await page.locator('#auth').isVisible(),true,'Embedded Winter restores sign-in after shared session expires');
 assert.equal(await page.locator('#winterDetail').isVisible(),false,'Cross-tab sign-out hides old hive detail');
 assert.equal(await page.locator('#sessionLabel').innerText(),'','Clear prior account info');
 assert.equal(await page.locator('#colonyList').textContent(),'',
  'Sign-out must erase cached rendered colony details rather than simply hide them');
 assert.equal(await page.locator('#seasonSummary').textContent(),'',
  'Sign-out must erase rendered season information');
 assert.deepEqual(await page.evaluate(()=>window.__winterTest.getState()),
  {verified:false,season:false,current:false,participants:0,snapshots:0,items:0,
   observations:0,outcomes:0,hasCurrentOutcome:false});
 // A response issued before sign-out must not restore either data or UI afterward.
 await page.evaluate(()=>{window.__winterTest.fakeLogin();window.__winterTest.queueDelayedRefresh();});
 await page.evaluate(()=>window.__authCallback('SIGNED_OUT',null));
 await page.evaluate(async()=>{window.__finishDelayedWinterRead();await window.__pendingWinterRead;});
 assert.equal(await page.locator('#seasonSummary').textContent(),'',
  'A stale season read must not redraw private content after logout');
 assert.deepEqual(await page.evaluate(()=>window.__winterTest.getState()),
  {verified:false,season:false,current:false,participants:0,snapshots:0,items:0,
   observations:0,outcomes:0,hasCurrentOutcome:false},
  'Stale reads must not repopulate signed-out application state');
 await page.evaluate(()=>window.__winterTest.fakeLogin());
 assert.equal(await page.locator('#signOut').isVisible(),false,
  'Embedded Winter hides its duplicate Sign Out; the main Apiary Log has the visible control');
 // Standalone Winter must still offer and honor its own Sign Out.
 await page.goto('https://'+isolatedHost+'/winter-readiness.html',{waitUntil:'domcontentloaded'});
 await page.addScriptTag({content:syntheticClientScript});
 await page.addScriptTag({type:'module',content:script});
 await page.waitForFunction(()=>window.__winterTest&&window.__authCallback);
 await page.evaluate(()=>window.__winterTest.fakeLogin());
 assert.equal(await page.locator('#signOut').isVisible(),true,
  'Standalone Winter retains its own Sign Out button');
 assert.equal(await page.locator('#auth').isVisible(),true,'Standalone Winter retains authentication status');
 await page.locator('#signOut').click();
 assert.equal(await page.locator('#workspace').isVisible(),false,
  'Standalone Winter explicit sign-out hides private workspace');
 assert.equal(await page.locator('#sessionLabel').innerText(),'');
 assert.deepEqual(errors,[],'No browser errors');
 console.log('PASS Chrome: embedded Winter hides redundant Sign Out, retains cross-tab sign-out clearing and standalone Winter Sign Out.');
}finally{
 await context.close();await browser.close();
}
