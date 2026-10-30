import {lstat,readFile,realpath} from 'node:fs/promises';
import {resolve,dirname,basename} from 'node:path';
import {createHash} from 'node:crypto';
export const ADMISSION_DIRECTORY='/release-admission';
// The existing master recovery descriptor keeps its exact original shape.
// Website deployment metadata is a distinct root-owned readonly file.
export const DESCRIPTOR_PATH=ADMISSION_DIRECTORY+'/website-runtime.json';
const sha=value=>createHash('sha256').update(value).digest('hex');
export function validateSourceManifest(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length<1||Object.keys(value).length>2000)throw Error('exact_source_manifest_required');
  for(const[path,hash]of Object.entries(value))if(!/^[A-Za-z0-9_.@/-]+$/u.test(path)||path.startsWith('/')||path.split('/').some(x=>!x||x==='.'||x==='..')||!/^scripts\/firewood-checkout\//u.test(path)&&!['public-firewood.json'].includes(path)||!/^[a-f0-9]{64}$/u.test(hash))throw Error('exact_source_manifest_required');
  return Object.freeze({...value});
}
export function assertMetadataStat(stat){if(!stat?.isFile()||stat.isSymbolicLink()||stat.uid!==0||(stat.mode&0o222)!==0||stat.size>1048576)throw Error('root_owned_readonly_metadata_required');}
async function metadataBytes(path){
  if(dirname(path)!==ADMISSION_DIRECTORY||basename(path).startsWith('.'))throw Error('fixed_admission_metadata_required');
  const parent=await lstat(ADMISSION_DIRECTORY);if(!parent.isDirectory()||parent.isSymbolicLink()||parent.uid!==0||(parent.mode&0o022)!==0)throw Error('root_owned_admission_directory_required');
  const stat=await lstat(path);assertMetadataStat(stat);if(await realpath(path)!==path)throw Error('root_owned_readonly_metadata_required');
  return readFile(path);
}
export async function readReleaseDescriptor(){
  const bytes=await metadataBytes(DESCRIPTOR_PATH);let value;try{value=JSON.parse(bytes);}catch{throw Error('release_descriptor_unconfirmed');}
  if(value?.version!==1||value.profile!=='production-live'||!/^[a-f0-9]{64}$/u.test(value.websiteSourceManifestSha256??'')
    ||!/^[a-f0-9]{64}$/u.test(value.releaseControlSha256??''))throw Error('release_descriptor_unconfirmed');
  if(sha(await metadataBytes(ADMISSION_DIRECTORY+'/firewood-release.json'))!==value.releaseControlSha256)throw Error('shared_release_control_mismatch');
  return Object.freeze(value);
}
export async function readMasterSigningIdentity(descriptor){
  const bytes=await metadataBytes(ADMISSION_DIRECTORY+'/firewood-release.json');
  if(sha(bytes)!==descriptor.releaseControlSha256)throw Error('shared_release_control_mismatch');
  const value=JSON.parse(bytes);
  if(!/^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/u.test(value.signingKeyId??'')||!/^[a-f0-9]{64}$/u.test(value.signingKeyFingerprint??''))throw Error('master_signing_identity_required');
  return Object.freeze({keyId:value.signingKeyId,fingerprint:value.signingKeyFingerprint});
}
export async function verifyInstalledSources(root,descriptor){
  const bytes=await metadataBytes(ADMISSION_DIRECTORY+'/website-source-manifest.json');
  if(sha(bytes)!==descriptor.websiteSourceManifestSha256)throw Error('installed_source_manifest_mismatch');
  let value;try{value=JSON.parse(bytes);}catch{throw Error('installed_source_manifest_mismatch');}
  const manifest=validateSourceManifest(value),canonicalRoot=await realpath(root);
  if(canonicalRoot!==resolve(root))throw Error('canonical_source_root_required');
  for(const[path,expected]of Object.entries(manifest)){
    const absolute=resolve(root,path),stat=await lstat(absolute);
    if(!absolute.startsWith(canonicalRoot+'/')||await realpath(absolute)!==absolute||!stat.isFile()||stat.isSymbolicLink()||stat.uid!==0||(stat.mode&0o022)!==0||stat.size>1048576)throw Error('immutable_installed_source_required');
    if(sha(await readFile(absolute))!==expected)throw Error('installed_source_hash_mismatch');
  }
  if(!manifest['scripts/firewood-checkout/release/main.mjs']||!manifest['scripts/firewood-checkout/release/database.mjs']||!manifest['scripts/firewood-checkout/release/server.mjs'])throw Error('complete_runtime_source_manifest_required');
  return manifest;
}
export async function readNativeProofAdapter(descriptor){
  const path=ADMISSION_DIRECTORY+'/native-proof.mjs',bytes=await metadataBytes(path);
  if(!/^[a-f0-9]{64}$/u.test(descriptor.nativeProofSha256??'')||sha(bytes)!==descriptor.nativeProofSha256)throw Error('native_proof_adapter_mismatch');
  const adapter=await import(path);if(typeof adapter.createAdmissionVerifier!=='function')throw Error('native_proof_adapter_required');return adapter;
}
export async function privateSecret(path){
  if(typeof path!=='string'||dirname(path)!=='/run/secrets'||!/^[A-Za-z0-9_-]+$/u.test(basename(path)))throw Error('mounted_private_credential_required');
  const stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink()||![0,process.getuid()].includes(stat.uid)||(stat.mode&0o007)!==0||(stat.mode&0o022)!==0||stat.size>65536||await realpath(path)!==path)throw Error('mounted_private_credential_required');
  return(await readFile(path)).toString('utf8').trim();
}
