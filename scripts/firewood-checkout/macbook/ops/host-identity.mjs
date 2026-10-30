import {lstat,readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {homedir} from 'node:os';
import {resolve} from 'node:path';
import {createHash,timingSafeEqual} from 'node:crypto';
const root=resolve(homedir(),'.local/share/ats-firewood-native-qa-20261026');
async function platformId(){
  const {stdout}=await promisify(execFile)('/usr/sbin/ioreg',['-rd1','-c','IOPlatformExpertDevice'],{timeout:5000,maxBuffer:131072,env:{PATH:'/usr/bin:/bin:/usr/sbin'}});
  const match=stdout.match(/"IOPlatformUUID"\s*=\s*"([A-Fa-f0-9-]{36})"/u);
  if(!match)throw new Error('host_identity_unavailable');
  return match[1];
}
export async function verifyHost({directory=root,uid=process.getuid(),platform=process.platform,readPlatformId=platformId}={}){
  if(platform!=='darwin'||uid!==501)throw new Error('approved_macbook_required');
  const folder=await lstat(directory);
  if(!folder.isDirectory()||folder.isSymbolicLink()||folder.uid!==uid||(folder.mode&0o077))throw new Error('private_host_identity_required');
  const path=resolve(directory,'host-identity.private.json'),file=await lstat(path);
  if(!file.isFile()||file.isSymbolicLink()||file.uid!==uid||(file.mode&0o077))throw new Error('private_host_identity_required');
  const pin=JSON.parse(await readFile(path,'utf8'));
  if(pin.version!==1||pin.uid!==uid||!/^[a-f0-9]{64}$/u.test(pin.platformUuidSha256??''))throw new Error('private_host_identity_required');
  const id=await readPlatformId();
  if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(id))throw new Error('host_identity_unavailable');
  const digest=createHash('sha256').update(id.toLowerCase()).digest();
  if(!timingSafeEqual(digest,Buffer.from(pin.platformUuidSha256,'hex')))throw new Error('approved_macbook_required');
  return {approved:true};
}
