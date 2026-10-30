import {mkdir,cp,readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {prepare as prepareReviewed} from '../render/prepare.mjs';

export async function prepare(target){
  await prepareReviewed(target);target=resolve(target);
  const dest=resolve(target,'scripts/firewood-checkout/macbook');await mkdir(dest);
  for(const name of ['native-config.mjs','native-migrate.mjs','native-main.mjs','test-native.mjs','NATIVE_QA.md'])await cp(new URL(name,import.meta.url),resolve(dest,name));
  await mkdir(resolve(dest,'ops'));
  for(const name of ['files.mjs','host-identity.mjs','retry.mjs','backup.mjs','jobs.mjs','monitor.mjs','incidents.mjs','run.mjs','remote-status.mjs','ack.mjs','watch.mjs','prepare.mjs','prepare-watch.mjs','launchd.mjs','test-ops.mjs','OPS.md'])await cp(new URL('ops/'+name,import.meta.url),resolve(dest,'ops',name));
  const pkg=JSON.parse(await readFile(resolve(target,'package.json'),'utf8'));
  pkg.name='angel-firewood-private-macbook-qa';
  pkg.scripts={web:'node scripts/firewood-checkout/macbook/native-main.mjs web',worker:'node scripts/firewood-checkout/macbook/native-main.mjs worker',status:'node scripts/firewood-checkout/macbook/native-main.mjs status',test:'node --test scripts/firewood-checkout/macbook/test-native.mjs scripts/firewood-checkout/macbook/ops/test-ops.mjs'};
  await writeFile(resolve(target,'package.json'),JSON.stringify(pkg,null,2)+'\n');
  const manifest={};
  async function walk(folder){for(const item of await readdir(folder,{withFileTypes:true})){const file=resolve(folder,item.name);if(item.isDirectory())await walk(file);else if(file!==resolve(target,'source-manifest.json'))manifest[relative(target,file)]=createHash('sha256').update(await readFile(file)).digest('hex');}}
  await walk(target);await writeFile(resolve(target,'source-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  return {files:Object.keys(manifest).length,manifest};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const result=await prepare(process.argv[2]);console.log(`Prepared ${result.files} source files for private MacBook testing; nothing published.`);
}
