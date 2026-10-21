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
 .replace(/<script\\b[^>]*>[\\s\\S]*?<\\/script>/gi,'')
 .replace(/<link\\b[^>]*href=[^>]+>/gi,'')
 .replace(/<iframe\\b[^>]*>/gi,tag=>tag.replace(/\\ssrc=(["']).*?\\1/i,''));
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
 await page.addScriptTag({content:'let selectedHiveId=null;'+controller+
   '\\nwindow.__hiveTest={select(id){selectedHiveId=id;syncWinterFrame();},logout(){selectedHiveId=null;syncWinterFrame();}};'});
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
 await page.setViewportSize({width:420,height:850});
 const mobileColumns=await nav.evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length);
 assert.equal(mobileColumns,2,'Mobile must have two tab columns');
 assert.equal(await btns.count(),10,'Mobile keeps all ten hive tabs');
 assert.deepEqual(errors,[],'Unexpected browser script errors');
 console.log('PASS Chrome: 10 tabs, 5 desktop columns, 2 mobile columns, scoped Winter URL, hive switch, Feedings navigation, sign-out clearing.');
}finally{
 await context.close();
 await browser.close();
}
