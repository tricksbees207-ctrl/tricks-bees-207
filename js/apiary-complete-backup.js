// Download a private, read-only snapshot of Apiary Log records and uploaded receipts.
// This is an archive tool, not a restore operation. No data is sent to a ZIP service.
const TABLES = [
  ['Hives','id'], ['Hive_Colonies','id'], ['Colony_Transfers','id'],
  ['Hive_Profiles','id'], ['Hive_Inspections','id'], ['Hive_Feedings','id'],
  ['Hive_Treatments','id'], ['Hive_Harvests','id'],
  ['Hive_Queen_Replacements','id'], ['Hive_Splits','id'], ['Hive_Losses','id'],
  ['Apiary_Activities','id'], ['Apiary_Expenses','id'], ['Apiary_Income','id'],
  ['Apiary_Expense_Receipts','id'], ['Apiary_Income_Receipts','id'],
  ['Apiary_Recurring_Expenses','id'],
  ['varroa_watch_results','inspection_id'],
  ['Winter_Seasons','id'],['Winter_Participation','id'],
  ['Winter_Checklist_Items','id'],['Winter_Observations','id'],
  ['Winter_Outcomes','id'],['Winter_Audit_History','id'],
  ['Winter_Snapshots','id']
];
const RECEIPT_SOURCES = [
  {table:'Apiary_Expense_Receipts',bucket:'apiary-receipts'},
  {table:'Apiary_Income_Receipts',bucket:'apiary-income-receipts'}
];
const MAX_ARCHIVE_BYTES = 250 * 1024 * 1024;
const PAGE_SIZE = 500;
const encoder = new TextEncoder();

async function readTable(supabase, table, orderKey) {
  const result = [];
  for(let offset = 0; ; offset += PAGE_SIZE) {
    const {data,error} = await supabase.from(table).select('*')
      .order(orderKey,{ascending:true}).range(offset,offset+PAGE_SIZE-1);
    if(error) throw new Error(`${table}: ${error.message}`);
    const batch = data || [];
    result.push(...batch);
    if(result.length > 1000000) throw new Error(`${table}: safety row limit exceeded`);
    if(batch.length < PAGE_SIZE) break;
  }
  return result;
}

function safeReceiptPath(path, userId) {
  if(typeof path !== 'string' || !path.startsWith(userId+'/') ||
      !/^[0-9a-f-]+\/[0-9]+\/[A-Za-z0-9_-]+\.(?:pdf|jpe?g|png|webp|heic|heif)$/i.test(path) ||
      path.includes('..') || path.includes('\\')) {
    throw new Error('Unexpected receipt storage path. Backup stopped safely.');
  }
  return path;
}

function crc32(data) {
  let crc = -1;
  for(const byte of data) {
    crc ^= byte;
    for(let i=0;i<8;i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ -1) >>> 0;
}

// ZIP STORE format: locally assembled without a third-party upload or ZIP service.
async function makeZip(entries) {
  if(entries.length > 65535) throw new Error('Too many archive entries.');
  const parts = [], directory = [];
  let offset = 0;
  for(const entry of entries) {
    const name = encoder.encode(entry.name);
    if(name.length > 65535) throw new Error('Archive entry name too long.');
    const body = entry.body instanceof Blob ? entry.body : new Blob([entry.body]);
    const bytes = new Uint8Array(await body.arrayBuffer());
    const size = bytes.byteLength, crc = crc32(bytes);
    if(offset + size + 30 + name.length >= 0xffffffff) throw new Error('Archive is too large.');
    const local = new Uint8Array(30 + name.length), view = new DataView(local.buffer);
    view.setUint32(0,0x04034b50,true);
    view.setUint16(4,20,true); view.setUint16(6,0x0800,true);
    view.setUint16(8,0,true); view.setUint32(14,crc,true);
    view.setUint32(18,size,true); view.setUint32(22,size,true);
    view.setUint16(26,name.length,true); local.set(name,30);
    parts.push(local,bytes);
    const central = new Uint8Array(46 + name.length), dir = new DataView(central.buffer);
    dir.setUint32(0,0x02014b50,true);
    dir.setUint16(4,20,true); dir.setUint16(6,20,true);
    dir.setUint16(8,0x0800,true); dir.setUint32(16,crc,true);
    dir.setUint32(20,size,true); dir.setUint32(24,size,true);
    dir.setUint16(28,name.length,true); dir.setUint32(42,offset,true);
    central.set(name,46); directory.push(central);
    offset += local.byteLength + size;
  }
  const directoryLength = directory.reduce((sum,x)=>sum+x.byteLength,0);
  const end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0,0x06054b50,true);
  e.setUint16(8,entries.length,true); e.setUint16(10,entries.length,true);
  e.setUint32(12,directoryLength,true); e.setUint32(16,offset,true);
  return new Blob([...parts,...directory,end],{type:'application/zip'});
}

async function sha256(blob) {
  const digest = await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}

