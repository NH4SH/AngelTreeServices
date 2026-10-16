import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import {readFileSync}from'node:fs';
import * as drafts from '../src/lib/drafts/document-drafts.ts';
// Exercise the hook's persistence lifecycle with deterministic effects and
// storage. Real DOM restoration/keyboard/mobile checks run in the local app.
function editor({session='epoch-a',raw=null}={}) {
 const values=new Map(),events=new Map(),timers=new Map();let cursor=0,nextTimer=0,changed=false,currentSession=session,privacy=session?'verified':'checking';
 const slots=[],effects=[],queue=[];const form={data:new FormData(),addEventListener(){},removeEventListener(){}};
 for(const[k,v]of Object.entries({line_item_id:'10000000-0000-4000-8000-000000000001',line_item_name:'Work',line_item_description:'Draft wording',line_item_quantity:'1',line_item_unit_price:'125'}))form.data.set(k,v);
 const key=drafts.documentDraftKey('a','quote','record');if(raw)values.set(key,raw);
 const react={
  useRef(initial){const i=cursor++;slots[i]??={current:initial};return slots[i];},
  useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],v=>{const next=typeof v==='function'?v(slots[i]):v;if(!Object.is(slots[i],next)){slots[i]=next;changed=true;}}];},
  useEffect(fn,deps){const i=cursor++,old=effects[i];if(!old||!deps||deps.some((d,j)=>!Object.is(d,old.deps[j]))){effects[i]={deps,cleanup:old?.cleanup};queue.push(()=>{effects[i].cleanup?.();effects[i].cleanup=fn();});}},
 };react.useLayoutEffect=react.useEffect;
 const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 class TestFormData extends FormData{constructor(input){super();if(input?.data)for(const[k,v]of input.data)this.append(k,v);}}
 const module={exports:{}};const js=ts.transpileModule(readFileSync(new URL('../src/hooks/use-document-recovery.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const window={setTimeout:fn=>{const id=++nextTimer;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),addEventListener:(name,fn)=>{events.set(name,fn)},removeEventListener:name=>events.delete(name),confirm:()=>true};
 vm.runInNewContext(js,{module,exports:module.exports,require:name=>name==='react'?react:name.includes('browser-privacy')?{DRAFT_PRIVACY_EVENT:'privacy',draftSession:()=>currentSession,draftPrivacyState:()=>privacy}:drafts,FormData:TestFormData,window,localStorage:storage,queueMicrotask,JSON,Date});
 let options={userId:'a',kind:'quote',recordKey:'record',revision:'1',persistedIds:['10000000-0000-4000-8000-000000000001'],dirty:false,pending:false,changeToken:0,restore:()=>{}},result;
 function render(updates={}){Object.assign(options,updates);let count=0;do{changed=false;cursor=0;result=module.exports.useDocumentRecovery(options);result.formRef.current=form;while(queue.length)queue.shift()();assert.ok(++count<20,'Render settled');}while(changed);return result;}
 function tick(){const jobs=[...timers.values()];timers.clear();for(const fn of jobs)fn();render();}
 return{render,tick,form,values,key,get result(){return result;},privacy(value,state){currentSession=value;privacy=state??(value?'verified':'signedout');events.get('privacy')?.();render();}};
}
test('typing before identity verification is captured once verification completes',async()=>{
 const e=editor({session:null});assert.equal(e.render().blocked,true);e.render({dirty:true});e.tick();assert.equal(e.values.size,0);e.privacy('epoch-a');await Promise.resolve();e.render();assert.equal(e.result.blocked,false);assert.ok(e.values.has(e.key));
});
test('an unreviewed recovery copy blocks submission and is not overwritten by typing',()=>{
 const scope={userId:'a',kind:'quote',recordKey:'record',revision:'1'},f=new FormData();f.set('line_item_name','Recovered');f.set('line_item_description','Keep this wording');
 const raw=JSON.stringify(drafts.captureDocument(f,scope));const e=editor({raw});assert.equal(e.render().blocked,true);e.render({dirty:true,changeToken:1});e.tick();assert.equal(e.values.get(e.key),raw);e.result.discard();e.render();assert.equal(e.result.blocked,false);
});
test('pending requests do not replace the last copy with disabled/empty form fields; acknowledgement clears it',()=>{
 const e=editor();e.render({dirty:true});e.tick();const raw=e.values.get(e.key);assert.ok(raw);e.render({pending:true});e.form.data=new FormData();e.tick();assert.equal(e.values.get(e.key),raw);e.result.acknowledge();e.render({dirty:false,pending:false});e.tick();assert.equal(e.values.get(e.key),undefined);
});
test('logout invalidates an old editor even after the same account signs in again',()=>{
 const e=editor();e.render({dirty:true});e.tick();e.values.clear();e.privacy(null);e.privacy('epoch-b');e.render({dirty:true,changeToken:2});e.tick();assert.equal(e.result.blocked,true);assert.equal(e.values.size,0);
});
test('another tab cannot have its recovery copy silently overwritten or deleted by this editor',()=>{
 const e=editor();e.render({dirty:true});e.tick();const other=e.values.get(e.key).replace('Draft wording','Another tab wording');e.values.set(e.key,other);e.render({changeToken:1});e.tick();assert.equal(e.values.get(e.key),other);assert.match(e.result.message,/Another tab/);e.privacy('epoch-a');assert.match(e.result.message,/Another tab/);e.result.acknowledge();e.render();assert.equal(e.values.get(e.key),other);assert.ok(e.result.candidate);
});
test('a save started before the debounce captures the original submitted fields after React disables the form',()=>{
 const e=editor();e.render({dirty:true});const submitted=e.form.data;
 e.render({pending:true});e.form.data=new FormData();
 e.result.beforeSubmit('10000000-0000-4000-8000-000000000002',submitted);e.render();
 const result=drafts.readDocument(e.values.get(e.key),{userId:'a',kind:'quote',recordKey:'record'});
 assert.equal(result.lines[0].description,'Draft wording');assert.equal(result.attempted,true);assert.equal(result.requestId,'10000000-0000-4000-8000-000000000002');
});
