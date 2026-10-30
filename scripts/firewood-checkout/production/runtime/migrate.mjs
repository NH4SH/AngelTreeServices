import {readFile} from 'node:fs/promises';
import {RUNTIME_ID} from './config.mjs';
export async function migrate(db,config){return db.transaction(async tx=>{
  await tx.query('SELECT pg_advisory_xact_lock(987134222)');
  const existing=(await tx.query("SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_type='BASE TABLE'")).rows.map(r=>r.table_name);
  if(existing.some(n=>!n.startsWith('fw_')))throw Error('fresh_separate_candidate_namespace_required');
  const sql=await readFile(new URL('./schema.sql',import.meta.url),'utf8');
  // Single statements also work with the extended-query embedded test adapter.
  // Keep the trigger's dollar-quoted body intact rather than splitting its SQL.
  let statement='',dollar=false;
  for(const line of sql.split('\n')){statement+=line+'\n';if((line.match(/\$\$/gu)?.length??0)%2)dollar=!dollar;
    if(!dollar&&line.trim().endsWith(';')){await tx.query(statement);statement='';}}
  if(statement.trim())throw Error('unterminated_schema_statement');
  const m=(await tx.query('SELECT * FROM fw_identity WHERE id=$1',[RUNTIME_ID])).rows[0];
  if(m&&(m.origin!==config.origin||m.account!==config.account||m.mode!==config.mode||m.policy_hash!==config.policyHash))throw Error('candidate_identity_conflict');
  await tx.query('INSERT INTO fw_identity VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[RUNTIME_ID,config.account,config.mode,config.origin,config.policyHash]);
});}
