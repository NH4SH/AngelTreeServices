import { mkdir,cp,readFile,writeFile,readdir,realpath } from 'node:fs/promises';
import { resolve,dirname,relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// Local allowlisted export only. No provider, repository, or deployment call.
export async function prepare(target) {
  const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
  target=resolve(target);
  const physicalRepo=await realpath(repo);
  target=resolve(await realpath(dirname(target)),relative(dirname(target),target));
  if(target===physicalRepo||target.startsWith(physicalRepo+'/'))throw new Error('Choose a new directory outside the repository.');
  await mkdir(target); // Never replace an existing export or user directory.
  const dest=resolve(target,'scripts/firewood-checkout');await mkdir(dest,{recursive:true});
  for(const name of ['model.mjs','crm.mjs','store-core.mjs','confirmations.mjs','email-worker.mjs','checkout.html','checkout.js','checkout.css','enlarged.css'])await cp(resolve(here,'..',name),resolve(dest,name));
  await mkdir(resolve(dest,'migrations'));
  for(const name of ['202610250001_firewood_test_orders.sql','202610250002_firewood_crm_sync.sql','202610260003_controlled_email.sql'])await cp(resolve(here,'../migrations',name),resolve(dest,'migrations',name));
  for(const name of ['runtime.mjs']) {await mkdir(resolve(dest,'hosted'),{recursive:true});await cp(resolve(here,'../hosted',name),resolve(dest,'hosted',name));}
  await mkdir(resolve(dest,'render'));
  for(const name of ['config.mjs','checkout.mjs','worker.mjs','server.mjs','assets.mjs','main.mjs','migrate.mjs','README.md'])await cp(resolve(here,name),resolve(dest,'render',name));
  await mkdir(resolve(dest,'render/migrations'));
  await cp(resolve(here,'migrations/202610270001_render_qa.sql'),resolve(dest,'render/migrations/202610270001_render_qa.sql'));
  await mkdir(resolve(dest,'render/fonts'));
  for(const name of ['poppins-400.3dc5d0c524.woff2','poppins-500.289e0afc8b.woff2','poppins-700.197a3cbd72.woff2'])await cp(resolve(here,'fonts',name),resolve(dest,'render/fonts',name));
  await cp(resolve(repo,'public-firewood.json'),resolve(target,'public-firewood.json'));
  await cp(resolve(here,'../hosted/runtime-package-lock.json'),resolve(target,'package-lock.json'));
  const lock=JSON.parse(await readFile(resolve(target,'package-lock.json'),'utf8'));
  const local=JSON.parse(await readFile(resolve(here,'../package.json'),'utf8'));
  if(Object.entries(lock.packages[''].dependencies).some(([k,v])=>local.dependencies[k]!==v))throw new Error('dependency_lock_mismatch');
  await writeFile(resolve(target,'package.json'),JSON.stringify({name:'angel-firewood-render-qa',private:true,type:'module',scripts:{web:'node scripts/firewood-checkout/render/main.mjs web',worker:'node scripts/firewood-checkout/render/main.mjs worker',status:'node scripts/firewood-checkout/render/main.mjs status'},dependencies:lock.packages[''].dependencies},null,2)+'\n');
  await writeFile(resolve(target,'.gitignore'),'node_modules/\n.env*\n*.private\n');
  await writeFile(resolve(target,'.node-version'),'24.4.0\n');
  const manifest={};
  async function walk(folder) {for(const item of await readdir(folder,{withFileTypes:true})){const file=resolve(folder,item.name);if(item.isDirectory())await walk(file);else manifest[relative(target,file)]=createHash('sha256').update(await readFile(file)).digest('hex');}}
  await walk(target);await writeFile(resolve(target,'source-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  return {files:Object.keys(manifest).length,manifest};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(!process.argv[2])throw new Error('Provide a new local export directory.');
  const result=await prepare(process.argv[2]);console.log(`Prepared ${result.files} allowlisted files locally. Nothing published.`);
}
