import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const parent=fs.readFileSync('apiary-log-winter-test.html','utf8');
const child=fs.readFileSync('winter-readiness-test.html','utf8');
const route=child.slice(child.indexOf('const route='),child.indexOf('if(embedded){'));
for(const [search,expected] of [['',true],['?hive=12',true],['?hive=13',false],['?hive=0',false],['?hive=-1',false],['?hive=12x',false],['?hive=',false]]){
 const ctx={URLSearchParams,location:{search}};
 vm.createContext(ctx);
 assert.equal(vm.runInContext(route+'belongsToHive({hive_id:12})',ctx),expected,search);
}
const attrs=new Map();const frame={dataset:{},hidden:true,removeAttribute:k=>attrs.delete(k),hasAttribute:k=>attrs.has(k),set src(v){attrs.set('src',v)}};
const start=parent.indexOf('    function syncWinterFrame(){');
const end=parent.indexOf("    document.addEventListener('hive-section-selected'",start);
const ctx={$:()=>frame,selectedHiveId:12,winterActive:false};vm.createContext(ctx);
vm.runInContext(parent.slice(start,end),ctx);
vm.runInContext('syncWinterFrame()',ctx);assert.equal(attrs.has('src'),false);
ctx.winterActive=true;vm.runInContext('syncWinterFrame()',ctx);assert.equal(attrs.get('src'),'winter-readiness-test.html?embedded=1&hive=12');
ctx.winterActive=false;vm.runInContext('syncWinterFrame()',ctx);assert.equal(attrs.has('src'),true,'tab switch preserves frame');
ctx.selectedHiveId=13;vm.runInContext('syncWinterFrame()',ctx);assert.equal(attrs.has('src'),false,'hive switch clears old frame');assert.equal(frame.hidden,true);
ctx.winterActive=true;vm.runInContext('syncWinterFrame()',ctx);assert.equal(attrs.get('src'),'winter-readiness-test.html?embedded=1&hive=13');
ctx.selectedHiveId=null;vm.runInContext('syncWinterFrame()',ctx);assert.equal(attrs.has('src'),false,'sign-out clears frame');
assert(!parent.includes('mkypanucvttinkjggxzv'));assert(!child.includes('mkypanucvttinkjggxzv'));
assert.equal((parent.match(/\['Winter',winterPanel\]/g)||[]).length,1);
console.log('PASS: route validation, cross-hive filtering, lazy loading, tab preservation, hive switching, sign-out cleanup, TEST isolation.');
