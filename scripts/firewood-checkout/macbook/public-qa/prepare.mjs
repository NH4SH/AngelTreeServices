import {prepare as nativePrepare} from '../prepare-native.mjs';
import {cp,mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
export async function prepare(target) {
  await nativePrepare(target);target=resolve(target);const dest=resolve(target,'scripts/firewood-checkout/macbook/public-qa');await mkdir(dest);
  for(const name of ['config.mjs','main.mjs','migrate.mjs','test-public-qa.mjs','PUBLIC_QA.md'])await cp(new URL(name,import.meta.url),resolve(dest,name));
  const pkg=JSON.parse(await readFile(resolve(target,'package.json'),'utf8'));pkg.name='angel-firewood-macbook-https-sandbox';
  pkg.scripts={web:'node scripts/firewood-checkout/macbook/public-qa/main.mjs web',worker:'node scripts/firewood-checkout/macbook/public-qa/main.mjs worker',test:'node --test scripts/firewood-checkout/macbook/test-native.mjs scripts/firewood-checkout/macbook/ops/test-ops.mjs scripts/firewood-checkout/macbook/public-qa/test-public-qa.mjs'};
  await writeFile(resolve(target,'package.json'),JSON.stringify(pkg,null,2)+'\n');
  const manifest={};async function walk(folder){for(const item of await readdir(folder,{withFileTypes:true})){const file=resolve(folder,item.name);if(item.isDirectory())await walk(file);else if(file!==resolve(target,'source-manifest.json'))manifest[relative(target,file)]=createHash('sha256').update(await readFile(file)).digest('hex');}}
  await walk(target);await writeFile(resolve(target,'source-manifest.json'),JSON.stringify(manifest,null,2)+'\n');return {files:Object.keys(manifest).length,manifest};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const result=await prepare(process.argv[2]);console.log(`Prepared ${result.files} HTTPS sandbox source files locally.`);}
