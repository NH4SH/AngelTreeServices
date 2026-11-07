import {createCipheriv,createDecipheriv,randomBytes,createHash} from 'node:crypto';
const prefix=Buffer.from('FWB1');
export function seal(data,key){if(!Buffer.isBuffer(key)||key.length!==32)throw Error('backup_key_required');const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(prefix);const encrypted=Buffer.concat([cipher.update(data),cipher.final()]);return Buffer.concat([prefix,iv,cipher.getAuthTag(),encrypted]);}
export function unseal(data,key){if(!Buffer.isBuffer(key)||key.length!==32||data.length<32||!data.subarray(0,4).equals(prefix))throw Error('invalid_backup');const cipher=createDecipheriv('aes-256-gcm',key,data.subarray(4,16));cipher.setAAD(prefix);cipher.setAuthTag(data.subarray(16,32));return Buffer.concat([cipher.update(data.subarray(32)),cipher.final()]);}
export const hash=data=>createHash('sha256').update(data).digest('hex');
