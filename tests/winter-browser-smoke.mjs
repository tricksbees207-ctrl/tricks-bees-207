// Full browser-level Winter tab navigation acceptance test. No Supabase network calls.
// Runs with synthetic hive selection in a sandboxed Playwright Chromium page.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';

const source=fs.readFileSync('apiary-log.html','utf8');
const navStart=source.indexOf('<script>');
const navEnd=source.indexOf('</script>',navStart);
assert(navStart>0&&navEnd>navStart,'Hive navigation inline script missing');
const navigation=source.slice(navStart+'<script>'.length,navEnd);
assert(navigation.includes("createTabs(pages,inspectionPanel"),'Hive navigation missing');
const moduleStart=source.indexOf('    let winterActive=false;');
const moduleEnd=source.indexOf('    let selectedHiveId = null;',moduleStart);
assert(moduleStart>0&&moduleEnd>moduleStart,'Winter frame controller missing');
const controller=source.slice(moduleStart,moduleEnd);
assert(controller.includes("document.addEventListener('hive-section-selected'"),'Winter listener missing');
// Avoid executing any production API code. Only the navigation script and scoped-frame controller run.
const safeHtml=source
 .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
 .replace(/<link\b[^>]*href=[^>]+>/gi,'')
 .replace(/<iframe\b[^>]*>/gi,tag=>tag.replace(/\ssrc=(["']).*?\1/i,''));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1200,height:900}});
const page=await context.newPage();
const errors=[];
page.on('pageerror',err=>errors.push(err.message));
await page.route('**/*',route=>route.abort()); // Network disabled, including all Supabase URLs.
try {
 await page.setContent(safeHtml,{waitUntil:'domcontentloaded'});
 await page.addScriptTag({content:navigation});
 await page.evaluate(()=>document.dispatchEvent(new Event('DOMContentLoaded')));
 await page.addScriptTag({content:'const $=id=>document.getElementById(id);let selectedHiveId=null;'+controller+
   'window.__hiveTest={select(id){selectedHiveId=id;syncWinterFrame();},logout(){selectedHiveId=null;syncWinterFrame();}};'});
 // Authentication is deliberately not executed. Reveal the protected dashboard with
 // dummy browser state so computed grid layout reflects what a signed-in user sees.
 await page.evaluate(()=>document.querySelector('#dashboard').classList.remove('hidden'));
 await page.getByRole('tab',{name:'Hives',exact:true}).click();
 // Real hive selection reveals this panel. Simulate it without signing in or contacting Supabase.
 await page.evaluate(()=>{document.querySelector('#inspectionPanel').style.display='block';});
 const nav=page.locator('nav[role="tablist"][aria-label="Hive sections"]');
 const btns=nav.locator('[role="tab"]');
 const expected=['Inspection','Hive Profile','Colony History','Feedings','Treatments','Harvests','Queens','Splits','Losses','Winter'];
 assert.deepEqual(await btns.allTextContents(),expected);
 assert.equal(await btns.count(),10);
 const panel=page.locator('#winterSection');
 const frame=page.locator('#winterFrame');
 assert.equal(await frame.getAttribute('src'),null,'Iframe must not load on startup');
 const wideColumns=await nav.evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length);
 assert.equal(wideColumns,5,'Desktop must have five uniform tab columns');
 await btns.nth(9).click();
 assert.equal(await btns.nth(9).getAttribute('aria-selected'),'true');
 assert.equal(await panel.isVisible(),true);
 assert.equal(await frame.getAttribute('src'),null,'No hive means no Winter iframe');
 await page.evaluate(()=>window.__hiveTest.select(42));
 await page.waitForFunction(()=>document.querySelector('#winterFrame').getAttribute('src')==='winter-readiness.html?embedded=1&hive=42');
 await page.evaluate(()=>window.__hiveTest.select(43));
 await page.waitForFunction(()=>document.querySelector('#winterFrame').getAttribute('src')==='winter-readiness.html?embedded=1&hive=43');
 await btns.nth(3).click();
 assert.equal(await btns.nth(3).getAttribute('aria-selected'),'true');
 assert.equal(await panel.isVisible(),false,'Winter panel must hide on Feedings');
 await btns.nth(9).click();
 assert.equal(await frame.getAttribute('src'),'winter-readiness.html?embedded=1&hive=43');
 await page.evaluate(()=>window.__hiveTest.logout());
 assert.equal(await frame.getAttribute('src'),null,'Logout must unload selected hive URL');
 // Four narrow-screen sizes catch regressions at the CSS 380px/540px breakpoints.
 // Inspect the HIVE tab grid, not unrelated existing Apiary Log layouts.
 for(const width of [320,360,390,420]){
  await page.setViewportSize({width,height:850});
  const metrics=await nav.evaluate(el=>{
   const navBox=el.getBoundingClientRect();
   const buttons=[...el.querySelectorAll('button')];
   const boxes=buttons.map(b=>b.getBoundingClientRect());
   const rows=[...new Set(boxes.map(b=>Math.round(b.top)))];
   const columns=getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length;
   return {columns,rows:rows.length,
    withinViewport:navBox.left>=-1&&navBox.right<=innerWidth+1,
    buttonsFit:boxes.every(b=>b.width>=90&&b.height>=44&&b.left>=navBox.left-1&&b.right<=navBox.right+1),
    selected:buttons.filter(b=>b.getAttribute('aria-selected')==='true').length,
    named:buttons.every(b=>b.textContent.trim()&&b.getAttribute('aria-controls')),
    frameTitle:document.querySelector('#winterFrame')?.getAttribute('title')};
  });
  assert.equal(metrics.columns,2,`Phone ${width}px must retain two columns`);
  assert.equal(metrics.rows,5,`Phone ${width}px must have five uniform tab rows`);
  assert(metrics.withinViewport,`Hive navigation must fit ${width}px viewport`);
  assert(metrics.buttonsFit,`Hive tabs must stay visible and >=44px tall at ${width}px`);
  assert.equal(metrics.selected,1,'One active tab per hive navigation');
  assert(metrics.named,'Hive tabs must keep accessible names and controlled panels');
  assert(metrics.frameTitle?.trim(),'Winter iframe must have an accessible title');
  assert.equal(await btns.count(),10,'Phone keeps all ten hive tabs');
 }
 // Check that keyboard operation remains possible at narrow phone width.
 await btns.nth(0).focus();
 await page.keyboard.press('ArrowLeft');
 assert.equal(await btns.nth(9).getAttribute('aria-selected'),'true',
  'Keyboard wraparound should reach Winter tab');
 assert.deepEqual(errors,[],'Unexpected browser script errors');
 console.log('PASS Chrome: responsive 320/360/390/420px hive grid, accessible tabs, keyboard navigation, scoped Winter URL and sign-out clearing.');
}finally{
 await context.close();
 await browser.close();
}
