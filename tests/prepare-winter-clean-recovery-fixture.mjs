// Derive an EMPTY 19-table CI destination from the schema-only production fixture.
// Keep the two fictional auth.users for FK checks. No real user data is copied.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const input=fs.readFileSync('tests/winter-migration-fixture.sql','utf8');
const start=input.indexOf('INSERT INTO public."Hives" (id,hive_number,hive_name)');
assert(start>0,'Fixture test record marker missing');
const output=input.slice(0,start).trimEnd()+'\n';
assert(output.includes("INSERT INTO auth.users (id) VALUES"),'Synthetic auth users absent');
assert.equal(output.split('CREATE TABLE public.').length-1,19);
assert(!output.includes('INSERT INTO public."Hives"'),'Destination must be empty');
const file=process.argv[2];
assert(file,'Output pathname required');
fs.writeFileSync(file,output);
console.log('Prepared empty disposable recovery database schema and two fictional auth identities.');
