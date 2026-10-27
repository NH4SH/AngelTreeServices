import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {load} from './pr10-test-helpers.mjs';
const require=createRequire(import.meta.url),ts=require('typescript');
test('materials pages mount only the selected editor, retain paging context and hide incomplete workspace forms',async()=>{
  if(process.execArgv.includes('--conditions=react-server')){const r=spawnSync(process.execPath,['--test',fileURLToPath(import.meta.url)],{encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);return;}
  const React=require('react'),{renderToStaticMarkup}=await import('react-dom/server'),helpers=load('../src/lib/materials/workspace-view.ts');
  for(const mode of ['catalog','edit','foreign-edit','failure','overview','movements','reservations','purchases','disposal','production','deliveries']){
    const forms=[],calls=[],catalog=['catalog','edit','foreign-edit','failure'].includes(mode),query={view:catalog?'catalog':mode,q:'Literal & words',category:'hardware',page:'2',edit:mode==='edit'?'m0':mode==='foreign-edit'?'foreign':undefined};
    const data={materials:[{id:'m0',name:'Synthetic material',category:'hardware',default_unit:'each',stock_tracked:false}],locations:[],balances:[],transactions:[],reservations:[],purchases:[],disposalRecords:[],loads:[],deliveries:[],productionBatches:[],stockpileMeasurements:[],jobs:[],customers:[],organizations:[{id:'vendor',name:'Vendor'}],equipment:[],costs:[{material_id:'m0',internal_unit_cost_cents:125}],transactionCosts:[],canViewCosts:true,error:mode==='failure'?'Reload before making changes.':null,catalogCount:35,catalogCategories:['hardware','other']};
    const deps={'react/jsx-runtime':require('react/jsx-runtime'),'next/link':({children,...props})=>React.createElement('a',props,children),'lucide-react':new Proxy({},{get:()=>()=>null}),
      '@/components/AttachmentCheckLink':{AttachmentCheckLink:()=>null},'@/lib/business-time':{formatBusinessDateTime:()=>''},'@/lib/materials/definitions':{formatMaterialQuantity:String,materialLabel:String},'@/lib/materials/workspace-view':helpers,
      '@/components/PlatformFrame':{PlatformFrame:({children})=>React.createElement('main',null,children)},'@/components/SetupRequired':{},
      '@/components/materials-forms':new Proxy({},{get:(_,name)=>props=>{forms.push({name,...props});return React.createElement('form',null,String(name));}}),
      '@/components/list-pagination':{ListPagination:props=>{assert.equal(props.count,35);assert.equal(props.page,2);assert.equal(props.pageSize,25);assert.deepEqual(props.params,{view:'catalog',q:query.q,category:query.category});return React.createElement('nav',null,'Page 2 of 2');}},
      '@/lib/auth/pageContext':{getAuthenticatedPlatformContext:async()=>({configured:true,roles:['owner'],user:{id:'synthetic-user',email:'synthetic@example.invalid'}})},
      '@/lib/data/materials':{getMaterialsWorkspace:async(...args)=>{calls.push(args);return data;}}};
    const code=ts.transpileModule(readFileSync(new URL('../src/app/admin/materials/page.tsx',import.meta.url),'utf8'),{fileName:'page.tsx',compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,m={exports:{}};
    new Function('require','module','exports',code)(name=>{assert.ok(name in deps,name);return deps[name];},m,m.exports);
    const html=renderToStaticMarkup(await m.exports.default({searchParams:Promise.resolve(query)}));assert.deepEqual(calls,[[['owner'],query.view,query]]);
    if(mode==='failure'){assert.equal(forms.length,0);assert.match(html,/Materials unavailable/);assert.match(html,/Reload this view/);assert.doesNotMatch(html,/Stock not tracked|Internal cost|<form/);continue;}
    for(const form of forms.filter(x=>['MaterialCatalogForm','PurchaseForm','DeliveryForm'].includes(x.name)))assert.equal(form.userId,'synthetic-user');
    const editors=forms.filter(x=>x.name==='MaterialCatalogForm'&&x.material);assert.equal(editors.length,mode==='edit'?1:0);
    if(catalog){assert.match(html,/Page 2 of 2/);assert.match(html,/<option value="other">/);assert.equal(forms.filter(x=>x.name==='MaterialCatalogForm'&&!x.material).length,1);const href=new URL(html.match(/href="([^"]+#[^"]+)"/g).at(-1).slice(6,-1).replaceAll('&amp;','&'),'http://local');assert.equal(href.searchParams.get('q'),query.q);assert.equal(href.searchParams.get('category'),'hardware');assert.equal(href.searchParams.get('page'),'2');assert.equal(href.searchParams.get('edit'),mode==='edit'?null:'m0');if(mode==='edit'){assert.equal(editors[0].material.id,'m0');assert.equal(editors[0].internalCostCents,125);}}
  }
});
