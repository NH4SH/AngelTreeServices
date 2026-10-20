const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(require('node:path').join(__dirname, '../ats-consent.js'), 'utf8');
const key = 'ats-analytics-choice-v1';
const lifetime = 180 * 86400000;
function harness({enabled = true, storage = new Map(), blocked = false, writesBlocked = false, removalsBlocked = false, now = 2000000} = {}) {
  const calls = [], windowEvents = {}, documentEvents = {}, timers = new Map();
  let time = now, id = 0, active;
  function element() { return { hidden: true, attrs: {}, listeners: {}, disabled: false, textContent: '',
    setAttribute(k,v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; }, focus() { active = this; },
    addEventListener(k,fn) { this.listeners[k] = fn; }, click() { if (!this.disabled) { active = this; this.listeners.click?.(); } } }; }
  const ids = Object.fromEntries(['ats-consent','ats-consent-allow','ats-consent-reject','ats-consent-status','ats-consent-title','ats-consent-description','ats-consent-close','ats-consent-feedback','ats-consent-feedback-text','ats-consent-feedback-dismiss','main-content'].map(k=>[k,element()]));
  ids['ats-consent'].contains = node => Object.entries(ids).some(([k,v])=>v===node && !['main-content','ats-consent-feedback','ats-consent-feedback-text','ats-consent-feedback-dismiss'].includes(k));
  ids['ats-consent-feedback'].contains = node => node===ids['ats-consent-feedback-dismiss'];
  const trigger = element();
  const document = {get activeElement() { return active; },hidden: false, getElementById: k=>ids[k], querySelectorAll: ()=>[trigger], addEventListener: (k,fn)=>documentEvents[k]=fn};
  const window = {ATSWebsite:{isCollectionEnabled:()=>enabled,setConsent:v=>calls.push(v)},
    localStorage:{getItem:k=>{if(blocked)throw Error('blocked');return storage.get(k);},setItem:(k,v)=>{if(blocked || writesBlocked)throw Error('blocked');storage.set(k,v);},removeItem:k=>{if(blocked || removalsBlocked)throw Error('blocked');storage.delete(k);}},
    setTimeout(fn,ms) { timers.set(++id,{fn,ms}); return id; }, clearTimeout(id){timers.delete(id);},
    addEventListener:(k,fn)=>windowEvents[k]=fn};
  vm.runInNewContext(source,{window,document,Date:class extends Date{static now(){return time;}},Number,JSON,Math});
  return {ids,trigger,storage,calls,windowEvents,documentEvents,timers,advance:ms=>time+=ms,active:()=>active};
}
function stored(value,at=2000000) { return JSON.stringify({version:1,value,at}); }
test('fresh visitor is denied, receives equal choices, and has no saved preference',()=>{
  const h=harness(); assert.equal(h.calls.at(-1),'denied'); assert.equal(h.ids['ats-consent'].hidden,false); assert.equal(h.storage.size,0);
  h.ids['ats-consent-allow'].click(); assert.equal(h.calls.at(-1),'granted'); assert.deepEqual(JSON.parse(h.storage.get(key)),{version:1,value:'granted',at:2000000}); assert.equal(h.ids['ats-consent'].hidden,true);
  h.ids['ats-consent-reject'].click(); assert.equal(h.calls.at(-1),'denied'); assert.equal(JSON.parse(h.storage.get(key)).value,'denied'); assert.equal(h.ids['ats-consent'].hidden,true);
});
test('shipping gates hide initial prompt and cannot bank or restore an opt-in',()=>{
  const storage=new Map([[key,stored('granted')]]); const h=harness({enabled:false,storage});
  assert.equal(h.calls.at(-1),'denied'); assert.equal(storage.has(key),false); assert.equal(h.ids['ats-consent'].hidden,true); assert.equal(h.ids['ats-consent-allow'].disabled,true);
  h.trigger.click(); h.ids['ats-consent-allow'].click(); assert.equal(storage.size,0); assert.equal(h.calls.includes('granted'),false);
  h.ids['ats-consent-reject'].click(); assert.equal(JSON.parse(storage.get(key)).value,'denied');
});
test('unexpired choices restore across documents and do not extend their lifetime',()=>{
  for(const value of ['granted','denied']) { const storage=new Map([[key,stored(value)]]); const h=harness({storage,now:2000001});
    assert.equal(h.calls.at(-1),value); assert.equal(h.ids['ats-consent'].hidden,true); assert.equal(JSON.parse(storage.get(key)).at,2000000); }
});
test('expired, future, malformed, foreign-version and arbitrary consent values fail denied',()=>{
  for(const bad of [stored('granted',2000000-lifetime),stored('granted',2000001),'{bad',JSON.stringify({version:2,value:'granted',at:2000000}),stored('yes')]) {
    const h=harness({storage:new Map([[key,bad]])}); assert.equal(h.calls.at(-1),'denied'); assert.equal(h.storage.size,0); }
});
test('expiry is enforced on timer and page resume; other browser storage survives',()=>{
  const storage=new Map([[key,stored('granted')],['estimate-draft','synthetic draft'],['auth','synthetic unrelated']]); const h=harness({storage});
  h.advance(lifetime); [...h.timers.values()][0].fn(); assert.equal(h.calls.at(-1),'denied'); assert.equal(storage.has(key),false); assert.equal(storage.size,2); assert.equal(h.ids['ats-consent'].hidden,false);
  const resumed=harness({storage:new Map([[key,stored('granted')]])}); resumed.advance(lifetime); resumed.windowEvents.pageshow(); assert.equal(resumed.calls.at(-1),'denied');
});
test('storage denial falls back to this page and explains persistence limit',()=>{
  const h=harness({blocked:true}); h.ids['ats-consent-allow'].click(); assert.equal(h.calls.at(-1),'granted'); assert.match(h.ids['ats-consent-status'].textContent,/only to this page/);
  h.windowEvents.focus(); assert.equal(h.calls.at(-1),'granted'); h.ids['ats-consent-reject'].click(); assert.equal(h.calls.at(-1),'denied'); assert.equal(h.storage.size,0);
});
test('other tabs withdrawal or storage removal stops collection in the active page',()=>{
  const storage=new Map([[key,stored('granted')]]); const h=harness({storage}); h.trigger.click(); h.ids['ats-consent-allow'].click(); storage.set(key,stored('denied')); h.windowEvents.storage({key}); assert.equal(h.calls.at(-1),'denied'); assert.equal(h.ids['ats-consent-feedback-text'].textContent,'');
  storage.delete(key); h.windowEvents.storage({key:null}); assert.equal(h.calls.at(-1),'denied'); assert.equal(h.ids['ats-consent'].hidden,false);
});
test('settings disclosure, Escape and close restore keyboard focus',()=>{
  const h=harness({enabled:false}); h.trigger.click(); assert.equal(h.ids['ats-consent'].hidden,false); assert.equal(h.active(),h.ids['ats-consent-reject']); assert.equal(h.trigger.attrs['aria-expanded'],'true');
  let prevented=false; h.ids['ats-consent'].listeners.keydown({key:'Escape',preventDefault(){prevented=true;}}); assert.equal(prevented,true); assert.equal(h.ids['ats-consent'].hidden,true); assert.equal(h.active(),h.trigger); assert.equal(h.trigger.attrs['aria-expanded'],'false');
  h.trigger.click(); h.ids['ats-consent-close'].click(); assert.equal(h.active(),h.trigger);
});


