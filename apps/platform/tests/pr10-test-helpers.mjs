import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
export function load(file,deps={}){
 const js=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m={exports:{}};new Function('require','module','exports',js)(name=>{assert.ok(name in deps,`Unexpected import ${name}`);return deps[name];},m,m.exports);return m.exports;
}
export function memoryDB(tables,options={}){
 const calls=[];let claims=0;
 const db={calls,from(table){
  let filters=[],operation='read',values,cap=Infinity,sort,single=false;
  const q={select(){return q;},eq(k,v){filters.push(row=>row[k]===v);return q;},in(k,v){filters.push(row=>v.includes(row[k]));return q;},gte(k,v){filters.push(row=>row[k]>=v);return q;},order(k,o){sort={k,asc:o?.ascending!==false};return q;},limit(n){cap=n;return q;},abortSignal(){return q;},update(v){operation='update';values=v;return q;},insert(v){operation='insert';values=v;return q;},maybeSingle(){single=true;return execute();},then(resolve,reject){return execute().then(resolve,reject);}};
  async function execute(){
   calls.push({table,operation,values});
   const error=options.fail?.({table,operation,values});if(error==='throw')throw Error('Untrusted backend diagnostic');if(error)return{data:null,error:{message:'Untrusted backend diagnostic',code:'XX000'}};
   let rows=(tables[table]??[]).filter(r=>filters.every(f=>f(r)));if(sort)rows.sort((a,b)=>String(a[sort.k]).localeCompare(String(b[sort.k]))*(sort.asc?1:-1));rows=rows.slice(0,cap);
   if(operation==='insert'){tables[table]??=[];const inserted={id:`local-${tables[table].length}`,created_at:new Date().toISOString(),...values};tables[table].push(inserted);rows=[inserted];}
   if(operation==='update'){if(options.zero?.({table,operation,values}))rows=[];rows.forEach(row=>Object.assign(row,values));}
   return{data:structuredClone(single?rows[0]??null:rows),error:null};
  }
  return q;
 },async rpc(name,args){if(name==='get_outbound_source_snapshot')return{data:{localSnapshot:true},error:null};assert.equal(name,'claim_due_customer_communications');claims++;if(options.claimError)return{data:null,error:{message:'Sensitive database diagnostic'}};
   const rows=(tables.customer_communications??[]).filter(r=>r.status==='pending'&&Date.parse(r.scheduled_for)<=Date.now()).slice(0,args.p_limit);rows.forEach(r=>Object.assign(r,{status:'processing',processing_started_at:new Date().toISOString(),attempt_count:r.attempt_count+1}));return{data:structuredClone(rows),error:null};}};
 return db;
}
