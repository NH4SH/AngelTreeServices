import fs from'node:fs';import path from'node:path';import assert from'node:assert/strict';
// Only signed public receipts, bindings and the public verification key belong
// here. Explicit chmod is necessary because the operator uses umask 077.
export function publicAdmissionDirectory(directory){fs.mkdirSync(directory,{recursive:true,mode:0o755});assert.equal(fs.lstatSync(directory).isSymbolicLink(),false);fs.chmodSync(directory,0o755);}
export function publishAdmission(directory,name,value){assert.ok(['binding.json','active.json','authority-public.pem','fenced.latch','workers-released.json'].includes(name));const file=path.join(directory,name),temporary=file+'.new';fs.writeFileSync(temporary,typeof value==='string'?value:JSON.stringify(value),{mode:0o444});fs.chmodSync(temporary,0o444);fs.renameSync(temporary,file);}
