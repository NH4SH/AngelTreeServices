import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import * as parties from '../src/lib/contracting-parties.ts';
import * as context from '../src/lib/drafts/return-context.ts';
import {captureDocument,readDocument} from '../src/lib/drafts/document-drafts.ts';
// Exercise the actual editor submission/restore callbacks with persistent hook
// slots. This is not a visual browser or full React scheduling test.
function editor(options={}){
 const slots=[],submissions=[],before=[],navigations=[];let index=0,callback,recoveryOptions,acknowledged=0,result={status:'error',message:'Uncertain'};
 const recovery={blocked:false,requestId:{current:''},beforeSubmit:(id,form)=>{
  before.push({id,form});recovery.requestId.current=id;
 },acknowledge:()=>acknowledged++,changed(){}};
 const react={useRef(initial){const n=index++;return slots[n]??=( {current:initial} );},useState(initial){
  const n=index++;if(!(n in slots))slots[n]=typeof initial==='function'?initial():initial;return[slots[n],v=>slots[n]=typeof v==='function'?v(slots[n]):v];
 },useMemo:f=>f(),useEffect(){}};
 const deps={react,'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'Fragment'},
  '@/lib/business-time':{},'@/hooks/use-reliable-action-state':{useReliableActionState:fn=>{callback=fn;return[{status:'idle',message:''},()=>{},false];}},
  'next/link':{default:'Link'},'next/navigation':{useRouter:()=>({push:p=>navigations.push(p)})},
  '@/hooks/use-document-recovery':{useDocumentRecovery:o=>{recoveryOptions=o;return recovery;}},
  '@/components/document-recovery-panel':{},'@/components/saved-scope-wording':{},'@/lib/drafts/document-drafts':{},'@/lib/drafts/return-context':context,
  'lucide-react':{},'./actions':{createQuote:async(previous,form)=>{submissions.push(form);return result;},updateQuote:async(previous,form)=>{submissions.push(form);return result;}},
  '@/lib/contracting-parties':parties};
 const source=ts.transpileModule(readFileSync(new URL('../src/app/admin/quotes/QuoteForm.tsx',import.meta.url),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const m={exports:{}};new Function('require','module','exports',source)(name=>{assert.ok(name in deps,name);return deps[name];},m,m.exports);
 const props={userId:'local-user',customers:[],estimateScheduleEvents:[],jobs:[],materials:[],organizations:[],organizationContacts:[],serviceCategories:[],serviceLocations:[],
  ...(options.editing?{quote:{id:'a0000000-0000-4000-8000-000000000010',customer_id:'a0000000-0000-4000-8000-000000000011',organization_id:null,edit_revision:5,quote_line_items:[]}}:{})};
 function render(){index=0;return m.exports.AddQuoteForm(props);}
 render();
 return{before,submissions,navigations,recovery,render,get acknowledged(){return acknowledged;},setResult:v=>result=v,
  restore:copy=>{recoveryOptions.restore(copy);render();},submit:async()=>{const f=new FormData();f.set('line_item_name','Synthetic scope');return callback({status:'idle',message:''},f);}};
}
test('uncertain creation retries preserve one ID and keep recovery',async()=>{
 const e=editor();await e.submit();const id=e.submissions[0].get('request_id');assert.match(id,/^[a-f0-9-]{36}$/i);
 e.render();await e.submit();assert.equal(e.submissions[1].get('request_id'),id);assert.equal(e.before[1].id,id);assert.equal(e.acknowledged,0);assert.deepEqual(e.navigations,[]);
});
test('restoring a submitted quote preserves its request after a browser reload',async()=>{
 const first=editor();await first.submit();const id=first.before[0].id,scope={userId:'local-user',kind:'quote',recordKey:'new::',revision:'new'};
 const copy=readDocument(JSON.stringify(captureDocument(first.before[0].form,scope,id,true)),scope);assert.ok(copy);
 const second=editor();second.restore(copy);await second.submit();assert.equal(second.submissions[0].get('request_id'),id);assert.equal(second.acknowledged,0);
});
test('only an initial confirmed success acknowledges and navigates',async()=>{
 const e=editor();e.setResult({status:'success',message:'Saved',navigateTo:'/admin/quotes/local'});await e.submit();assert.equal(e.acknowledged,1);assert.deepEqual(e.navigations,['/admin/quotes/local']);
});
test('a recovered existing quote keeps the copy and offers review without navigation',async()=>{
 const e=editor();e.setResult({status:'error',message:'Review saved quote',existingQuoteId:'a0000000-0000-4000-8000-000000000001'});await e.submit();
 assert.equal(e.acknowledged,0);assert.deepEqual(e.navigations,[]);
});
test('unreviewed recovery blocks creation before request preparation',async()=>{
 const e=editor();e.recovery.blocked=true;assert.equal((await e.submit()).status,'error');assert.equal(e.submissions.length,0);assert.equal(e.before.length,0);
});
test('existing edits retain their revision-based flow',async()=>{
 const e=editor({editing:true});await e.submit();assert.equal(e.submissions[0].get('request_id'),null);assert.equal(e.before[0].id,'');
});
