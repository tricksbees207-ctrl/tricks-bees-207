// Headless Chrome test of the real recurring form and buttons. Synthetic data only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';

const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1100,height:840}});
page.on('dialog',dialog=>dialog.accept());
try {
  await page.setContent([
    '<!doctype html><html lang="en"><meta charset="utf-8">',
    '<style>body{font:16px system-ui;max-width:800px;margin:24px auto}.two-col{display:grid;grid-template-columns:1fr 1fr;gap:12px}label{display:block;margin-top:8px}input,select,textarea,button{font:inherit;padding:8px;margin:4px}.record{border:1px solid #ccc;margin:12px 0;padding:12px}.record small{display:block}[hidden]{display:none!important}</style>',
    '<section id="expensesSection"><h3>Expenses</h3><h4>Summary</h4><div id="expenseTotals">No change</div></section>',
    '<select id="expenseCategory"><option value="">Choose</option><option>Web Hosting &amp; Subscriptions</option><option>Other</option></select>',
    '<select id="expensePayment"><option value="">Not specified</option><option>Credit card</option></select>',
    '</html>'
  ].join(''));
  const code=fs.readFileSync('js/recurring-expenses.js','utf8')
    .replace('export function setupRecurringExpenses','window.setupRecurringExpenses = function setupRecurringExpenses');
  await page.addScriptTag({content:code});
  await page.evaluate(()=>{
    window.__state={schedules:[],expenses:[],receipts:[],rpc:0};
    const user={id:'test-account-only'};
    let scheduleId=1;
    const supabase={
      auth:{getUser:async()=>({data:{user}})},
      from(table){
        if(table!=='Apiary_Recurring_Expenses')throw new Error('Unexpected table');
        return {
          select(){return{eq(){return{order:async()=>({data:window.__state.schedules.map(x=>({...x}))})}}}},
          insert(obj){
            const r={...obj,id:scheduleId++,active:true};
            window.__state.schedules.push(r);
            return {select:async()=>({data:[{id:r.id}]})};
          },
          update(obj){
            return {eq(key,id){
              if(key!=='id')throw Error('Incorrect schedule key');
              return {eq(field,owner){
                if(field!=='user_id'||owner!==user.id)throw Error('Incorrect owner');
                return {select:async()=>{
                  const r=window.__state.schedules.find(x=>x.id===id);
                  Object.assign(r,obj);
                  return {data:[{id}]};
                }};
              }};
            }};
          }
        };
      },
      async rpc(name,args){
        if(name!=='record_recurring_expense')throw Error('Unexpected RPC');
        window.__state.rpc++;
        const r=window.__state.schedules.find(x=>x.id===args.p_template_id);
        if(!r||!r.active||r.next_due_date!==args.p_expected_due_date)
          return {error:{message:'Duplicate or stale billing period'}};
        const id=100+window.__state.expenses.length;
        window.__state.expenses.push({id,amount:args.p_actual_amount,date:args.p_paid_date});
        const [y,m]=r.next_due_date.split('-').map(Number);
        const day=Number(r.anchor_date.slice(8));
        const offset={monthly:1,quarterly:3,yearly:12}[r.frequency];
        const d=new Date(Date.UTC(y,m-1+offset,1));
        const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
        d.setUTCDate(Math.min(day,last));
        r.next_due_date=d.toISOString().slice(0,10);
        return {data:id};
      }
    };
    window.__manager=window.setupRecurringExpenses({
      supabase,expenseSection:document.getElementById('expensesSection'),
      categorySource:document.getElementById('expenseCategory'),
      paymentSource:document.getElementById('expensePayment'),getHives:()=>[],
      receiptFiles:list=>Array.from(list),
      uploadReceipts:async(files,id,owner)=>window.__state.receipts.push(...files.map(f=>({name:f.name,id,user:owner.id}))),
      refreshExpenses:async()=>{}
    });
  });
  const el=id=>page.locator('#'+id);
  await el('recurringDescription').fill('Synthetic website hosting');
  await el('recurringCategory').selectOption('Web Hosting & Subscriptions');
  await el('recurringAmount').fill('12.50');
  await el('recurringFrequency').selectOption('monthly');
  await el('recurringDue').fill('2027-01-31');
  await el('saveRecurring').click();
  await page.waitForFunction(()=>window.__state.schedules.length===1);
  assert.deepEqual(await page.evaluate(()=>[window.__state.expenses.length,window.__state.rpc]),[0,0]);
  assert.match(await el('recurringList').innerText(),/Synthetic website hosting/);
  await page.locator('#recurringList button').first().click();
  assert.equal(await el('recurringReview').isVisible(),true);
  await el('cancelRecurringReview').click();
  assert.equal(await el('recurringReview').isVisible(),false);
  assert.equal(await page.evaluate(()=>window.__state.expenses.length),0);
  await page.locator('#recurringList button').first().click();
  await el('recurringPaidDate').fill('2027-02-02');
  await el('recurringPaidAmount').fill('15.75');
  await el('recurringFiles').setInputFiles({name:'test-receipt.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 synthetic test')});
  await el('recordRecurring').click();
  await page.waitForFunction(()=>window.__state.expenses.length===1&&window.__state.receipts.length===1);
  const saved=await page.evaluate(()=>window.__state);
  assert.equal(saved.expenses[0].amount,15.75);
  assert.equal(saved.receipts[0].name,'test-receipt.pdf');
  assert.equal(saved.schedules[0].next_due_date,'2027-02-28');
  assert.equal(saved.rpc,1);
  assert.equal(await el('recurringReview').isVisible(),false);
  assert.match(await el('recurringMessage').innerText(),/Receipt attached/);
  await page.locator('#recurringList button').last().click();
  await page.waitForFunction(()=>window.__state.schedules[0].active===false);
  assert.equal(await page.locator('#recurringList button').first().isDisabled(),true);
  assert.equal(await page.evaluate(()=>window.__state.expenses.length),1);
  console.log('PASS Chrome: schedule creation, cancel, actual payment, receipt, calendar rollover and pause.');
} finally {
  await browser.close();
}
