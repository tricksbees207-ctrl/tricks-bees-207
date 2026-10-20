// TEST ONLY. Uses the caller's authenticated Recovery Test client.
// Creates unique temporary receipt copies; never replaces existing files.
export async function sha256(bytes) {
  const hash=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
}

export async function verifyReceiptRecovery({client,archive,userId,onProgress=()=>{},runId=crypto.randomUUID()}) {
  if(!/^[0-9a-f-]{36}$/i.test(userId)||!/^[0-9a-f-]{36}$/i.test(runId))throw new Error('Invalid test identifier.');
  if(archive.manifest.version!==3)throw new Error('Choose a verified Winter Readiness ZIP.');
  const receipts=archive.manifest.receipt_files;
  if(!Array.isArray(receipts)||!receipts.length)throw new Error('The ZIP has no receipt files to test.');
  const pending=new Map();
  const report={run_id:runId,started_at:new Date().toISOString(),passed:false,expected_receipts:receipts.length,
    uploaded:0,downloaded_and_matched:0,temporary_files_removed:0,files:[],cleanup_pending:[],errors:[]};
  const requireOkay=(r,label)=>{if(r.error)throw new Error(label+': '+r.error.message);return r.data;};
  const removeCreated=async item=>{
    requireOkay(await client.storage.from(item.bucket).remove([item.path]),'Temporary-file cleanup');
    const names=requireOkay(await client.storage.from(item.bucket).list(item.folder,{search:item.name,limit:100}),'Check temporary-file cleanup');
    if(names.some(x=>x.name===item.name))throw new Error('Temporary receipt still exists after cleanup.');
    pending.delete(item.bucket+'/'+item.path);report.temporary_files_removed++;
  };
  try {
    for(let i=0;i<receipts.length;i++) {
      const receipt=receipts[i];
      const allowed={ 'apiary-receipts':'Apiary_Expense_Receipts','apiary-income-receipts':'Apiary_Income_Receipts' };
      if(allowed[receipt.bucket]!==receipt.receipt_table)throw new Error('Unexpected receipt bucket or table.');
      const parts=receipt.storage_path.split('/');
      if(parts.length!==3||!/^\d+$/.test(parts[1])||!/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(parts[2]))throw new Error('Invalid archived receipt path.');
      const metadata=archive.data.tables[receipt.receipt_table].find(x=>String(x.id)===String(receipt.receipt_id));
      const bytes=archive.entries.get(receipt.archive_path);
      if(!metadata||!bytes||metadata.storage_path!==receipt.storage_path)throw new Error('Receipt metadata is incomplete.');
      if(await sha256(bytes)!==receipt.sha256||bytes.byteLength!==receipt.bytes)throw new Error('Receipt integrity changed before upload.');
      const folder=userId+'/'+parts[1],name='restorecheck-'+runId+'-'+parts[2],path=folder+'/'+name;
      const item={bucket:receipt.bucket,folder,name,path};
      const existing=requireOkay(await client.storage.from(item.bucket).list(folder,{search:name,limit:100}),'Check temporary path');
      if(existing.some(x=>x.name===name))throw new Error('Temporary filename already exists; no file was replaced.');
      onProgress('Recovering receipt '+(i+1)+' of '+receipts.length+'...');
      const upload=await client.storage.from(item.bucket).upload(path,new Blob([bytes],{type:metadata.mime_type}),{
        upsert:false,cacheControl:'0',contentType:metadata.mime_type
      });
      if(upload.error){
        // A lost response can leave an uploaded file. Record the candidate for
        // inspection; never delete a file unless this run confirmed its creation.
        report.cleanup_pending.push({...item,creation_unconfirmed:true});
        throw new Error('Receipt upload: '+upload.error.message);
      }
      pending.set(item.bucket+'/'+path,item);report.uploaded++;
      if(upload.data?.path!==path)throw new Error('Unexpected upload path; inspect the test result.');
      const blob=requireOkay(await client.storage.from(item.bucket).download(path),'Read recovered receipt');
      if(!blob||blob.size!==receipt.bytes||await sha256(await blob.arrayBuffer())!==receipt.sha256)throw new Error('Recovered receipt checksum does not match the ZIP.');
      report.downloaded_and_matched++;
      report.files.push({bucket:item.bucket,receipt_id:receipt.receipt_id,bytes:receipt.bytes,sha256:receipt.sha256,matched:true});
      await removeCreated(item);
    }
  } catch(error) { report.errors.push(error?.message||String(error)); }
  finally {
    for(const item of [...pending.values()]) {
      try {await removeCreated(item);} catch(error) {report.errors.push(error?.message||String(error));}
    }
    report.cleanup_pending.push(...pending.values());
    report.passed=report.errors.length===0&&report.downloaded_and_matched===receipts.length&&report.temporary_files_removed===receipts.length&&report.cleanup_pending.length===0;
    report.completed_at=new Date().toISOString();
  }
  return report;
}
