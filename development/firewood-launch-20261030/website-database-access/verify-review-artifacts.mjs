// Read-only local consistency check. Never opens a database or network connection.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const read=name=>fs.readFileSync(path.join(here,name),'utf8');
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const matrix=JSON.parse(read('ACCESS_MATRIX.json')), inventory=JSON.parse(read('SQL_QUERY_INVENTORY.json'));
const sql=read('roles-acl-rls.sql.review-only.txt'), helper=read('native-context-body.sql.review-only.txt');
const schema=fs.readFileSync(matrix.sourcePins.find(p=>p.name==='schema.sql').path,'utf8');
const tables=[...schema.matchAll(/CREATE TABLE IF NOT EXISTS fwofficev2_([a-z_]+)/gu)].map(m=>m[1]).sort();
assert.equal(tables.length,15);assert.deepEqual(tables,Object.keys(matrix.columns).sort());
for(const p of matrix.sourcePins)assert.equal(sha(fs.readFileSync(p.path)),p.sha256,'Source changed: '+p.name);
assert.deepEqual(inventory.sourcePins,matrix.sourcePins);
assert.deepEqual([...new Set(inventory.queries.flatMap(q=>q.tables))].sort(),tables.map(t=>'fwofficev2_'+t));
const grants=[...sql.matchAll(/^GRANT (SELECT|INSERT|UPDATE) \(([^)]+)\) ON TABLE app_private\.fwofficev2_([a-z_]+) TO ([a-z_]+);$/gmu)].map(m=>({operation:m[1].toLowerCase(),columns:m[2].split(','),table:m[3],role:m[4]}));
let expected=0;for(const [role,tables]of Object.entries(matrix.roles))for(const[table,modes]of Object.entries(tables))for(const operation of ['select','insert','update'])if(modes[operation]){
  expected++;assert.equal(grants.filter(g=>g.role===role&&g.table===table&&g.operation===operation).length,1);assert.deepEqual(grants.find(g=>g.role===role&&g.table===table&&g.operation===operation).columns,modes[operation]);
}
assert.equal(grants.length,expected);assert.equal(Object.keys(matrix.roles.ats_firewood_health).length,0);
assert.equal([...sql.matchAll(/^CREATE POLICY /gmu)].length,expected);
assert.equal([...sql.matchAll(/ENABLE ROW LEVEL SECURITY;/gu)].length,15);assert.equal([...sql.matchAll(/FORCE ROW LEVEL SECURITY;/gu)].length,15);
assert.doesNotMatch(sql,/^GRANT (?:ALL|DELETE|TRUNCATE|REFERENCES|TRIGGER|MAINTAIN|CREATE|TEMPORARY)\b/gmu);
assert.equal([...sql.matchAll(/CREATE ROLE [a-z_]+ NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;/gu)].length,3);
assert.match(helper,/LANGUAGE plpgsql VOLATILE SECURITY DEFINER/u);assert.match(helper,/SET search_path TO ''/u);assert.match(helper,/SESSION_USER NOT IN/u);assert.match(helper,/transaction_isolation.*read committed/u);assert.match(helper,/capture_in_progress IS DISTINCT FROM false/u);assert.match(helper,/interval '280 seconds'/u);assert.match(helper,/interval '14 seconds'/u);assert.doesNotMatch(helper,/GRANT.*hosting_guard/u);
for(const name of ['roles-acl-rls.sql.review-only.txt','public-boundary-rehome.sql.review-only.txt']){const s=read(name);assert.match(s,/BEGIN;\nDO \$review_only\$ BEGIN RAISE EXCEPTION/u);assert.match(s,/ROLLBACK;\s*$/u);}
const proofName=fs.existsSync(path.join(here,'NATIVE_CALLBACK_INTEGRATION_PROOF.json'))?'NATIVE_CALLBACK_INTEGRATION_PROOF.json':'NATIVE_PERMISSION_PROOF.json';
const proof=JSON.parse(read(proofName));assert.equal(proof.passed,true);assert.equal(proof.clusterStopped,true);assert.equal(proof.cases.length,12);assert.equal(proof.providerCalls,0);assert.equal(proof.productionMutations,0);assert.deepEqual(proof.existingRoleMatrix.before,proof.existingRoleMatrix.after);assert.equal(proof.existingRoleMatrix.before.length,25);assert.equal(proof.finalNativeRoles.length,3);assert.ok(proof.finalNativeRoles.every(r=>r.rolcanlogin===false));assert.equal(proof.finalTriggers.length,15);assert.ok(proof.finalTriggers.every(t=>t.n===3));
if(proof.callbackIntegration){assert.equal(proof.callbackIntegration.passed,true);assert.equal(proof.callbackIntegration.cases.length,6);assert.ok(proof.callbackIntegration.cases.every(c=>c.passed===true));assert.equal(proof.callbackIntegration.providerCalls,0);assert.equal(proof.callbackIntegration.productionMutations,0);}
assert.deepEqual(proof.sourcePins,matrix.sourcePins);for(const[name,hash]of Object.entries(proof.artifactHashes))assert.equal(sha(fs.readFileSync(path.join(here,name))),hash,'Tested artifact changed: '+name);
const result={passed:true,scope:'Read-only source/matrix/native-proof consistency; no database/network opened',tables:tables.length,queryLiterals:inventory.queries.length,columnGrants:grants.length,nativeGroups:proof.cases.length,callbackGroups:proof.callbackIntegration?.cases.length??0,preexistingRolesPreserved:proof.existingRoleMatrix.before.length,nativeRolesFinalNoLogin:true,clusterStopped:true};
fs.writeFileSync(path.join(here,'ARTIFACT_VERIFICATION.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
