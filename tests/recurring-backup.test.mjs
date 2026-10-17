// Pure Node tests of the exported ZIP verifier. No private user data is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';

globalThis.crypto ||= webcrypto;
const source=fs.readFileSync('js/apiary-backup-verifier.js','utf8');
const {verifyApiaryBackup,readVerifiedApiaryZip}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));

const names=['Hives','Hive_Colonies','Colony_Transfers','Hive_Profiles','Hive_Inspections','Hive_Feedings','Hive_Treatments','Hive_Harvests','Hive_Queen_Replacements','Hive_Splits','Hive_Losses','Apiary_Activities','Apiary_Expenses','Apiary_Income','Apiary_Expense_Receipts','Apiary_Income_Receipts','varroa_watch_results'];
const user='00000000-0000-4000-8000-000000000001';
const enc=new TextEncoder();
function crc32(data){let x=-1;for(const b of data){x^=b;for(let i=0;i<8;i++)x=(x>>>1)^((x&1)?0xedb88320:0);}return(x^-1)>>>0;}
function zip(items){
  let offset=0;const local=[],central=[];
  for(const {name,body}of items){
    const n=enc.encode(name),bytes=typeof body==='string'?enc.encode(body):body;
    const crc=crc32(bytes);const a=new Uint8Array(30+n.length),v=new DataView(a.buffer);
    v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x0800,true);v.setUint32(14,crc,true);
    v.setUint32(18,bytes.length,true);v.setUint32(22,bytes.length,true);v.setUint16(26,n.length,true);a.set(n,30);
    local.push(a,bytes);
    const b=new Uint8Array(46+n.length),w=new DataView(b.buffer);
    w.setUint32(0,0x02014b50,true);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint16(8,0x0800,true);
    w.setUint32(16,crc,true);w.setUint32(20,bytes.length,true);w.setUint32(24,bytes.length,true);
    w.setUint16(28,n.length,true);w.setUint32(42,offset,true);b.set(n,46);central.push(b);
    offset+=a.byteLength+bytes.length;
  }
  const size=central.reduce((x,b)=>x+b.length,0),end=new Uint8Array(22),v=new DataView(end.buffer);
  v.setUint32(0,0x06054b50,true);v.setUint16(8,items.length,true);v.setUint16(10,items.length,true);
  v.setUint32(12,size,true);v.setUint32(16,offset,true);
  return new Blob([...local,...central,end],{type:'application/zip'});
}
async function fixture(version,{missingSchedule=false,badHash=false}={}){
  const tables=Object.fromEntries(names.map(name=>[name,[]]));
  tables.Hives=[{id:1,hive_number:1,hive_name:'Synthetic test hive'}];
  tables.Apiary_Expenses=[{id:3,user_id:user,hive_id:1,expense_date:'2026-10-17',category:'Web Hosting & Subscriptions',amount:15.50}];
  const extra=version===2;
  if(extra&&!missingSchedule) {
    tables.Apiary_Recurring_Expenses=[{id:7,user_id:user,description:'Synthetic test hosting',category:'Web Hosting & Subscriptions',amount:12,frequency:'monthly',anchor_date:'2026-10-17',next_due_date:'2026-11-17',active:true}];
    tables.Apiary_Expenses[0].recurring_template_id=7;
    tables.Apiary_Expenses[0].recurring_due_date='2026-10-17';
  }
  const path=user+'/3/synthetic.pdf',original=enc.encode('%PDF-1.4 testing fixture'),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',original)),n=>n.toString(16).padStart(2,'0')).join('');
  tables.Apiary_Expense_Receipts=[{id:9,expense_id:3,user_id:user,storage_path:path,original_name:'synthetic.pdf',file_size:original.length,mime_type:'application/pdf'}];
  const exported_at='2026-10-17T12:00:00.000Z';
  const manifest={format:'tricks-bees-207-records-and-receipts',version,exported_at,table_counts:Object.fromEntries(Object.entries(tables).map(([k,v])=>[k,v.length])),receipt_count:1,receipt_bytes:original.length,receipt_files:[{bucket:'apiary-receipts',storage_path:path,archive_path:'storage/apiary-receipts/'+path,bytes:original.length,sha256:badHash?'badsha256':hash,receipt_table:'Apiary_Expense_Receipts',receipt_id:9}]};
  const data={format:'tricks-bees-207-apiary-backup',version:extra?3:2,exported_at,tables};
  return zip([{name:'README.txt',body:'Synthetic test only.'},{name:'manifest.json',body:JSON.stringify(manifest)},{name:'apiary-data.json',body:JSON.stringify(data)},{name:'storage/apiary-receipts/'+path,body:original}]);
}
test('old 17-table ZIP format remains verifiable and readable',async()=>{
  const f=await fixture(1);const v=await readVerifiedApiaryZip(f);
  assert.equal(v.summary.tables,17);assert.equal(v.summary.receipts,1);assert.equal(v.summary.expenses,1);
  assert.equal(v.data.tables.Apiary_Recurring_Expenses,undefined);
});
test('new 18-table ZIP format preserves schedules, linked expenses and receipts',async()=>{
  const f=await fixture(2);const v=await readVerifiedApiaryZip(f);
  assert.equal(v.summary.tables,18);assert.equal(v.summary.receipts,1);
  assert.equal(v.data.tables.Apiary_Recurring_Expenses[0].id,7);
  assert.equal(v.data.tables.Apiary_Expenses[0].recurring_template_id,7);
});
test('v2 missing schedule table fails closed',async()=>{
  await assert.rejects(verifyApiaryBackup(await fixture(2,{missingSchedule:true})),/Missing database table/);
});
test('receipt checksum mismatch fails for both backup versions',async()=>{
  for(const version of [1,2])await assert.rejects(verifyApiaryBackup(await fixture(version,{badHash:true})),/SHA-256 hash does not match/);
});