test('a readable but unwritable saved opt-in cannot restore collection',()=>{
  const storage=new Map([[key,stored('granted')]]);
  const h=harness({storage,writesBlocked:true,removalsBlocked:true});
  assert.equal(h.calls.at(-1),'denied');
  assert.equal(h.ids['ats-consent'].hidden,false);
  h.ids['ats-consent-reject'].click();
  assert.equal(h.calls.at(-1),'denied');
  assert.match(h.ids['ats-consent-status'].textContent,/only to this page/);
  const next=harness({storage,writesBlocked:true,removalsBlocked:true});
  assert.equal(next.calls.at(-1),'denied');
});

test('accept and reject close immediately, preserve focus and allow later withdrawal',()=>{
  const h=harness();
  h.ids['ats-consent-allow'].click();
  assert.equal(h.ids['ats-consent'].hidden,true);
  assert.equal(h.trigger.attrs['aria-expanded'],'false');
  assert.equal(h.active(),h.ids['main-content']);
  assert.match(h.ids['ats-consent-feedback-text'].textContent,/accepted/);
  h.windowEvents.focus(); assert.equal(h.ids['ats-consent'].hidden,true);
  h.trigger.click(); assert.equal(h.ids['ats-consent'].hidden,false);
  h.ids['ats-consent-reject'].click();
  assert.equal(h.calls.at(-1),'denied'); assert.equal(h.ids['ats-consent'].hidden,true);
  assert.equal(h.active(),h.trigger); assert.match(h.ids['ats-consent-feedback-text'].textContent,/rejected/);
  const next=harness({storage:h.storage}); assert.equal(next.ids['ats-consent'].hidden,true); assert.equal(next.calls.at(-1),'denied');
});
test('page-only choices close the banner and visibly explain the unsaved preference',()=>{
  for(const button of ['ats-consent-allow','ats-consent-reject']) {
    const h=harness({blocked:true}); h.ids[button].click();
    assert.equal(h.ids['ats-consent'].hidden,true);
    assert.equal(h.ids['ats-consent-feedback'].attrs['data-warning'],'');
    assert.equal(h.ids['ats-consent-feedback-dismiss'].hidden,false);
    assert.match(h.ids['ats-consent-feedback-text'].textContent,/only to this page/);
    h.windowEvents.focus(); assert.equal(h.ids['ats-consent'].hidden,true);
    h.ids['ats-consent-feedback-dismiss'].click();
    assert.equal(h.ids['ats-consent-feedback'].attrs['data-warning'],undefined);
    assert.equal(h.active(),h.ids['main-content']);
  }
});

test('reopening the compact notice focuses the current visible choice',()=>{
  for(const value of ['granted','denied']) {
    const h=harness({storage:new Map([[key,stored(value)]])});
    h.trigger.click();
    assert.equal(h.ids['ats-consent'].hidden,false);
    assert.equal(h.active(),h.ids[value==='granted'?'ats-consent-allow':'ats-consent-reject']);
  }
});
