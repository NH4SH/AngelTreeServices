import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {settingValues} from './communication-settings-save-fixture.mjs';
const require=createRequire(import.meta.url),ts=require('typescript'),jsx=require('react/jsx-runtime');
function harness(settings=settingValues){
  const slots=[];let cursor=0,state={status:'idle',message:''},pending=false,action,next={status:'success',message:'Saved',settingsVersion:'2026-10-24T01:00:00.000Z'};
  const submissions=[];
  const react={useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];}};
  const deps={'react':react,'react/jsx-runtime':jsx,'lucide-react':{Play:()=>null,Save:()=>null},
    '@/hooks/use-reliable-action-state':{useReliableActionState:fn=>[state,async form=>{action=fn;pending=true;try{state=await action(state,form);}finally{pending=false;}},pending]},
    '@/lib/actions/communications':{runCommunicationWorkerNow:()=>assert.fail('No worker'),updateCommunicationSettings:async(_state,form)=>{submissions.push(form);return typeof next==='function'?next():next;}},
  };
  const module={exports:{}},source=readFileSync(new URL('../src/components/communication-settings-form.tsx',import.meta.url),'utf8');
  new Function('require','module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(name=>{assert.ok(name in deps,name);return deps[name];},module,module.exports);
  function flatten(node){if(!node||typeof node!=='object')return[];if(Array.isArray(node))return node.flatMap(flatten);if(typeof node.type==='function')return flatten(node.type(node.props));return[node,...flatten(node.props?.children)];}
  function render(props=settings){cursor=0;const tree=module.exports.CommunicationSettingsForm({settings:props}),nodes=flatten(tree);return{tree,nodes,input:name=>{const found=nodes.find(n=>n.type==='input'&&n.props.name===name);assert.ok(found,name);return found;},button:nodes.find(n=>n.type==='button')};}
  function form(tree){const value=new FormData();for(const n of tree.nodes.filter(n=>n.type==='input'))if(n.props.type!=='checkbox'||n.props.checked)value.set(n.props.name,String(n.props.value??''));return value;}
  return{render,form,submissions,setNext:value=>{next=value;},submit:async tree=>tree.tree.props.action(form(tree))};
}
test('the rendered settings form retains every current editable value and uses the matching version',()=>{
  const f=harness(),view=f.render();assert.equal(view.input('expected_updated_at').props.value,settingValues.updated_at);
  for(const [key,value]of Object.entries(settingValues)){if(['singleton','created_at','updated_at'].includes(key))continue;const input=view.input(key);assert.equal(typeof value==='boolean'?input.props.checked:input.props.value,typeof value==='boolean'?value:String(value));assert.equal(typeof input.props.onChange,'function');}
  assert.equal(view.button.props.disabled,false);
});
test('an unrelated page refresh cannot pair an old draft with a newer save version',()=>{
  const f=harness();f.render().input('minimum_send_interval_hours').props.onChange({target:{value:'36'}});
  const changed={...settingValues,minimum_send_interval_hours:12,updated_at:'2026-10-24T01:30:00Z'},view=f.render(changed);
  assert.equal(view.input('minimum_send_interval_hours').props.value,'36');assert.equal(view.input('expected_updated_at').props.value,settingValues.updated_at);
});
test('only a confirmed successful save advances the version while keeping visible edits',async()=>{
  const f=harness();f.render().input('invoice_first_reminder_days').props.onChange({target:{value:'0'}});
  await f.submit(f.render());const view=f.render();assert.equal(view.input('expected_updated_at').props.value,'2026-10-24T01:00:00.000Z');assert.equal(view.input('invoice_first_reminder_days').props.value,'0');
  assert.equal(f.submissions[0].get('expected_updated_at'),settingValues.updated_at);assert.ok(view.nodes.some(n=>n.type==='p'&&n.props.role==='status'));
});
test('conflict and lost-acknowledgement outcomes keep edits and the original version for review',async()=>{
  for(const status of ['error','warning']){const f=harness();f.setNext({status,message:'Reload and review'});f.render().input('business_timezone').props.onChange({target:{value:'America/Chicago'}});await f.submit(f.render());const view=f.render({...settingValues,updated_at:'2026-10-24T02:00:00Z'});assert.equal(view.input('expected_updated_at').props.value,settingValues.updated_at);assert.equal(view.input('business_timezone').props.value,'America/Chicago');}
});
test('checkbox state remains editable, and a pending save disables the save button',async()=>{
  const f=harness();let release;f.setNext(()=>new Promise(resolve=>{release=resolve;}));f.render().input('estimate_confirmation_enabled').props.onChange({target:{checked:false}});
  const task=f.submit(f.render());assert.equal(f.render().button.props.disabled,true);assert.equal(f.submissions[0].has('estimate_confirmation_enabled'),false);
  release({status:'success',message:'Saved',settingsVersion:'2026-10-24T02:00:00Z'});await task;assert.equal(f.render().button.props.disabled,false);assert.equal(f.render().input('estimate_confirmation_enabled').props.checked,false);
});
test('blank numeric edits remain blank instead of being coerced to a fallback',()=>{
  const f=harness();f.render().input('invoice_first_reminder_days').props.onChange({target:{value:''}});assert.equal(f.render().input('invoice_first_reminder_days').props.value,'');
});
