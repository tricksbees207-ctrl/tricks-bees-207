// Synthetic test only; does not contact the live database or use real receipts.
import assert from 'node:assert/strict';
import { downloadCompleteBackup } from '../js/apiary-complete-backup.js';
import { verifyApiaryBackup, readVerifiedApiaryZip } from '../js/apiary-backup-verifier.js';

const userId='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const receiptBytes=new Blob(['Synthetic receipt 123'],{type:'application/pdf'});
const expenses=[{id:4,user_id:userId,hive_id:1,amount:12.5,recurring_template_id:20,recurring_due_date:'2026-10-17'}];
const schedules=[{id:20,user_id:userId,description:'Synthetic annual hosting',category:'Web Hosting & Subscriptions',amount:12.5,frequency:'yearly',anchor_date:'2026-10-17',next_due_date:'2027-10-17',active:true}];
const receipts=[{id:10,user_id:userId,expense_id:4,storage_path:userId+'/4/test.pdf',file_size:receiptBytes.size}];
const mockTables={
  Hives:[{id:1,hive_number:1,hive_name:'Synthetic'}],
  Apiary_Expenses:expenses,
  Apiary_Recurring_Expenses:schedules,
  Apiary_Expense_Receipts:receipts
};
let savedZip=null;
const origUrl=URL.createObjectURL;
const origRevoke=URL.revokeObjectURL;
const origSetTimeout=globalThis.setTimeout;
// The exporter retains a 60-second object-URL cleanup timer. It needn't delay the test process.
globalThis.setTimeout=(fn,ms,...args)=>{const timer=origSetTimeout(fn,ms,...args);timer.unref?.();return timer;};
URL.createObjectURL=blob=>{savedZip=blob;return 'blob:synthetic';};
URL.revokeObjectURL=()=>{};
globalThis.document={
  createElement:()=>({click(){},remove(){}}),
  body:{append(){}}
};
function fakeSupabase(missingFile=false){
  return {
    auth:{
      getUser:async()=>({data:{user:{id:userId}},error:null}),
      mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:'aal2'},error:null})}
    },
    from(name){
      return {select(){
        return {order(){
          return {range:async()=>({data:mockTables[name]||[],error:null})};
        }};
      }};
    },
    storage:{from(){return {download:async()=>missingFile
      ?{data:null,error:{message:'file not found'}}
      :{data:receiptBytes,error:null}
    }}}
  };
}
const button={disabled:false},message={textContent:''};
await downloadCompleteBackup({supabase:fakeSupabase(),button,message});
assert.ok(savedZip instanceof Blob,'Expected a ZIP download.');
assert.match(message.textContent,/ZIP download started/);
const report=await verifyApiaryBackup(savedZip);
assert.equal(report.records,4);
assert.equal(report.tables,18);
assert.equal(report.receipts,1);
assert.equal(report.expenses,1);
const archive=await readVerifiedApiaryZip(savedZip);
assert.equal(archive.manifest.version,2);
assert.equal(archive.data.version,3);
assert.equal(archive.data.tables.Apiary_Recurring_Expenses[0].id,20);
assert.equal(archive.data.tables.Apiary_Expenses[0].recurring_template_id,20);
console.log('PASS: synthetic ZIP generated and independently verified');
const damaged=new Uint8Array(await savedZip.arrayBuffer());
const marker=new TextEncoder().encode('Synthetic receipt 123');
let index=-1;
outer:for(let i=0;i<=damaged.length-marker.length;i++){
  for(let j=0;j<marker.length;j++)if(damaged[i+j]!==marker[j])continue outer;
  index=i;break;
}
assert.ok(index>=0,'Test marker not found');
damaged[index]^=1;
await assert.rejects(verifyApiaryBackup(new Blob([damaged])),/checksum mismatch/i);
console.log('PASS: corrupted ZIP receipt rejected');
savedZip=null;
await downloadCompleteBackup({supabase:fakeSupabase(true),button,message});
assert.equal(savedZip,null,'Missing receipt must not cause a partial ZIP download');
assert.match(message.textContent,/stopped/i);
console.log('PASS: missing receipt aborts ZIP generation');
URL.createObjectURL=origUrl;
URL.revokeObjectURL=origRevoke;
globalThis.setTimeout=origSetTimeout;
