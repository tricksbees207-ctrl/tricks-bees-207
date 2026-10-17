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
  window.__fakeDb={
    auth:{
      getUser:async()=>({data:{user},error:null}),
      mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:'aal1',nextLevel:'aal1'},error:null})}
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
  const local=pathToFileURL(path.resolve('recurring-expenses-test-preview.html')).href;
  await page.goto(local);
  await page.locator('#recurringDescription').waitFor({state:'visible',timeout:10000});
  assert.match(await page.locator('#identity').innerText(),/synthetic@example.invalid/);
  assert.match(await page.locator('#recurringList').innerText(),/No recurring payments scheduled/);
  assert.equal(await page.locator('#workspace').isVisible(),true);
  assert.equal((await page.evaluate(()=>window.__calls)).every(x=>['Hives','Apiary_Expenses','Apiary_Recurring_Expenses'].includes(x)),true);
  assert.deepEqual(errors,[]);
  console.log('PASS: Downloadable file:// test preview loaded module and displayed signed-in recurring expense form.');
}finally{await browser.close();}