export async function downloadCompleteBackup({supabase,button,message}) {
  if(!button || !message || button.disabled) return;
  button.disabled = true;
  const report = text => {message.textContent = text;};
  try {
    const {data:{user},error:authError} = await supabase.auth.getUser();
    if(authError || !user) throw new Error('Please sign in before downloading a backup.');
    const {data:assurance,error:assuranceError} = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if(assuranceError || assurance?.currentLevel !== 'aal2')
      throw new Error('Complete backup requires a verified authenticator sign-in.');
    const tables = {};
    for(const [name,orderKey] of TABLES) {
      report(`Reading ${name}...`);
      tables[name] = await readTable(supabase,name,orderKey);
      if(tables[name].some(row => 'user_id' in row && row.user_id !== user.id))
        throw new Error(`${name}: unexpected record ownership. No backup created.`);
    }
    const fileRecords = [], files = [];
    let totalBytes = 0;
    const receipts = RECEIPT_SOURCES.flatMap(source =>
      tables[source.table].map(receipt=>({...source,receipt})));
    for(let i=0;i<receipts.length;i++) {
      const {bucket,table,receipt} = receipts[i];
      const path = safeReceiptPath(receipt.storage_path,user.id);
      const relatedId = table === 'Apiary_Expense_Receipts' ? receipt.expense_id : receipt.income_id;
      if(path.split('/')[1] !== String(relatedId))
        throw new Error('Receipt path does not match its financial record. No ZIP created.');
      report(`Downloading receipt ${i+1} of ${receipts.length}...`);
      const {data:blob,error} = await supabase.storage.from(bucket).download(path);
      if(error || !blob) throw new Error(`Receipt ${i+1} unavailable: ${error?.message || 'download failed'}. No incomplete ZIP created.`);
      if(blob.size !== Number(receipt.file_size))
        throw new Error(`Receipt ${i+1} size differs from its database record. No incomplete ZIP created.`);
      totalBytes += blob.size;
      if(totalBytes > MAX_ARCHIVE_BYTES)
        throw new Error('Receipts exceed the 250 MB in-browser backup limit. No incomplete ZIP created.');
      const archivePath = `storage/${bucket}/${path}`;
      files.push({name:archivePath,body:blob});
      fileRecords.push({bucket,storage_path:path,archive_path:archivePath,bytes:blob.size,
        sha256:await sha256(blob),receipt_table:table,receipt_id:receipt.id});
    }
    report('Checking receipt records have not changed...');
    for(const source of RECEIPT_SOURCES) {
      const current = await readTable(supabase,source.table,'id');
      const signature = rows => JSON.stringify(rows.map(row=>[row.id,row.storage_path,row.file_size]));
      if(signature(current) !== signature(tables[source.table]))
        throw new Error('Receipt records changed during backup. Retry to get a consistent ZIP.');
    }
    // Winter statuses are mutable and audit events are append-only. Ensure the
    // winter history and closure snapshots didn't change while receipts were read.
    for(const table of ['Winter_Audit_History','Winter_Snapshots']) {
      const current = await readTable(supabase,table,'id');
      if(JSON.stringify(current)!==JSON.stringify(tables[table]))
        throw new Error(table+': records changed while assembling the backup. Retry for a consistent winter history.');
    }
    const {data:{user:stillUser},error:lastAuthError} = await supabase.auth.getUser();
    if(lastAuthError || stillUser?.id !== user.id)
      throw new Error('Sign-in changed during backup. No ZIP created.');
    const exportedAt = new Date().toISOString();
    const manifest = {
      format:'tricks-bees-207-records-and-receipts',version:3,exported_at:exportedAt,
      table_counts:Object.fromEntries(TABLES.map(([name])=>[name,tables[name].length])),
      receipt_count:fileRecords.length,receipt_bytes:totalBytes,receipt_files:fileRecords
    };
    const data = {format:'tricks-bees-207-apiary-backup',version:4,
      exported_at:exportedAt,tables};
    const readme = `TRICKS BEES 207 PRIVATE RECORDS & RECEIPTS BACKUP\n\nCreated: ${exportedAt}\n\napiary-data.json contains records from 25 public-schema tables, including winter preparation, all winter change history, versioned historical snapshots, recurring payment schedules and receipt metadata.\nmanifest.json maps ${fileRecords.length} receipt files to their Supabase paths with SHA-256 hashes.\nstorage/ contains the corresponding original receipt bytes.\n\nKEEP PRIVATE: This ZIP contains business records and receipts. Do not upload it to a public repository.\nThis is a best-effort snapshot, not a transactionally consistent database export.\nIt does not include auth accounts, MFA secrets, database schema, functions or RLS policies. Restoring recurring schedules and winter histories requires the destination schema and updated recovery importer. Winter audit records and historical snapshots are private and must be preserved with full integrity.\nThe live website does NOT offer an automatic restore from ZIP.\nTest recovery in an isolated project before touching production.\nLegacy backup ZIP versions 1 and 2 remain readable by the recovery verifier. A version 3 backup requires the Winter Readiness-aware recovery importer.\n`;
    report('Assembling the ZIP locally...');
    const zip = await makeZip([
      {name:'README.txt',body:readme},
      {name:'manifest.json',body:JSON.stringify(manifest,null,2)},
      {name:'apiary-data.json',body:JSON.stringify(data,null,2)},
      ...files
    ]);
    const url = URL.createObjectURL(zip);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tricks-bees-207-records-and-receipts-'+exportedAt.slice(0,10)+'.zip';
    document.body.append(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    const count = Object.values(tables).reduce((sum,rows)=>sum+rows.length,0);
    report(`ZIP download started: ${count} database records across ${TABLES.length} tables and ${fileRecords.length} receipt files. Keep the ZIP private. Restore is not enabled.`);
  } catch(error) {
    report('Complete backup stopped: '+(error?.message || String(error)));
  } finally {
    button.disabled = false;
  }
}
