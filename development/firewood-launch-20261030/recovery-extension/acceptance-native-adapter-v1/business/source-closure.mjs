import {fileURLToPath} from 'node:url';
import {readBoundedFile} from '../shared/control-filesystem.mjs';
import {sha,hashObject} from '../shared/protocol.mjs';
// Fixed complete business import/resource closure. Root signer files are never
// mounted into the business runtime. Detached bootstrap pins this observation.
export const BUSINESS_FILES=Object.freeze(['native-proof-acceptance.mjs','business/verifier-core.mjs','business/source-closure.mjs','shared/protocol.mjs','shared/control-filesystem.mjs','shared/baseline-named-inventory.json']);
export function observeBusinessSourceClosure(){return hashObject(BUSINESS_FILES.map(name=>{const bytes=readBoundedFile(fileURLToPath(new URL('../'+name,import.meta.url)),262144,{control:true});return {name,bytes:bytes.length,sha256:sha(bytes)};}));}
