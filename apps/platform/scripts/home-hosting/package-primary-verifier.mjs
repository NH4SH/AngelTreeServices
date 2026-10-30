// Credential-free build artifact. Deployment credentials are supplied separately
// to the existing account; no application or scanner is published by this tool.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {sha256} from './cloud-policy.mjs';import {primaryOperationFiles} from './primary-operation-files.mjs';
const[binary,destination,namespace]=process.argv.slice(2);assert.ok(binary&&destination);assert.match(namespace,/^ats-home-continuous-[a-f0-9]{12}$/);assert.equal(fs.existsSync(destination),false);assert.equal(sha256(fs.readFileSync(binary)),'20d4142678d0d95ec11a4759def1b73fd9190abc9ca19e4b62d067c0b387e639');
const root=fileURLToPath(new URL('.',import.meta.url));fs.mkdirSync(destination,{mode:0o700});for(const name of ['functions','lib','public'])fs.mkdirSync(path.join(destination,name),{mode:0o700});
for(const name of primaryOperationFiles(root,{cloudOnly:true}))fs.copyFileSync(path.join(root,name),path.join(destination,name.endsWith('.mjs')?'lib':'',name));
fs.cpSync(path.join(root,'node_modules'),path.join(destination,'node_modules'),{recursive:true});fs.copyFileSync(binary,path.join(destination,'restic'));fs.chmodSync(path.join(destination,'restic'),0o700);
fs.writeFileSync(path.join(destination,'functions/home-native-backup.mjs'),`import{primaryBackupHandler}from'../lib/primary-backup-netlify.mjs';\nexport default primaryBackupHandler({projectRef:'nbsvdzscgfpabbbdwlob',namespace:${JSON.stringify(namespace)}});\n`,{mode:0o600});
fs.writeFileSync(path.join(destination,'functions/home-native-retire-background.mjs'),`import{primaryBackupHandler}from'../lib/primary-backup-netlify.mjs';\nexport default primaryBackupHandler({projectRef:'nbsvdzscgfpabbbdwlob',namespace:${JSON.stringify(namespace)},mode:'retirement'});\n`,{mode:0o600});
fs.writeFileSync(path.join(destination,'public/index.html'),'<!doctype html><title>Private backup verification</title><p>Authenticated backup verification service.</p>\n',{mode:0o600});
fs.writeFileSync(path.join(destination,'netlify.toml'),'[build]\npublish="public"\n[functions]\ndirectory="functions"\nnode_bundler="esbuild"\nincluded_files=["restic"]\n',{mode:0o600});
console.log(JSON.stringify({prepared:true,namespace,credentialsIncluded:false,applicationIncluded:false,scannerIncluded:false}));
