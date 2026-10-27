import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url), ts = require('typescript'), id = 'a0000000-0000-4000-8000-000000000001';
test('directory and creation reads stay separate, and incomplete catalogues never mount a creation form', async () => {
  if (process.execArgv.includes('--conditions=react-server')) {
    const child = spawnSync(process.execPath, ['--experimental-strip-types', '--test', fileURLToPath(import.meta.url)], { encoding: 'utf8' });
    assert.equal(child.status, 0, child.stdout + child.stderr); return;
  }
  const { renderToStaticMarkup } = await import('react-dom/server');
  for (const mode of ['browse','create','materials','categories']) {
    const creating=mode!=='browse';let mounted=0;const calls=[];
    const deps={
      './loading.css':{},
      'react/jsx-runtime':require('react/jsx-runtime'),
      'lucide-react':{FilePlus2:()=>null,Plus:()=>null,ShieldCheck:()=>null},
      'next/link':({href,children,...props})=>React.createElement('a',{href,...props},children),
      '@/components/change-order-forms':{ChangeOrderEditor:props=>{mounted++;assert.deepEqual(props.jobs,[]);assert.deepEqual(props.contacts,[]);assert.equal(props.creation.userId,id);return React.createElement('form',null,'Save draft')}},
      '@/components/list-pagination':{ListPagination:()=>null},
      '@/components/PlatformFrame':{PlatformFrame:({children})=>React.createElement('main',null,children)},
      '@/components/SetupRequired':{},
      '@/lib/auth/pageContext':{getAuthenticatedPlatformContext:async()=>({configured:true,user:{id,email:'synthetic@example.invalid'},roles:['owner']})},
      '@/lib/auth/roles':{hasAllowedRole:()=>true,platformRoleGroups:{financialReporting:['owner']}},
      '@/lib/data/change-order-loading':{
        changeOrderListSize:25,changeOrderPage:()=>45,
        getChangeOrdersPage:async page=>{assert.equal(creating,false);assert.equal(page,45);calls.push('list');return{data:[],count:1105,error:null}},
        getChangeOrderSummary:async()=>{assert.equal(creating,false);calls.push('summary');return{data:[1105,0,0,0],error:null}},
        getChangeOrderCreationSeed:async()=>{assert.equal(creating,true);calls.push('seed');return{data:undefined,error:null}},
      },
      '@/lib/data/materials':{getMaterialCatalogOptions:async()=>{assert.equal(creating,true);calls.push('materials');return{data:[],error:mode==='materials'?'Materials unavailable':null}}},
      '@/lib/data/reports':{getServiceCategories:async()=>{assert.equal(creating,true);calls.push('categories');return{data:[],error:mode==='categories'?'Categories unavailable':null}}},
    };
    const code=ts.transpileModule(readFileSync(new URL('../src/app/admin/change-orders/page.tsx',import.meta.url),'utf8'),{fileName:'page.tsx',compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,m={exports:{}};
    new Function('require','module','exports',code)(name=>{assert.ok(name in deps,name);return deps[name]},m,m.exports);
    const html=renderToStaticMarkup(await m.exports.default({searchParams:Promise.resolve(creating?{new:'1',jobId:id}:{page:'45'})}));
    assert.deepEqual(calls.sort(),creating?['categories','materials','seed']:['list','summary']);assert.equal(mounted,mode==='create'?1:0);
    if(mode==='materials'||mode==='categories'){assert.match(html,/Editor unavailable/);assert.doesNotMatch(html,/<form/)}
    if(!creating){assert.match(html,/1105/);assert.match(html,/No additions on this page/)}
  }
});
