// TEST ONLY. Run with Node.js 20+: node --test tests/winter-archive-v3.test.mjs
// Exercises the real browser backup verifier using synthetic records.
// No live database, Google account, receipt files, or Supabase network connection.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';

if (!globalThis.crypto) globalThis.crypto=webcrypto;
const source=await readFile(new URL('../js/apiary-backup-verifier-v3-test.js',import.meta.url),'utf8');
const {verifyApiaryBackup}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));

const standard=[
 'Hives','Hive_Colonies','Colony_Transfers','Hive_Profiles','Hive_Inspections',
 'Hive_Feedings','Hive_Treatments','Hive_Harvests','Hive_Queen_Replacements',
 'Hive_Splits','Hive_Losses','Apiary_Activities','Apiary_Expenses','Apiary_Income',
 'Apiary_Expense_Receipts','Apiary_Income_Receipts','varroa_watch_results'
];
const winter=[
 'Winter_Seasons','Winter_Participation','Winter_Checklist_Items',
 'Winter_Observations','Winter_Outcomes','Winter_Audit_History','Winter_Snapshots'
];

function crc32(bytes){
 let crc=-1;
 for(const byte of bytes){
   crc^=byte;
   for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
 }
 return (crc^-1)>>>0;
}
function buildStoredZip(entries){
 const parts=[],central=[];
 let offset=0;
 for(const [name,body] of entries){
   const filename=Buffer.from(name,'utf8');
   const data=Buffer.from(body);
   const crc=crc32(data);
   const local=Buffer.alloc(30+filename.length);
   local.writeUInt32LE(0x04034b50,0);
   local.writeUInt16LE(20,4);
   local.writeUInt16LE(0x0800,6);
   local.writeUInt32LE(crc,14);
   local.writeUInt32LE(data.length,18);
   local.writeUInt32LE(data.length,22);
   local.writeUInt16LE(filename.length,26);
   filename.copy(local,30);
   parts.push(local,data);
   const dir=Buffer.alloc(46+filename.length);
   dir.writeUInt32LE(0x02014b50,0);
   dir.writeUInt16LE(20,4);dir.writeUInt16LE(20,6);
   dir.writeUInt16LE(0x0800,8);
   dir.writeUInt32LE(crc,16);
   dir.writeUInt32LE(data.length,20);dir.writeUInt32LE(data.length,24);
   dir.writeUInt16LE(filename.length,28);
   dir.writeUInt32LE(offset,42);
   filename.copy(dir,46);
   central.push(dir);
   offset+=local.length+data.length;
 }
 const dirSize=central.reduce((sum,x)=>sum+x.length,0);
 const end=Buffer.alloc(22);
 end.writeUInt32LE(0x06054b50,0);
 end.writeUInt16LE(entries.length,8);
 end.writeUInt16LE(entries.length,10);
 end.writeUInt32LE(dirSize,12);
 end.writeUInt32LE(offset,16);
 return Buffer.concat([...parts,...central,end]);
}
function backupData(version=3){
 const names=version===1?standard:version===2?[...standard,'Apiary_Recurring_Expenses']:
   [...standard,'Apiary_Recurring_Expenses',...winter];
 const tables=Object.fromEntries(names.map(name=>[name,[]]));
 if(version===3){
   const user='11111111-1111-4111-8111-111111111111';
   tables.Hives=[{id:1,hive_number:1,hive_name:'Synthetic Hive'}];
   tables.Hive_Colonies=[{id:2,hive_id:1,user_id:user,colony_name:'Synthetic Colony'}];
   tables.Winter_Seasons=[{id:3,user_id:user,start_year:2026,status:'closed',closed_at:'2027-05-01T12:00:00Z'}];
   tables.Winter_Participation=[{id:4,user_id:user,season_id:3,colony_id:2,participation:'included'}];
   tables.Winter_Checklist_Items=[{id:5,user_id:user,participation_id:4,item_key:'health_queen',section:'health',label:'Queen status reviewed',status:'complete'}];
   tables.Winter_Observations=[{id:6,user_id:user,participation_id:4,observed_on:'2027-01-15',activity:'heard'}];
   tables.Winter_Outcomes=[{id:7,user_id:user,participation_id:4,outcome:'survived',confirmed_on:'2027-04-20'}];
   tables.Winter_Audit_History=[{id:8,user_id:user,entity_type:'Winter_Checklist_Items',entity_id:5,event_type:'UPDATE',before_record:{status:'not_checked'},after_record:{status:'complete'}}];
   tables.Winter_Snapshots=[{id:9,user_id:user,season_id:3,version:1,snapshot:{
     season_id:3,season_year:2026,participants:[{participation:{id:4,season_id:3,user_id:user}}]
   }}];
 }
 return tables;
}
function buildZip(version,tables=backupData(version)){
 const at='2027-05-01T12:00:00.000Z';
 const manifest={
   format:'tricks-bees-207-records-and-receipts',
   version,exported_at:at,
   table_counts:Object.fromEntries(Object.entries(tables).map(([name,rows])=>[name,rows.length])),
   receipt_count:0,receipt_bytes:0,receipt_files:[]
 };
 const data={
   format:'tricks-bees-207-apiary-backup',
   version:version===1?2:version===2?3:4,exported_at:at,tables
 };
 return buildStoredZip([
   ['README.txt','Synthetic test data only.'],
   ['manifest.json',JSON.stringify(manifest)],
   ['apiary-data.json',JSON.stringify(data)]
 ]);
}
const verify=zip=>verifyApiaryBackup(new Blob([zip]));
const changed=mutate=>{
 const tables=backupData(3);mutate(tables);return buildZip(3,tables);
};

