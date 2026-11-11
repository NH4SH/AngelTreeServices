// Build-phase defense in addition to a real private IP network namespace.
const fs=require('node:fs');
const deny=()=>{fs.appendFileSync(process.env.ATS_NETWORK_ATTEMPTS,'blocked\n');throw Error('Outbound access denied during owned CRM build');};
globalThis.fetch=deny;
for(const name of ['node:http','node:https']){require(name).request=deny;require(name).get=deny;}
require('node:net').connect=deny;require('node:net').createConnection=deny;require('node:tls').connect=deny;
