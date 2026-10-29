// A thin edge artifact, without a second CRM runtime/database or framework
// adapter. The exact five existing scheduler entrypoints remain the only timers.
import fs from'node:fs';import path from'node:path';import assert from'node:assert/strict';
const[sourceRoot,destination]=process.argv.slice(2);assert.ok(sourceRoot&&destination);assert.equal(fs.existsSync(destination),false);fs.mkdirSync(destination,{mode:0o700});
const source=path.resolve(sourceRoot,'apps/platform'),names=['advance-scheduled-jobs','manager-notifications','process-communications','process-google-calendar','run-system-health'],queue=names.map(n=>'netlify/functions/'+n+'.ts'),seen=new Set();
while(queue.length){const relative=queue.shift();if(seen.has(relative))continue;assert.ok(!relative.startsWith('../')&&!relative.includes('private')&&!relative.includes('.env'));const input=path.join(source,relative);assert.equal(fs.lstatSync(input).isSymbolicLink(),false);let bytes=fs.readFileSync(input);seen.add(relative);
 if(relative.endsWith('.ts')||relative.endsWith('.mjs'))for(const m of bytes.toString().matchAll(/from\s*['"](\.[^'"]+)['"]/g)){const base=path.resolve(path.dirname(input),m[1]);assert.ok(base.startsWith(source+'/'));const resolved=[base,base+'.ts',base+'.mjs',base+'.js',base+'.json'].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());assert.ok(resolved,'Missing scheduler dependency');queue.push(path.relative(source,resolved));}
 if(relative==='netlify/lib/worker-request.ts'){const anchor='export async function runScheduledWorker(path: string, secretName: string, label: string) {';assert.equal(bytes.toString().split(anchor).length,2);bytes=Buffer.from(bytes.toString().replace(anchor,anchor+'\n  if (Netlify.env.get("ATS_HOME_EDGE_DISPATCH") !== "released") throw Error("Worker dispatch is held during hosting verification.");'));}
 const output=path.join(destination,'platform',relative);fs.mkdirSync(path.dirname(output),{recursive:true,mode:0o700});fs.writeFileSync(output,bytes,{mode:0o600});
}
assert.equal(seen.size,10);fs.mkdirSync(destination+'/edge',{mode:0o700});fs.mkdirSync(destination+'/edge-lib',{mode:0o700});fs.copyFileSync(new URL('./primary-edge-proxy.mjs',import.meta.url),destination+'/edge-lib/proxy.mjs');
fs.writeFileSync(destination+'/edge/home-crm.js',`import{primaryEdgeProxy}from'../edge-lib/proxy.mjs';
export default async(request,context)=>{
 if(context.site.id!=='6fe7a9ca-878e-4b7b-bb4a-966efdc4d1a0')return new Response('Unavailable',{status:503});
 const url=new URL(request.url);
 if(url.hostname!=='admin.angeltreeservices.org'){
  if(context.deploy.context!=='deploy-preview'||url.hostname!==context.deploy.id+'--angel-tree-admin.netlify.app')return new Response('Unavailable',{status:421});
  request=new Request('https://admin.angeltreeservices.org'+url.pathname+url.search,request);
 }
 return primaryEdgeProxy({origin:Netlify.env.get('ATS_HOME_ORIGIN_URL'),token:Netlify.env.get('ATS_HOME_PROXY_TOKEN')})(request,context);
};
export const config={path:'/*',excludedPath:'/.netlify/*',onError:'fail'};
`,{mode:0o600});
fs.mkdirSync(destination+'/public',{mode:0o700});fs.writeFileSync(destination+'/public/index.html','<!doctype html><title>Angel Tree Services</title><p>The CRM is temporarily unavailable.</p>',{mode:0o600});fs.writeFileSync(destination+'/package.json',JSON.stringify({private:true,type:'module'}),{mode:0o600});fs.writeFileSync(destination+'/netlify.toml','[build]\nbase="."\ncommand=""\npublish="public"\nedge_functions="edge"\n[functions]\ndirectory="platform/netlify/functions"\nnode_bundler="esbuild"\n[build.environment]\nNETLIFY_NEXT_PLUGIN_SKIP="true"\n',{mode:0o600});fs.writeFileSync(destination+'/artifact.json',JSON.stringify({version:1,crmRuntimeIncluded:false,schedulers:names,dependencyFiles:[...seen].sort(),sourceRoot},null,2),{mode:0o600});console.log(JSON.stringify({prepared:true,schedulerCount:names.length,sourceFiles:seen.size,crmRuntimeIncluded:false,credentialsIncluded:false}));
