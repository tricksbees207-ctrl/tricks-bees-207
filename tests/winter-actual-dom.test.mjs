import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const html = readFileSync('apiary-log.html','utf8');
const dom = new JSDOM(html,{url:'https://example.test/apiary-log.html',runScripts:'outside-only'});
const {window} = dom;
const scriptOpen=html.indexOf('<script>');
const scriptClose=html.indexOf('</script>',scriptOpen);
assert(scriptOpen>0 && scriptClose>scriptOpen,'Navigation inline script missing');
const navScript=html.slice(scriptOpen+'<script>'.length,scriptClose);
assert(navScript.includes('Hive sections'),'Hive navigation script missing');
window.eval(navScript);
window.document.dispatchEvent(new window.Event('DOMContentLoaded'));

const hiveNav=window.document.querySelector('[role="tablist"][aria-label="Hive sections"]');
assert(hiveNav, 'Missing hive navigation');
const buttons=[...hiveNav.querySelectorAll('[role="tab"]')];
const expected=['Inspection','Hive Profile','Colony History','Feedings','Treatments','Harvests','Queens','Splits','Losses','Winter'];
assert.deepEqual(buttons.map(b=>b.textContent),expected);
const winterPanel=window.document.getElementById('winterSection');
const winterFrame=window.document.getElementById('winterFrame');
assert(winterPanel && winterFrame, 'Winter pane and lazy iframe required');
assert.equal(winterFrame.hasAttribute('src'),false,'Do not load Winter before requested');
assert.equal(buttons[0].getAttribute('aria-selected'),'true');

buttons[9].click();
assert.equal(buttons[9].getAttribute('aria-selected'),'true');
assert.equal(buttons[0].getAttribute('aria-selected'),'false');
assert.equal(winterPanel.classList.contains('section-tab-hidden'),false,'Winter pane should become visible');
assert.equal(winterFrame.hasAttribute('src'),false,'No iframe load before hive is selected');
buttons[0].click();
assert.equal(winterPanel.classList.contains('section-tab-hidden'),true,'Leaving Winter hides panel');
assert.equal(buttons[0].getAttribute('aria-selected'),'true');

const mainNav=window.document.querySelector('[role="tablist"][aria-label="Apiary sections"]');
assert.equal(mainNav.querySelectorAll('[role="tab"]').length,8,'Keep eight main Apiary Log tabs');
console.log('PASS: real DOM renders exactly ten hive tabs, toggles Winter, lazy-loads iframe, preserves eight main tabs.');
window.close();
