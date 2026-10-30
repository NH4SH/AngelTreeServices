// Fixed business entry. Source, metadata, clocks and key are never arguments.
import {readFixedSnapshot} from './shared/control-filesystem.mjs';
import {observeBusinessSourceClosure} from './business/source-closure.mjs';
import {buildAdmissionVerifier} from './business/verifier-core.mjs';
function read(){const value=readFixedSnapshot({platform:process.platform,uid:process.getuid?.(),pid:process.pid,wallMs:Date.now()});value.actualAdapterSourceClosureSha256=observeBusinessSourceClosure();value.wallMs=Date.now();return value;}
export function createAdmissionVerifier({descriptor,role,mode,binding}){return buildAdmissionVerifier({descriptor,role,mode,binding},read);}
