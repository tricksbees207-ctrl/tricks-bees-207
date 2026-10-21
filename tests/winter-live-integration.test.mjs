import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const parent = fs.readFileSync('apiary-log.html', 'utf8');
const child = fs.readFileSync('winter-readiness.html', 'utf8');
const backup = fs.readFileSync('js/apiary-complete-backup-v3.js', 'utf8');
const verifier = fs.readFileSync('js/apiary-backup-verifier-v3.js', 'utf8');

const productionProject = 'mkypanucvttinkjggxzv.supabase.co';
const recoveryProject = 'xvthtxcinwbopoixaggv.supabase.co';

for (const [name, source] of [['Apiary Log', parent], ['Winter', child]]) {
  assert(source.includes(productionProject), name + ' must use the production project in this staging branch');
  assert(!source.includes(recoveryProject), name + ' must never point to the online Recovery Test');
}
assert.equal(parent.split("['Winter',winterPanel]").length - 1, 1);
assert(parent.includes('grid-template-columns:repeat(5,minmax(0,1fr))'));
assert.match(parent, /hive-section-selected/);
assert(parent.includes('winter-readiness.html?embedded=1&hive='));

const route = child.slice(child.indexOf('const route='), child.indexOf('if(embedded){'));
for (const [search, allowed] of [
  ['', true], ['?hive=12', true], ['?hive=13', false],
  ['?hive=0', false], ['?hive=-1', false], ['?hive=12x', false],
  ['?hive=', false]
]) {
  const context = {URLSearchParams, location: {search}};
  vm.createContext(context);
  assert.equal(vm.runInContext(route + 'belongsToHive({hive_id:12})', context), allowed, search);
}

const attrs = new Map();
const frame = {
  dataset: {}, hidden: true,
  removeAttribute: k => attrs.delete(k),
  hasAttribute: k => attrs.has(k),
  set src(v) { attrs.set('src', v); }
};
const start = parent.indexOf('    function syncWinterFrame(){');
const end = parent.indexOf("    document.addEventListener('hive-section-selected'", start);
assert(start > 0 && end > start, 'Winter frame controller must exist');
const context = {$: () => frame, selectedHiveId: 12, winterActive: false};
vm.createContext(context);
vm.runInContext(parent.slice(start, end), context);
vm.runInContext('syncWinterFrame()', context);
assert.equal(attrs.has('src'), false, 'Winter frame should load lazily');
context.winterActive = true;
vm.runInContext('syncWinterFrame()', context);
assert.equal(attrs.get('src'), 'winter-readiness.html?embedded=1&hive=12');
context.winterActive = false;
vm.runInContext('syncWinterFrame()', context);
assert.equal(attrs.has('src'), true, 'Leaving Winter should preserve selected hive until switch');
context.selectedHiveId = 13;
vm.runInContext('syncWinterFrame()', context);
assert.equal(attrs.has('src'), false, 'Switching hives must unload the old frame');
context.winterActive = true;
vm.runInContext('syncWinterFrame()', context);
assert.equal(attrs.get('src'), 'winter-readiness.html?embedded=1&hive=13');
context.selectedHiveId = null;
vm.runInContext('syncWinterFrame()', context);
assert.equal(attrs.has('src'), false, 'Sign-out must unload the frame');

for (const table of [
  'Winter_Seasons', 'Winter_Participation', 'Winter_Checklist_Items',
  'Winter_Observations', 'Winter_Outcomes', 'Winter_Audit_History', 'Winter_Snapshots'
]) {
  assert(backup.includes("'" + table + "'"), 'Backup missing ' + table);
  assert(verifier.includes("'" + table + "'"), 'Verifier missing ' + table);
}
assert(parent.includes('apiary-complete-backup-v3.js'));
assert(parent.includes('apiary-backup-verifier-v3.js'));
assert(child.includes('apiary-complete-backup-v3.js'));
assert(!parent.includes('apiary-log-winter-test.html'));
assert(!child.includes('apiary-complete-backup-v3-test.js'));

const migration = fs.readFileSync('database/migrations/20261021_winter_readiness_production_schema.sql', 'utf8');
assert.equal(migration.split('CREATE TABLE public."Winter_').length - 1, 7, 'Seven Winter tables required');
assert.equal((migration.match(/CREATE POLICY /g) || []).length, 15, 'Winter RLS policies required');
assert.equal((migration.match(/CREATE TRIGGER /g) || []).length, 12, 'History, guard and snapshot triggers required');
assert(migration.includes('Winter schema already partially or fully installed'), 'Fail-closed migration guard required');
assert(migration.includes('GRANT SELECT ON TABLE public."Winter_Snapshots" TO authenticated;'), 'Snapshots must be read-only');
assert(migration.includes('GRANT SELECT ON TABLE public."Winter_Audit_History" TO authenticated;'), 'Audit history must be read-only');
assert(!migration.includes('CREATE OR REPLACE FUNCTION public.recovery_test_import'), 'Test-only importer must not be installed in production');

console.log('PASS: production-only wiring, ten-tab layout, hive scoping, frame lifecycle and seven Winter backup tables and schema safeguards.');
