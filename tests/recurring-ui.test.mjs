import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

// No connections to live data. Repeating a saved purchase never records it a second time.
test('automatic expenses: one existing purchase, compact list, pause/resume',async()=>{
  const dom=new JSDOM('<!doctype html><html><body><section id="expensesSection"></section></body></html>',{url:'https://localhost'});
  const prev={document:globalThis.document,window:globalThis.window};
  globalThis.document=dom.window.document;globalThis.window=dom.window;
  const owner={id:'synthetic-test-owner'};
  const schedules=[];
  const expenses=[{id:18,description:'Synthetic membership',amount:24.50,date:'2026-10-17'}];
  const calls=[];
  let confirmations=0;
  dom.window.confirm=()=>{confirmations++;return true;};
  const fake={
    auth:{getUser:async()=>({data:{user:owner}})},
    from(table){
      assert.equal(table,'Apiary_Recurring_Expenses');
      const op={type:'',patch:null,filters:[]};
      const query={
        select(){if(!op.type)op.type='read';return query;},
        update(patch){op.type='update';op.patch=patch;return query;},
        eq(key,val){op.filters.push([key,val]);return query;},
        order(){return query;},
        then(resolve,reject){
          let items=schedules.filter(s=>op.filters.every(([key,val])=>s[key]===val));
          if(op.type==='update')items.forEach(s=>Object.assign(s,op.patch));
          return Promise.resolve({data:items.map(s=>({...s}))}).then(resolve,reject);
        }
      };
      return query;
    },
    async rpc(name,args){
      assert.equal(name,'enable_auto_recurring_expense');
      assert.equal(args.p_expense_id,18);
      calls.push(args);
      const s={id:1,user_id:owner.id,description:'Synthetic membership',vendor:'Testing',
        amount:24.50,automatic_posting:true,active:true,frequency:args.p_frequency,
        next_due_date:'2026-11-17'};
      schedules.push(s);
      return {data:s.id};
    }
  };
  try{
    const moduleText=fs.readFileSync('js/recurring-expenses.js','utf8');
    const {setupRecurringExpenses}=await import('data:text/javascript;base64,'+Buffer.from(moduleText).toString('base64'));
    const manager=setupRecurringExpenses({supabase:fake,expenseSection:document.getElementById('expensesSection')});
    assert.equal(document.querySelector('#recurringDescription'),null,'old duplicate editor is gone');
    assert.match(document.querySelector('#recurringList').textContent,/Loading automatic/);
    await manager.refresh();
    assert.match(document.querySelector('#recurringList').textContent,/No automatic expense schedules/);
    await manager.enableFromExpense(18,'monthly');
    assert.equal(calls.length,1);
    assert.equal(expenses.length,1,'initial purchase was not duplicated');
    assert.equal(manager.isAutomatic(1),true);
    assert.equal(manager.frequencyFor(1),'monthly');
    assert.match(document.querySelector('#recurringList').textContent,/Synthetic membership/);
    assert.match(document.querySelector('#recurringList').textContent,/2026-11-17/);
    let button=document.querySelector('#recurringList button');
    assert.equal(button.textContent,'Pause repetition');
    button.click();
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(schedules[0].active,false);
    button=document.querySelector('#recurringList button');
    assert.equal(button.textContent,'Resume repetition');
    button.click();
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(schedules[0].active,true);
    assert.equal(confirmations,2);
    await manager.pauseFromExpense(1);
    assert.equal(schedules[0].active,false);
    assert.equal(expenses.length,1,'pausing does not remove saved expenses');
  }finally{
    dom.window.close();
    globalThis.document=prev.document;globalThis.window=prev.window;
  }
});
