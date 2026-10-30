// Native bindings are constructed by the fixed private runtime entrypoint.
// Every operation is fenced in the same transaction as the business write.
import { createIsolatedLiveDatabase } from '../live/isolated-database.mjs';
import { AsyncLocalStorage } from 'node:async_hooks';
const databases=new WeakMap();
const allowedModes=['status','preparation','office','collection','sending'];
const modes=value=>{const result=Array.isArray(value)?value:[value];if(!result.length||new Set(result).size!==result.length||result.some(x=>!allowedModes.includes(x)))throw Error('fixed_admission_mode_required');return Object.freeze([...result]);};
export function assertRuntimeDatabase(db){const context=databases.get(db);if(!context)throw Error('bound_runtime_database_required');return context;}
export async function createReleaseTestDatabase(){const db=await createIsolatedLiveDatabase();Object.defineProperty(db,'runInMode',{value:(mode,operation)=>{modes(mode);return operation();}});databases.set(db,Object.freeze({kind:'isolated'}));return db;}
export async function createNativeDatabase({pool,binding,verifyAdmission,now=Date.now}){
  if(binding?.database!=='postgres'||binding.schema!=='app_private'||binding.profile!=='production-live'
    ||!['ats_firewood_request','ats_firewood_worker'].includes(binding.role)||!/^\d{16,20}$/u.test(binding.systemIdentifier??'')
    ||!['releaseSha256','schemaSha256','recoveryBindingSha256','authorityPublicKeyFingerprint'].every(k=>/^[a-f0-9]{64}$/u.test(binding[k]??''))
    ||!['liveKeyId','officeKeyId'].every(k=>/^[A-Za-z0-9_-]{8,128}$/u.test(binding[k]??''))
    ||typeof verifyAdmission!=='function'||typeof now!=='function'||typeof pool?.connect!=='function')throw Error('exact_native_binding_required');
  const expected=Object.freeze(structuredClone(binding));
  const scope=new AsyncLocalStorage();
  async function verify(tx,requiredModes){
    const identity=(await tx.query('SELECT current_database() AS database,current_user AS role,current_schema() AS schema')).rows[0];
    if(!identity||['database','role','schema'].some(k=>identity[k]!==expected[k]))throw Error('native_database_identity_mismatch');
    for(const mode of requiredModes){const proof=await verifyAdmission(tx,mode);
      if(!proof||proof.admitted!==true||['systemIdentifier','releaseSha256','schemaSha256','recoveryBindingSha256','authorityPublicKeyFingerprint'].some(k=>proof[k]!==expected[k])
        ||!Number.isSafeInteger(proof.backupAgeMs)||proof.backupAgeMs<0||proof.backupAgeMs>=280000
        ||!Number.isSafeInteger(proof.expiresAtMs)||proof.expiresAtMs<=now()||proof.expiresAtMs>now()+14000)throw Error('native_admission_pending');
    }
  }
  const db=Object.freeze({
    runInMode(required,operation){return scope.run(modes(required),operation);},
    async transaction(operation){const requiredModes=scope.getStore()??['status'];const client=await pool.connect();const tx={query:(sql,args=[])=>client.query(sql,args)};
      try{await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');await client.query('SET LOCAL search_path=app_private,pg_catalog');await verify(tx,requiredModes);
        const value=await operation(tx);await verify(tx,requiredModes);await client.query('COMMIT');return value;
      }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}},
    async query(sql,args=[]){return db.transaction(tx=>tx.query(sql,args));},
  });
  await db.transaction(async()=>{});
  databases.set(db,Object.freeze({kind:'native',...expected}));return db;
}
