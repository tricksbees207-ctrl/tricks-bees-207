// Exercise the actual downloadable TEST preview from a file:// browser address.
// Network dependencies are intercepted with an in-memory fake: no account, receipt or Supabase data is accessed.
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';

const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
const page=await browser.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('https://esm.sh/**',async route=>{
  await route.fulfill({status:200,contentType:'application/javascript',
    headers:{'access-control-allow-origin':'*'},
    body:'export const createClient = () => window.__fakeDb;'});
});
await page.addInitScript(()=>{
  const user={id:'synthetic-test-only',email:'synthetic@example.invalid'};
  window.__calls=[];
  let verified=false;
  window.__fakeDb={
    auth:{
      getUser:async()=>({data:{user},error:null}),
      mfa:{
        getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:verified?'aal2':'aal1',nextLevel:verified?'aal2':'aal1'},error:null}),
        listFactors:async()=>({data:{totp:verified?[{id:'test-factor',status:'verified'}]:[]},error:null}),
        enroll:async()=>({data:{id:'test-factor',totp:{qr_code:'data:image/svg+xml;base64,PHN2Zy8+',secret:'SYNTHETIC'}},error:null}),
        challenge:async()=>({data:{id:'test-challenge'},error:null}),
        verify:async()=>{verified=true;return {data:{},error:null}}
      }
    },
    from(table){
      window.__calls.push(table);
      if(table==='Hives')return{select:()=>({order:async()=>({data:[],error:null})})};
      if(table==='Apiary_Expenses')return{select:()=>({limit:async()=>({data:[],error:null})})};
      if(table==='Apiary_Recurring_Expenses')return{select:()=>({eq:()=>({order:async()=>({data:[],error:null})})})};
      throw Error('Unexpected TEST preview table: '+table);
    }
  };
});
try {
  const local=pathToFileURL(path.resolve('recurring-expenses-backup-test.html')).href;
  await page.goto(local);
  await page.locator('#recurringDescription').waitFor({state:'visible',timeout:10000});
  assert.match(await page.locator('#identity').innerText(),/synthetic@example.invalid/);
  assert.match(await page.locator('#recurringList').innerText(),/No recurring payments scheduled/);
  assert.equal(await page.locator('#workspace').isVisible(),true);
  assert.equal((await page.evaluate(()=>window.__calls)).every(x=>['Hives','Apiary_Expenses','Apiary_Recurring_Expenses'].includes(x)),true);
  assert.equal(await page.locator('#downloadTestBackup').isDisabled(),true);
  await page.locator('#setupTestAuthenticator').click();
  assert.equal(await page.locator('#testAuthenticatorSetup').isVisible(),true);
  await page.locator('#testAuthenticatorCode').fill('123456');
  await page.locator('#confirmTestAuthenticator button').click();
  await page.waitForFunction(()=>!document.querySelector('#downloadTestBackup').disabled);
  assert.equal(await page.locator('#testAuthenticatorSetup').isVisible(),false);
  assert.equal(await page.locator('#backupWorkspace').isVisible(),true);
  await page.locator('#verifyTestZip').click();
  assert.match(await page.locator('#testVerifyStatus').innerText(),/Choose your TEST ZIP first/);
  assert.deepEqual(errors,[]);
  console.log('PASS: Local TEST backup page loads in Chrome, requires MFA, verifies mocked enrollment and opens backup controls without touching Supabase.');
}finally{await browser.close();}
