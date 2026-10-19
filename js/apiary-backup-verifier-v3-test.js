// TEST-ONLY WINTER BACKUP FORMAT v3. Do not use in production until full recovery certification.
// Private in-browser integrity check for Tricks Bees 207 backup ZIP files.
// This module reads only the ZIP chosen by the user. No API calls or writes.
const dec = new TextDecoder('utf-8', {fatal:true});
const tables = [
  'Hives','Hive_Colonies','Colony_Transfers','Hive_Profiles','Hive_Inspections',
  'Hive_Feedings','Hive_Treatments','Hive_Harvests','Hive_Queen_Replacements',
  'Hive_Splits','Hive_Losses','Apiary_Activities','Apiary_Expenses',
  'Apiary_Income','Apiary_Expense_Receipts','Apiary_Income_Receipts','varroa_watch_results'
];
const winterTables = [
 'Winter_Seasons','Winter_Participation','Winter_Checklist_Items',
 'Winter_Observations','Winter_Outcomes','Winter_Audit_History','Winter_Snapshots'
];
const relationships = {
  Hive_Colonies:[['hive_id','Hives']],
  Colony_Transfers:[['colony_id','Hive_Colonies'],['from_hive_id','Hives'],['to_hive_id','Hives']],
  Hive_Profiles:[['hive_id','Hives'],['colony_id','Hive_Colonies']],
  Hive_Inspections:[['hive_id','Hives'],['colony_id','Hive_Colonies']],
  Hive_Feedings:[['hive_id','Hives'],['colony_id','Hive_Colonies']],
  Hive_Treatments:[['hive_id','Hives'],['colony_id','Hive_Colonies']],
  Hive_Harvests:[['hive_id','Hives'],['colony_id','Hive_Colonies']],
  Hive_Queen_Replacements:[['hive_id','Hives'],['colony_id','Hive_Colonies']],
  Hive_Splits:[['hive_id','Hives'],['daughter_hive_id','Hives'],['colony_id','Hive_Colonies'],['daughter_colony_id','Hive_Colonies']],
  Hive_Losses:[['hive_id','Hives'],['colony_id','Hive_Colonies']],
  Apiary_Activities:[['hive_id','Hives'],['colony_id','Hive_Colonies']],
  Apiary_Expenses:[['hive_id','Hives'],['recurring_template_id','Apiary_Recurring_Expenses']],
  Apiary_Recurring_Expenses:[['hive_id','Hives']],
  Apiary_Income:[['hive_id','Hives']],
  Apiary_Expense_Receipts:[['expense_id','Apiary_Expenses']],
  Apiary_Income_Receipts:[['income_id','Apiary_Income']],
  varroa_watch_results:[['inspection_id','Hive_Inspections']],
  Winter_Participation:[['season_id','Winter_Seasons'],['colony_id','Hive_Colonies']],
  Winter_Checklist_Items:[['participation_id','Winter_Participation']],
  Winter_Observations:[['participation_id','Winter_Participation']],
  Winter_Outcomes:[['participation_id','Winter_Participation'],['loss_record_id','Hive_Losses']],
  Winter_Snapshots:[['season_id','Winter_Seasons']]
};
const receiptTypes = [
  {table:'Apiary_Expense_Receipts',bucket:'apiary-receipts',recordKey:'expense_id'},
  {table:'Apiary_Income_Receipts',bucket:'apiary-income-receipts',recordKey:'income_id'}
];
function demand(ok,reason){if(!ok)throw new Error(reason);}
function crc32(bytes){
  let c=-1;
  for(const byte of bytes){c^=byte;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);}
  return (c^-1)>>>0;
}
// Reads the STORE-only ZIP format emitted by this Apiary Log, including checksums.
function unzipStore(ab){
  const bytes=new Uint8Array(ab),view=new DataView(ab);
  demand(bytes.length>=22,'This is not a valid backup ZIP.');
  let eocd=-1;
  for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--){
    if(view.getUint32(p,true)===0x06054b50 && p+22+view.getUint16(p+20,true)===bytes.length){eocd=p;break;}
  }
  demand(eocd>=0,'ZIP directory was not found.');
  demand(view.getUint16(eocd+4,true)===0&&view.getUint16(eocd+6,true)===0,'Multi-disk ZIP is unsupported.');
  const n=view.getUint16(eocd+10,true),length=view.getUint32(eocd+12,true),offset=view.getUint32(eocd+16,true);
  demand(n>=3&&n<=4096&&view.getUint16(eocd+8,true)===n,'Invalid ZIP entry count.');
  demand(offset+length<=eocd,'ZIP directory is out of bounds.');
  const entries=new Map();let p=offset;
  for(let i=0;i<n;i++){
    demand(p+46<=offset+length&&view.getUint32(p,true)===0x02014b50,'ZIP directory entry is invalid.');
    const method=view.getUint16(p+10,true),flags=view.getUint16(p+8,true);
    demand(!(flags&1)&&method===0,'Only unencrypted, uncompressed Apiary Log ZIP files are supported.');
    const crc=view.getUint32(p+16,true),size=view.getUint32(p+24,true);
    demand(view.getUint32(p+20,true)===size,'ZIP size fields do not match.');
    const nameLen=view.getUint16(p+28,true),extra=view.getUint16(p+30,true),comment=view.getUint16(p+32,true);
    const headerOffset=view.getUint32(p+42,true),end=p+46+nameLen+extra+comment;
    demand(end<=offset+length,'ZIP entry metadata is incomplete.');
    const name=dec.decode(bytes.subarray(p+46,p+46+nameLen));
    demand(name&&!name.startsWith('/')&&!name.includes('\\')&&!name.split('/').includes('..'),'Unsafe ZIP entry path.');
    demand(!entries.has(name),'Duplicate file in ZIP.');
    demand(headerOffset+30<=offset&&view.getUint32(headerOffset,true)===0x04034b50,'ZIP local header is invalid.');
    const localNameLen=view.getUint16(headerOffset+26,true),localExtra=view.getUint16(headerOffset+28,true);
    demand(dec.decode(bytes.subarray(headerOffset+30,headerOffset+30+localNameLen))===name,'ZIP entry path mismatch.');
    const bodyOffset=headerOffset+30+localNameLen+localExtra;
    demand(bodyOffset+size<=offset,'ZIP data is incomplete.');
    const data=bytes.subarray(bodyOffset,bodyOffset+size);
    demand(crc32(data)===crc,'File checksum mismatch: '+name);
    entries.set(name,data);p=end;
  }
  demand(p===offset+length,'ZIP directory length is incorrect.');
  return entries;
}
function json(files,name){
  const bytes=files.get(name);
  demand(bytes,'Backup is missing '+name+'.');
  try{return JSON.parse(dec.decode(bytes));}
  catch{throw new Error(name+' is not valid JSON.');}
}
async function digest(bytes){
  const hash=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function verifyApiaryBackup(file){
  demand(file&&file.size>0&&file.size<=300*1024*1024,'Choose a backup ZIP smaller than 300 MB.');
  const files=unzipStore(await file.arrayBuffer());
  const manifest=json(files,'manifest.json'),data=json(files,'apiary-data.json');
  demand(manifest.format==='tricks-bees-207-records-and-receipts'&&(manifest.version===1||manifest.version===2||manifest.version===3),'This is not a supported receipt-backup ZIP.');
  demand(data.format==='tricks-bees-207-apiary-backup'&&data.version===(manifest.version===1?2:manifest.version===2?3:4),'The database backup format is unexpected.');
  const expectedTables=manifest.version===3?[...tables,'Apiary_Recurring_Expenses',...winterTables]:
    manifest.version===2?[...tables,'Apiary_Recurring_Expenses']:tables;
  demand(manifest.exported_at===data.exported_at,'Backup dates disagree.');
  demand(data.tables&&typeof data.tables==='object'&&!Array.isArray(data.tables),'The tables section is invalid.');
  demand(manifest.table_counts&&typeof manifest.table_counts==='object','Manifest table counts are missing.');
  const ids={};let recordCount=0;
  for(const name of expectedTables){
    const rows=data.tables[name];
    demand(Array.isArray(rows),'Missing database table: '+name);
    demand(manifest.table_counts[name]===rows.length,'Record count mismatch: '+name);
    const field=name==='varroa_watch_results'?'inspection_id':'id';
    const seen=new Set();
    for(const row of rows){
      demand(row&&typeof row==='object'&&!Array.isArray(row),'Invalid record in '+name);
      demand(row[field]!=null,'Record without an ID in '+name);
      const id=String(row[field]);
      demand(!seen.has(id),'Duplicate record ID in '+name);
      seen.add(id);
    }
    ids[name]=seen;recordCount+=rows.length;
  }
  demand(Object.keys(data.tables).length===expectedTables.length,'Unexpected database tables.');
  demand(Object.keys(manifest.table_counts).length===expectedTables.length,'Unexpected manifest table counts.');
  for(const [table,fields] of Object.entries(relationships)){
    for(const row of (data.tables[table]||[])){
      for(const [key,parent] of fields){
        demand(row[key]==null||ids[parent].has(String(row[key])),table+' has a missing '+parent+' reference.');
      }
    }
  }

  if(manifest.version===3){
    const pById=new Map(data.tables.Winter_Participation.map(p=>[String(p.id),p]));
    const seasonById=new Map(data.tables.Winter_Seasons.map(s=>[String(s.id),s]));
    const colonyById=new Map(data.tables.Hive_Colonies.map(c=>[String(c.id),c]));
    for(const s of data.tables.Winter_Seasons){
      demand(Number.isInteger(s.start_year)&&s.start_year>=2000&&s.start_year<=2200,
        'Invalid winter season year.');
      demand(s.status==='open'||s.status==='closed','Invalid winter season status.');
    }
    for(const p of data.tables.Winter_Participation){
      const season=seasonById.get(String(p.season_id));
      const colony=colonyById.get(String(p.colony_id));
      demand(p.participation==='included'||p.participation==='excluded','Invalid winter participation.');
      demand(season&&colony,'Winter participation has invalid references.');
      demand(p.user_id===season.user_id&&p.user_id===colony.user_id,
        'Winter participant owner differs from season or colony.');
    }
    for(const [table,rows] of [
      ['Winter_Checklist_Items',data.tables.Winter_Checklist_Items],
      ['Winter_Observations',data.tables.Winter_Observations],
      ['Winter_Outcomes',data.tables.Winter_Outcomes]
    ]){
      for(const row of rows){
        const p=pById.get(String(row.participation_id));
        demand(p&&row.user_id===p.user_id,table+' has mismatched owner and colony.');
      }
    }
    const entityNames=new Set([
      'Winter_Seasons','Winter_Participation','Winter_Checklist_Items',
      'Winter_Observations','Winter_Outcomes'
    ]);
    for(const event of data.tables.Winter_Audit_History){
      demand(entityNames.has(event.entity_type),'Unexpected winter audit entity.');
      demand(ids[event.entity_type].has(String(event.entity_id)),
        'Winter audit event points outside this backup.');
      const target=(data.tables[event.entity_type]||[]).find(r=>String(r.id)===String(event.entity_id));
      demand(target?.user_id===event.user_id,'Winter audit owner differs from its record.');
      demand(['INSERT','UPDATE','DELETE'].includes(event.event_type),'Invalid winter audit event.');
      demand(event.before_record==null||typeof event.before_record==='object','Invalid prior audit record.');
      demand(event.after_record==null||typeof event.after_record==='object','Invalid new audit record.');
    }
    for(const snapshot of data.tables.Winter_Snapshots){
      const parent=seasonById.get(String(snapshot.season_id));
      demand(parent?.user_id===snapshot.user_id,'Winter snapshot owner differs from its season.');
      demand(Number.isInteger(snapshot.version)&&snapshot.version>0,'Invalid winter snapshot version.');
      demand(snapshot.snapshot&&typeof snapshot.snapshot==='object'&&!Array.isArray(snapshot.snapshot),
        'Historical winter snapshot content is invalid.');
      demand(String(snapshot.snapshot.season_id)===String(snapshot.season_id),
        'Historical winter snapshot has wrong season ID.');
      demand(Array.isArray(snapshot.snapshot.participants),'Historical snapshot participants are missing.');
    }
  }
  const rowMap=new Map();
  for(const type of receiptTypes){
    for(const row of data.tables[type.table]){
      demand(typeof row.storage_path==='string','A receipt storage path is missing.');
      rowMap.set(type.table+':'+row.id,{...type,row});
    }
  }
  demand(Array.isArray(manifest.receipt_files),'Receipt manifest is missing.');
  demand(manifest.receipt_count===rowMap.size&&manifest.receipt_files.length===rowMap.size,'Receipt record count mismatch.');
  const seenReceipts=new Set(),seenPaths=new Set();
  let totalBytes=0;
  for(const receipt of manifest.receipt_files){
    demand(receipt&&typeof receipt==='object','Invalid receipt manifest entry.');
    const key=receipt.receipt_table+':'+receipt.receipt_id;
    const original=rowMap.get(key);
    demand(original&&!seenReceipts.has(key),'Receipt entry is missing or duplicated.');
    seenReceipts.add(key);
    demand(receipt.bucket===original.bucket&&receipt.storage_path===original.row.storage_path,'Receipt metadata does not match its database record.');
    demand(receipt.archive_path==='storage/'+original.bucket+'/'+receipt.storage_path,'Receipt archive path does not match.');
    demand(!seenPaths.has(receipt.archive_path),'Duplicate receipt archive path.');
    seenPaths.add(receipt.archive_path);
    const bytes=files.get(receipt.archive_path);
    demand(bytes,'A receipt file is missing from the ZIP.');
    demand(bytes.length===Number(receipt.bytes)&&bytes.length===Number(original.row.file_size),'Receipt file size does not match.');
    demand(await digest(bytes)===receipt.sha256,'Receipt SHA-256 hash does not match.');
    const p=receipt.storage_path.split('/');
    demand(p.length===3&&p[1]===String(original.row[original.recordKey]),'Receipt filename points to the wrong transaction.');
    totalBytes+=bytes.length;
  }
  const stored=[...files.keys()].filter(n=>n.startsWith('storage/')&&!n.endsWith('/'));
  demand(stored.length===seenPaths.size&&stored.every(n=>seenPaths.has(n)),'Unexpected or unlisted receipt file.');
  demand(totalBytes===manifest.receipt_bytes,'Receipt byte count mismatch.');
  demand(files.has('README.txt'),'Backup instructions are missing.');
  return {records:recordCount,tables:expectedTables.length,receipts:seenReceipts.size,
    expenses:data.tables.Apiary_Expenses.length,income:data.tables.Apiary_Income.length};
}
export async function verifyApiaryBackupOnPage(file,status){
  if(!file||!status)return;
  status.textContent='Checking the ZIP on this device. No files are uploaded...';
  try{
    const result=await verifyApiaryBackup(file);
    status.textContent='ZIP INTEGRITY PASSED: '+result.records+' records across '+result.tables+
      ' tables; '+result.receipts+' receipt files; '+result.expenses+' expenses and '+result.income+
      ' income entries. ZIP checksums, receipt hashes and database relationships match. '+
      'No data was uploaded or changed. Complete winter-record restoration requires the updated Recovery Test importer.';
  }catch(error){
    status.textContent='ZIP VERIFICATION FAILED: '+(error?.message||String(error))+
      '. No data was uploaded or changed.';
  }
}


/**
 * Returns parsed contents ONLY after the same full integrity checks used by
 * the live Backup tab have passed. Intended for the separate recovery-test
 * utility. Never sends the file to any server.
 */
export async function readVerifiedApiaryZip(file) {
  const summary=await verifyApiaryBackup(file);
  const entries=unzipStore(await file.arrayBuffer());
  return {
    summary,
    manifest:json(entries,'manifest.json'),
    data:json(entries,'apiary-data.json'),
    entries
  };
}
