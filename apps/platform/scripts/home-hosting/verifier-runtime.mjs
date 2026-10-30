// Independently observed on a newly created Netlify test function, October 28.
// A matching build version or bundle manifest alone does not prove this runtime.
export function approvedVerifierRuntime(version,platform,architecture){
  const match=/^(\d+)\.(\d+)\.(\d+)$/.exec(version??'');
  if(!match||platform!=='linux'||architecture!=='x64')return false;
  const [major,minor,patch]=match.slice(1).map(Number);
  return major===22&&(minor>23||(minor===23&&patch>=4));
}