test('v3 synthetic 25-table ZIP passes including winter snapshots and audit records',async()=>{
 const result=await verify(buildZip(3));
 assert.equal(result.tables,25);assert.equal(result.records,9);assert.equal(result.receipts,0);
});
test('backward compatibility: 18-table ZIP passes',async()=>{
 const result=await verify(buildZip(2));assert.equal(result.tables,18);
});
test('backward compatibility: 17-table ZIP passes',async()=>{
 const result=await verify(buildZip(1));assert.equal(result.tables,17);
});
test('incomplete winter ZIP is rejected',async()=>{
 await assert.rejects(()=>verify(changed(t=>{delete t.Winter_Snapshots;})),/Missing database table|database tables|count/i);
});
test('duplicate winter colony participation is rejected',async()=>{
 await assert.rejects(()=>verify(changed(t=>t.Winter_Participation.push({...t.Winter_Participation[0],id:14}))),/duplicated/i);
});
test('duplicate winter checklist item is rejected',async()=>{
 await assert.rejects(()=>verify(changed(t=>t.Winter_Checklist_Items.push({...t.Winter_Checklist_Items[0],id:15}))),/duplicated/i);
});
test('orphan checklist item is rejected',async()=>{
 await assert.rejects(()=>verify(changed(t=>{t.Winter_Checklist_Items[0].participation_id=999;})),/mismatched owner and colony|reference/i);
});
test('incorrect snapshot ownership is rejected',async()=>{
 await assert.rejects(()=>verify(changed(t=>{t.Winter_Snapshots[0].snapshot.participants[0].participation.user_id='other';})),/unrelated colony or owner/i);
});
test('incorrect historical season year is rejected',async()=>{
 await assert.rejects(()=>verify(changed(t=>{t.Winter_Snapshots[0].snapshot.season_year=2025;})),/season year/i);
});
test('orphan audit event is rejected',async()=>{
 await assert.rejects(()=>verify(changed(t=>{t.Winter_Audit_History[0].entity_id=999;})),/outside this backup/i);
});
test('a changed ZIP byte is rejected by CRC integrity checks',async()=>{
 const zip=Buffer.from(buildZip(3));
 const index=zip.indexOf(Buffer.from('tricks-bees-207-records-and-receipts'));
 assert.ok(index>0);
 zip[index]^=1;
 await assert.rejects(()=>verify(zip),/checksum mismatch/i);
});
