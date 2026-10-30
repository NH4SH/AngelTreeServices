// October 14, 2026 upstream security floors. Offline; no deployment or network.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export const appRoot=new URL('../../',import.meta.url);
const rscPackages=['react-server-dom-webpack','react-server-dom-parcel','react-server-dom-turbopack'];
function stable(version){
 assert.equal(typeof version,'string','An exact stable version is required.');
 assert.match(version,/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/,'An exact stable version is required.');
 return version.split('.').map(Number);
}
export function isPatchedNext(version){const [major,minor,patch]=stable(version);return major===16&&(minor>4||(minor===4&&patch>=1));}
export function isPatchedReact(version){const [major,minor,patch]=stable(version);const floor={0:9,1:10,2:9,3:1}[minor];return major===19&&floor!==undefined&&patch>=floor;}
export function verifyFramework(manifest,lock,installed){
 assert.equal(lock.lockfileVersion,3,'Reviewed npm lockfile is required.');
 const versions={};
 for(const name of ['next','react','react-dom']){
  const version=manifest.dependencies[name],entry=lock.packages['node_modules/'+name];
  assert.ok(name==='next'?isPatchedNext(version):isPatchedReact(version),name+' is below the reviewed security floor or on an unreviewed major/minor.');
  assert.equal(lock.packages[''].dependencies[name],version,'Declared and locked dependency differ: '+name);
  assert.equal(entry?.version,version,'Locked package differs: '+name);
  assert.match(entry?.integrity??'',/^sha512-[A-Za-z0-9+/]+={0,2}$/,'Locked package integrity is required: '+name);
  if(installed)assert.equal(installed(name).version,version,'Installed package differs; run npm ci in the isolated environment: '+name);
  versions[name]=version;
 }
 assert.equal(versions.react,versions['react-dom'],'React and React DOM must use the same reviewed release.');
 for(const [path,entry]of Object.entries(lock.packages)){
  if(rscPackages.some(name=>path.endsWith('/node_modules/'+name)||path==='node_modules/'+name))assert.ok(isPatchedReact(entry.version),'Affected standalone React Server Components package: '+path);
 }
 // Next bundles its own RSC implementation. Its Next security floor is checked
 // independently; updating the direct React pair alone does not patch Next.
 return {versions,october2026SecurityFloorsMet:true,installedPackagesChecked:Boolean(installed),offline:true,productionReady:false};
}
function run(){
 const args=process.argv.slice(2);assert.ok(args.length===0||(args.length===1&&args[0]==='--installed'),'Only an offline check or --installed is supported.');
 const read=path=>JSON.parse(readFileSync(new URL(path,appRoot)));
 console.log(JSON.stringify(verifyFramework(read('package.json'),read('package-lock.json'),args.length?name=>read('node_modules/'+name+'/package.json'):undefined),null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{run();}catch(e){console.error(e.message);process.exitCode=1;}}
