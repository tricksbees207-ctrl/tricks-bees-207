import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

const page=readFileSync('recovery-test.html','utf8');
const verifier=readFileSync('js/apiary-backup-verifier.js','utf8');
assert.match(page,/RECOVERY TEST PROJECT ONLY/);
assert.match(page,/xvthtxcinwbopoixaggv\.supabase\.co/);
assert.ok(!page.includes('mkypanucvttinkjggxzv'),'Never include production Supabase ID in test page');
assert.ok(!page.includes('sb_secret_'),'Never include privileged secrets in client page');
assert.match(page,/readVerifiedApiaryZip/);
assert.match(verifier,/export async function readVerifiedApiaryZip/);
assert.match(page,/RESTORE TEST/);
assert.match(page,/upsert:false/);
assert.match(page,/await hash\(data\)!==r\.sha256/);
assert.match(page,/recovery_test_import/);
assert.match(page,/p_apply:false/);
assert.match(page,/p_apply:true/);
const matches=[...page.matchAll(/<script[^>]*type="module"[^>]*>([\s\S]*?)<\/script>/gi)];
assert.equal(matches.length,1,'Expected exactly one module script');
const dir=mkdtempSync(join(tmpdir(),'apiary-recovery-test-'));
const file=join(dir,'recovery-test.mjs');
writeFileSync(file,matches[0][1]);
const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
assert.equal(result.status,0,'Module syntax invalid: '+result.stderr);
for(const id of ['loginForm','email','password','file','stats','preview','confirmation','restore','upload','recheck','log','signIn','signOut']){
  assert.ok(new RegExp('id="'+id+'"').test(page),'Missing expected HTML element '+id);
}
console.log('PASS: test-only project hardwired; safe login, verified ZIP, separate preview/restore and receipt checksum controls present');
