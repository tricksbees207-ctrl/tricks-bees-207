import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const body=await readFile(new URL('../js/winter-receipt-recovery-test.js',import.meta.url),'utf8');
const {verifyReceiptRecovery,sha256}=await import('data:text/javascript;base64,'+Buffer.from(body).toString('base64'));
const user='11111111-1111-4111-8111-111111111111',run='22222222-2222-4222-8222-222222222222';
const bytes=new TextEncoder().encode('receipt-content');
const original=user+'/7/original.pdf',temp=user+'/7/restorecheck-'+run+'-original.pdf';
const hash=await sha256(bytes);
const archive={manifest:{version:3,receipt_files:[{bucket:'apiary-receipts',receipt_table:'Apiary_Expense_Receipts',storage_path:original,archive_path:'receipt',receipt_id:1,bytes:bytes.length,sha256:hash}]},data:{tables:{Apiary_Expense_Receipts:[{id:1,storage_path:original,mime_type:'application/pdf'}]}},entries:new Map([['receipt',bytes]])};
function mock({corrupt=false,collision=false,failRemove=false}={}){
 const files=new Map([[original,new Blob([bytes])]]);if(collision)files.set(temp,new Blob(['existing']));
 const removed=[];let uploads=0;
 const storage={list:async(folder,{search})=>({data:[...files.keys()].filter(p=>p.startsWith(folder+'/')&&p.split('/').at(-1).includes(search)).map(p=>({name:p.split('/').at(-1)}))}),upload:async(path,blob,options)=>{assert.equal(options.upsert,false);uploads++;if(files.has(path))return {error:{message:'Duplicate'}};files.set(path,blob);return {data:{path}};},download:async path=>({data:corrupt?new Blob(['bad']):files.get(path)}),remove:async paths=>{if(failRemove)return {error:{message:'cleanup blocked'}};for(const p of paths){removed.push(p);files.delete(p);}return {data:[]};}};
 return {client:{storage:{from:bucket=>{assert.equal(bucket,'apiary-receipts');return storage;}}},files,removed,get uploads(){return uploads;}};
}
test('round trip verifies and removes only its new copy',async()=>{const m=mock();const r=await verifyReceiptRecovery({client:m.client,archive,userId:user,runId:run});assert.equal(r.passed,true);assert.equal(r.downloaded_and_matched,1);assert.deepEqual(m.removed,[temp]);assert.equal(await m.files.get(original).text(),'receipt-content');});
test('corrupt recovered bytes fail and still clean up',async()=>{const m=mock({corrupt:true});const r=await verifyReceiptRecovery({client:m.client,archive,userId:user,runId:run});assert.equal(r.passed,false);assert.equal(r.downloaded_and_matched,0);assert.deepEqual(m.removed,[temp]);assert.ok(m.files.has(original));});
test('a filename collision is never overwritten or deleted',async()=>{const m=mock({collision:true});const r=await verifyReceiptRecovery({client:m.client,archive,userId:user,runId:run});assert.equal(r.passed,false);assert.equal(m.uploads,0);assert.deepEqual(m.removed,[]);assert.equal(await m.files.get(temp).text(),'existing');});
test('cleanup failure cannot produce a passing result',async()=>{const m=mock({failRemove:true});const r=await verifyReceiptRecovery({client:m.client,archive,userId:user,runId:run});assert.equal(r.passed,false);assert.equal(r.cleanup_pending.length,1);assert.ok(m.files.has(original));});
