// Isolated browser-DOM simulation. Mock data only: no Supabase accounts, no HTTP requests.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

test('recurring bills stay pending until review; confirmed amount posts once; pausing works',async()=>{
  const dom=new JSDOM('<!doctype html><html><body><section id="expensesSection"><h4>Expense Summary</h4><div id="expenseTotals"></div></section><select id="expenseCategory"><option value="">Choose</option><option>Web Hosting &amp; Subscriptions</option><option>Other</option></select><select id="expensePayment"><option value="">Not specified</option><option>Credit card</option></select></body></html>',{url:'https://localhost'});
  const{window}=dom;
  const restore={document:globalThis.document,Option:globalThis.Option,window:globalThis.window};
  globalThis.document=window.document;globalThis.window=window;globalThis.Option=window.Option;
  let schedules=[],expenses=[],rpcCount=0,nextId=1,refreshCount=0,confirmationCount=0;
  window.confirm=()=>{confirmationCount++;return true;};
  const user={id:'synthetic-test-user'};
  const fake={
    auth:{getUser:async()=>({data:{user}})},
    from(name){
      assert.equal(name,'Apiary_Recurring_Expenses');
      return {
        select(){
          return {eq(){return {order:async()=>({data:schedules.map(s=>({...s}))})}}};
        },
        insert(record){
          const r={id:nextId++,active:true,...record};
          schedules.push(r);
          return {select:async()=>({data:[{id:r.id}]})};
        },
        update(changes){
          return {eq(key,id){assert.equal(key,'id');return {eq(key2,userId){assert.equal(key2,'user_id');assert.equal(userId,user.id);return {select:async()=>{
            const r=schedules.find(s=>s.id===id);Object.assign(r,changes);return {data:[{id}]};
          }};}}};
        }
      };
    },
    async rpc(method,args){
      assert.equal(method,'record_recurring_expense');rpcCount++;
      const s=schedules.find(x=>x.id===args.p_template_id);
      if(s.next_due_date!==args.p_expected_due_date)return {error:{message:'Due date has changed'}};
      const month=Number(s.next_due_date.slice(5,7));const year=Number(s.next_due_date.slice(0,4));const day=Number(s.next_due_date.slice(8,10));
      const dt=new Date(Date.UTC(year,month,0)); // next-month first day for 1-based month
      dt.setUTCDate(1);dt.setUTCMonth(dt.getUTCMonth()+1);
      dt.setUTCDate(Math.min(day,new Date(Date.UTC(dt.getUTCFullYear(),dt.getUTCMonth()+1,0)).getUTCDate()));
      s.next_due_date=dt.toISOString().slice(0,10);
      expenses.push({id:100+expenses.length,...args,amount:args.p_actual_amount});
      return {data:100+expenses.length-1};
    }
  };
  try{
    const moduleText=fs.readFileSync('js/recurring-expenses.js','utf8');
    const {setupRecurringExpenses}=await import('data:text/javascript;base64,'+Buffer.from(moduleText).toString('base64'));
    const api=setupRecurringExpenses({
      supabase:fake,expenseSection:document.getElementById('expensesSection'),
      categorySource:document.getElementById('expenseCategory'),
      paymentSource:document.getElementById('expensePayment'),
      getHives:()=>[],uploadReceipts:async()=>{throw Error('No receipt selected in test')},
      receiptFiles:files=>Array.from(files),refreshExpenses:async()=>{refreshCount++;}
    });
    const $=id=>document.getElementById(id),click=id=>$(id).click();
    const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
    $('recurringDescription').value='Synthetic website hosting';
    $('recurringCategory').value='Web Hosting & Subscriptions';
    $('recurringAmount').value='12.00';
    $('recurringDue').value='2026-11-17';
    click('saveRecurring');await flush();
    assert.equal(schedules.length,1,'schedule saved');
    assert.equal(expenses.length,0,'creating reminder does not post expense');
    assert.equal(rpcCount,0);
    await api.refresh();
    const first=document.querySelector('#recurringList button');
    assert.equal(first.textContent,'Review payment');
    first.click();
    assert.equal($('recurringReview').hidden,false);
    click('cancelRecurringReview');
    assert.equal(expenses.length,0,'cancelling review does not post expense');
    document.querySelector('#recurringList button').click();
    $('recurringPaidAmount').value='15.50';
    $('recurringPaidDate').value='2026-11-18';
    click('recordRecurring');await flush();
    assert.equal(expenses.length,1,'one explicit confirmation posts exactly one expense');
    assert.equal(expenses[0].amount,15.50,'actual confirmed amount is used');
    assert.equal(rpcCount,1);
    assert.equal(refreshCount,1);
    assert.equal($('recurringReview').hidden,true);
    assert.equal(schedules[0].next_due_date,'2026-12-17');
    assert.ok(confirmationCount>=1);
    await api.refresh();
    let buttons=[...document.querySelectorAll('#recurringList button')];
    assert.equal(buttons.at(-1).textContent,'Pause');
    buttons.at(-1).click();await flush();
    assert.equal(schedules[0].active,false);
    assert.equal(expenses.length,1,'pausing does not delete historical expenses');
    buttons=[...document.querySelectorAll('#recurringList button')];
    assert.equal(buttons[0].disabled,true,'cannot record a paused schedule');
    assert.equal(buttons.at(-1).textContent,'Resume');
  }finally{
    dom.window.close();
    globalThis.document=restore.document;globalThis.Option=restore.Option;globalThis.window=restore.window;
  }
});
