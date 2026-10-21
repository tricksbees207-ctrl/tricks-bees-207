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
assert.equal((parent.match(/\\['Winter',winterPanel\\]/g) || []).length, 1);
assert.match(parent, /grid-template-columns:repeat\\(5,minmax\\(0,1fr\\)\\)/);
assert.match(parent, /hive-section-selected/);
assert.match(parent, /winter-readiness\\.html\\?embedded=1&hive=/);

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
assert.match(parent, /apiary-complete-backup-v3\\.js/);
assert.match(parent, /apiary-backup-verifier-v3\\.js/);
assert.match(child, /apiary-complete-backup-v3\\.js/);
assert(!parent.includes('apiary-log-winter-test.html'));
assert(!child.includes('apiary-complete-backup-v3-test.js'));

console.log('PASS: production-only wiring, ten-tab layout, hive scoping, frame lifecycle and seven Winter backup tables.');
