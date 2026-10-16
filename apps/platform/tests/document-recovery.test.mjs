import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { captureDocument, readDocument, canRestoreDocument, documentDraftKey, DRAFT_TTL_MS, MAX_DRAFT_BYTES } from '../src/lib/drafts/document-drafts.ts';
import { safeReturnTo, withReturnTo } from '../src/lib/drafts/return-context.ts';
import { parseScopePresets } from '../src/lib/drafts/scope-presets.ts';
const scope = { userId: 'user-a', kind: 'quote', recordKey: 'record-a', revision: '7' };
const id = '10000000-0000-4000-8000-000000000001';
function form() {
 const f = new FormData();
 for(const [key,value] of Object.entries({contracting_party:'customer:local',customer_message:'Review work',debris_handling:'leave_wood',debris_handling_notes:'Stack by the marked area',line_item_id:id,line_item_name:'Pruning',line_item_description:'Review the marked limbs',line_item_quantity:'2',line_item_unit_price:'125',line_item_service_category_id:'local-category'})) f.set(key,value);
 return f;
}
const copy = () => captureDocument(form(),scope,'',false,1000000);
test('recovery round-trips proposed work, quantity and price without modifying the version',()=>{
 const original=copy(), recovered=readDocument(JSON.stringify(original),scope,1000100);
 assert.deepEqual(recovered,original);assert.equal(recovered.lines[0].quantity,'2');assert.equal(recovered.lines[0].unitPrice,'125');assert.equal(recovered.revision,'7');
});
test('explicit projection excludes credentials, confirmation, payment details and unexpected caller properties',()=>{
 const f=form(); for(const key of ['$ACTION_ID','password','token','stripe_secret','card_number','confirm_contracting_party_change','new_customer_email','new_customer_street'])f.set(key,'PRIVATE_SENTINEL');
 const result=captureDocument(f,{...scope,credentials:'PRIVATE_SENTINEL'});
 assert.ok(!JSON.stringify(result).includes('PRIVATE_SENTINEL')); assert.ok(!('credentials' in result));
});
test('walk-in customer recovery requires reselecting or re-entering the customer',()=>{
 const f=form();f.set('contracting_party','new_customer');f.set('new_customer_name','PRIVATE_SENTINEL');
 const result=captureDocument(f,{...scope,kind:'invoice'});assert.equal(result.fields.contracting_party,'');assert.ok(!JSON.stringify(result).includes('PRIVATE_SENTINEL'));
});
for(const [label,changes] of [['another user',{userId:'user-b'}],['another record',{recordKey:'record-b'}],['another document type',{kind:'invoice'}]])test(`cannot recover ${label}'s work`,()=>{
 assert.equal(readDocument(JSON.stringify(copy()),{...scope,...changes},1000000),null);
});
test('storage keys separate users, records, new-record contexts and kinds',()=>{
 const keys=[documentDraftKey('a','quote','b:c'),documentDraftKey('a:b','quote','c'),documentDraftKey('a','invoice','b:c'),documentDraftKey('a','quote','new:customer-a'),documentDraftKey('a','quote','new:customer-b')];assert.equal(new Set(keys).size,keys.length);
});
for(const [label,value] of [['corrupt JSON','{'],['oversize','x'.repeat(MAX_DRAFT_BYTES+1)],['unknown version',JSON.stringify({...copy(),version:2})],['empty lines',JSON.stringify({...copy(),lines:[]})],['oversize field',JSON.stringify({...copy(),fields:{customer_message:'x'.repeat(12001)}})],['too many lines',JSON.stringify({...copy(),lines:Array(301).fill(copy().lines[0])})]])test(`rejects ${label}`,()=>assert.equal(readDocument(value,scope,1000000),null));
test('expires after 24 hours and rejects future timestamps',()=>{
 assert.ok(readDocument(JSON.stringify(copy()),scope,1000000+DRAFT_TTL_MS));
 assert.equal(readDocument(JSON.stringify(copy()),scope,1000001+DRAFT_TTL_MS),null);
 assert.equal(readDocument(JSON.stringify({...copy(),savedAt:1060001}),scope,1000000),null);
});
test('rejects duplicate persisted IDs and invalid persisted identities',()=>{
 assert.equal(readDocument(JSON.stringify({...copy(),lines:[...copy().lines,...copy().lines]}),scope,1000000),null);
 assert.equal(readDocument(JSON.stringify({...copy(),lines:[{...copy().lines[0],persistedId:'foreign-not-uuid'}]}),scope,1000000),null);
});
test('stale or foreign-line recovery cannot rebase pricing onto the current record',()=>{
 assert.ok(canRestoreDocument(copy(),'7',[id]));assert.equal(canRestoreDocument(copy(),'8',[id]),false);assert.equal(canRestoreDocument(copy(),'7',[]),false);
});
test('new lines have no persisted ID, and recovery carries no reusable client line identity',()=>{
 const f=form();f.set('line_item_id','');f.set('line_item_client_id','duplicate-client-id');const result=captureDocument(f,scope);assert.equal(result.lines[0].persistedId,'');assert.ok(!JSON.stringify(result).includes('duplicate-client-id'));
});
test('uncertain saves retain a bounded idempotency identity and attempt marker',()=>{
 const result=captureDocument(form(),scope,id,true,1000000);assert.equal(readDocument(JSON.stringify(result),scope,1000000).requestId,id);assert.equal(result.attempted,true);
 assert.equal(readDocument(JSON.stringify({...result,requestId:'not-a-uuid'}),scope,1000000).requestId,'');
});
test('unknown stored properties are excluded when reading a copy',()=>{
 const result=readDocument(JSON.stringify({...copy(),secret:'PRIVATE_SENTINEL',fields:{...copy().fields,password:'PRIVATE_SENTINEL'},lines:[{...copy().lines[0],secret:'PRIVATE_SENTINEL'}]}),{...scope,secret:'PRIVATE_SENTINEL'},1000000);assert.ok(!JSON.stringify(result).includes('PRIVATE_SENTINEL'));
});
test('personal wording strips every price, quantity, ID and material reference',()=>{
 const input={id:'preset-a',label:'Pruning',kind:'scope',name:'Pruning',description:'Review the marked limbs',debrisHandling:'',unitPrice:'SECRET_PRICE',quantity:'SECRET_QTY',persistedId:'SECRET_LINE',materialId:'SECRET_MATERIAL',customerId:'SECRET_CUSTOMER'};
 const result=parseScopePresets(JSON.stringify([input]));assert.equal(result.length,1);assert.ok(!JSON.stringify(result).includes('SECRET_'));
});
test('wood and chips presets retain only explicit wording and supported arrangements',()=>{
 const input={id:'wood',label:'Wood plan',kind:'debris',name:'',description:'Leave in the marked area',debrisHandling:'leave_wood'};assert.deepEqual(parseScopePresets(JSON.stringify([input])),[input]);assert.deepEqual(parseScopePresets(JSON.stringify([{...input,debrisHandling:'invented'}])),[]);
});
test('wording library rejects malformed, duplicate and oversized entries',()=>{
 assert.deepEqual(parseScopePresets('bad'),[]);const item={id:'a',label:'Name',kind:'scope',name:'Work',description:'Wording',debrisHandling:''};
 for(const items of [[item,item],Array.from({length:41},(_,i)=>({...item,id:String(i)})),[{...item,label:''}],[{...item,description:'x'.repeat(6001)}]]) assert.deepEqual(parseScopePresets(JSON.stringify(items)),[]);
});
test('list return context preserves search, status, page and archived view only',()=>{
 assert.equal(safeReturnTo('/admin/invoices?q=Jane+Doe&status=void&page=3&archived=1&token=PRIVATE&new=1','/admin/invoices'),'/admin/invoices?q=Jane+Doe&status=void&page=3&archived=1');
 assert.equal(withReturnTo('/admin/quotes/abc/edit?saved=1','/admin/quotes?q=oak&page=2'),'/admin/quotes/abc/edit?saved=1&returnTo=%2Fadmin%2Fquotes%3Fq%3Doak%26page%3D2');
});
for(const unsafe of ['https://evil.invalid','//evil.invalid','/\\evil.invalid','javascript:alert(1)','/admin/quotes/../employees','/admin/%71uotes','/admin/quotes#token','/admin/quotes\n','/admin/quotes/'+id,'/login','/admin/quotes?'+ 'x'.repeat(1800)])test(`return context rejects ${JSON.stringify(unsafe).slice(0,70)}`,()=>assert.equal(safeReturnTo(unsafe),'/admin/quotes'));
test('invalid pagination and arbitrary query fields cannot propagate through an editor',()=>assert.equal(safeReturnTo('/admin/jobs?page=-2&archived=false&next=https%3A%2F%2Fevil.invalid&view=today'),'/admin/jobs?view=today'));
function privacyHarness(){
 const store={};const storage={getItem:key=>store[key]??null,setItem:(key,value)=>{store[key]=String(value)},removeItem:key=>{delete store[key]}};
 const proxy=new Proxy(storage,{ownKeys:()=>Object.keys(store),getOwnPropertyDescriptor:()=>({enumerable:true,configurable:true})});
 const module={exports:{}};const js=ts.transpileModule(readFileSync(new URL('../src/lib/drafts/browser-privacy.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(js,{module,exports:module.exports,require:()=>({DRAFT_PREFIX:'ats-document-draft-v1:'}),localStorage:proxy,crypto:{randomUUID:()=>crypto.randomUUID()},window:{dispatchEvent(){}},Event:class {}});return{privacy:module.exports,store};
}
test('logout clears every recovery copy while preserving unrelated preferences and saved wording',()=>{
 const {privacy,store}=privacyHarness();privacy.verifyDraftOwner('a');store['ats-document-draft-v1:a:quote:one']='draft';store['ats-document-draft-v1:b:invoice:two']='draft';store.other='keep';store['ats-personal-wording-v1:a']='wording';assert.ok(privacy.draftSession('a'));privacy.clearBrowserDrafts();assert.equal(privacy.draftSession('a'),null);assert.ok(!Object.keys(store).some(k=>k.startsWith('ats-document-draft-v1:')));assert.equal(store.other,'keep');assert.equal(store['ats-personal-wording-v1:a'],'wording');
});
test('user switch erases the previous draft and invalidates writers; transient auth failure suspends without data loss',()=>{
 const {privacy,store}=privacyHarness();privacy.verifyDraftOwner('a');const epoch=privacy.draftSession('a');store['ats-document-draft-v1:a:quote:one']='draft';privacy.suspendBrowserDrafts();assert.equal(privacy.draftSession('a'),null);assert.equal(store['ats-document-draft-v1:a:quote:one'],'draft');privacy.verifyDraftOwner('a');assert.equal(privacy.draftSession('a'),epoch);privacy.verifyDraftOwner('b');assert.equal(privacy.draftSession('a'),null);assert.notEqual(privacy.draftSession('b'),epoch);assert.equal(store['ats-document-draft-v1:a:quote:one'],undefined);
});
function loadRoute(client) {
 const source=ts.transpileModule(readFileSync(new URL('../src/app/api/internal/draft-session/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};vm.runInNewContext(source,{module,exports:module.exports,Response,require:()=>({createClient:async()=>client})});return module.exports.GET;
}
for(const [name,client,status] of [
 ['unconfigured',null,503],
 ['missing session',{auth:{getUser:async()=>({data:{user:null},error:{name:'AuthSessionMissingError'}})}},401],
 ['transient auth outage',{auth:{getUser:async()=>({data:{user:null},error:{name:'AuthRetryableFetchError'}})}},503],
 ['transient access outage',{auth:{getUser:async()=>({data:{user:{id:'own'}}})},rpc:async()=>({error:{message:'PRIVATE diagnostic'}})},503],
 ['withdrawn access',{auth:{getUser:async()=>({data:{user:{id:'own'}}})},rpc:async()=>({data:false})},403],
 ['active session',{auth:{getUser:async()=>({data:{user:{id:'own',email:'PRIVATE email'}}})},rpc:async()=>({data:true})},200],
]) test(`recovery session endpoint handles ${name} without caching or exposing diagnostics`,async()=>{
 const response=await loadRoute(client)();assert.equal(response.status,status);assert.match(response.headers.get('cache-control'),/private.*no-store/);const payload=await response.json();assert.deepEqual(payload,{userId:status===200?'own':null});
});
test('invoice recovery uses the actual invoice editor field names and preserves every line',()=>{
 const f=new FormData();for(const[k,v]of form())f.append(k.startsWith('line_item_')?`invoice_${k}`:k,v);
 const invoiceScope={...scope,kind:'invoice',revision:'2026-10-16T15:00:00Z'};
 const result=captureDocument(f,invoiceScope);assert.equal(result.lines.length,1);assert.equal(result.lines[0].persistedId,id);assert.equal(result.lines[0].description,'Review the marked limbs');assert.equal(result.lines[0].unitPrice,'125');assert.deepEqual(readDocument(JSON.stringify(result),invoiceScope),result);
});
