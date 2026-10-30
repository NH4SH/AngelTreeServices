import {fileURLToPath} from 'node:url';
import {readRootFile} from './io.mjs';
import {sha,hashObject} from '../shared/protocol.mjs';
export const ROOT_FILES=Object.freeze(['root/issuer.mjs','root/issuer-core.mjs','root/issuer-source.mjs','root/io.mjs','root/private-sdk.mjs','root/test-sdk-custody-core.mjs','shared/protocol.mjs','shared/control-filesystem.mjs','shared/baseline-named-inventory.json','business/source-closure.mjs']);
export function observeRootIssuerSourceClosure(){return hashObject(ROOT_FILES.map(name=>{const bytes=readRootFile(fileURLToPath(new URL('../'+name,import.meta.url)));return {name,bytes:bytes.length,sha256:sha(bytes)};}));}
