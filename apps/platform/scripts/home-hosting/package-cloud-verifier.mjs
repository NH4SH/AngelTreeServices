// Creates a separate, credential-free Netlify test artifact. Never deploys it.
import assert from 'node:assert/strict';import {readFileSync,mkdirSync,copyFileSync,writeFileSync,existsSync,chmodSync,cpSync} from 'node:fs';import {join,resolve} from 'node:path';
import {sha256} from './cloud-policy.mjs';
import {randomUUID} from 'node:crypto';
const [binary,output,namespace]=process.argv.slice(2);assert.ok(binary&&output);assert.match(namespace,/^ats-rehearsal-continuous-[a-f0-9]{12}$/);const destination=resolve(output);assert.equal(existsSync(destination),false);
assert.equal(sha256(readFileSync(binary)),'20d4142678d0d95ec11a4759def1b73fd9190abc9ca19e4b62d067c0b387e639');
mkdirSync(destination,{mode:0o700});for(const p of ['functions','lib','public'])mkdirSync(join(destination,p),{mode:0o700});
for(const file of ['cloud-netlify.mjs','cloud-verifier.mjs','cloud-policy.mjs','cloud-archive.mjs','continuous-policy.mjs','failover-proof.mjs'])copyFileSync(new URL('./'+file,import.meta.url),join(destination,'lib',file));
for(const file of ['package.json','package-lock.json'])copyFileSync(new URL('./'+file,import.meta.url),join(destination,file));
cpSync(new URL('./node_modules',import.meta.url),join(destination,'node_modules'),{recursive:true});
copyFileSync(binary,join(destination,'restic'));chmodSync(join(destination,'restic'),0o700);
// Bind each artifact to its namespace and give it distinct executable content.
// A provider must not silently reuse another deploy's static secret environment.
const artifact=randomUUID();
writeFileSync(join(destination,'functions','verify.mjs'),`import handler from '../lib/cloud-netlify.mjs';
export default async request=>{
 if(process.env.ATS_LAB_NAMESPACE!==${JSON.stringify(namespace)})return Response.json({error:'Deployment binding mismatch'},{status:503,headers:{'cache-control':'no-store'}});
 const response=await handler(request);response.headers.set('x-ats-recovery-artifact',${JSON.stringify(artifact)});return response;
};\n`);
writeFileSync(join(destination,'public','index.html'),'<!doctype html><title>Recovery verification lab</title><p>Isolated synthetic test service. No CRM application.</p>\n');
writeFileSync(join(destination,'netlify.toml'),'[build]\npublish = "public"\n[functions]\ndirectory = "functions"\nnode_bundler = "esbuild"\nincluded_files = ["restic"]\n');
console.log(JSON.stringify({output:destination,artifact,namespace,credentialsIncluded:false,scheduled:false,productionChanged:false}));
