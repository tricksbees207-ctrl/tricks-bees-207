// Enable native TOTP challenge/verify only in a disposable local Supabase config.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const path=process.argv[2];
assert(path&&/\/supabase\/config\.toml$/.test(path),'Refuse to modify anything except local Supabase config.toml');
let s=fs.readFileSync(path,'utf8');
const start=s.indexOf('[auth.mfa.totp]');
assert(start>=0,'Local Supabase TOTP section missing');
let end=s.indexOf('\n[',start+1);
if(end<0)end=s.length;
let section=s.slice(start,end);
for(const name of ['enroll_enabled','verify_enabled']){
 const regex=new RegExp('(^\\s*'+name+'\\s*=\\s*)false','m');
 assert(regex.test(section),'Expected disabled '+name+' in local config');
 section=section.replace(regex,'$1true');
}
s=s.slice(0,start)+section+s.slice(end);
fs.writeFileSync(path,s);
console.log('Enabled local-only Supabase GoTrue TOTP enroll and verify.');
