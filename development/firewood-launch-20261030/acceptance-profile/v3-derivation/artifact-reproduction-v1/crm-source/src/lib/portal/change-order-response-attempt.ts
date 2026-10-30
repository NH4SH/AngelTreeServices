// A response-loss retry keeps the exact request and reviewed version. Storage
// contains digests and opaque IDs, never the customer capability or message.
export type ChangeOrderResponseAttempt={requestId:string;payloadHash:string;reviewedAt:string};
type StorageLike=Pick<Storage,"getItem"|"setItem"|"removeItem">;
async function digest(value:string){const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
export async function prepareChangeOrderResponseAttempt(token:string,intent:string,message:string,reviewedAt:string,storage:StorageLike|null,previous?:ChangeOrderResponseAttempt){
 const key='change-order-response:'+await digest(token);let saved=previous;
 if(!saved&&storage){try{const v=JSON.parse(storage.getItem(key)||'null');if(uuid(v?.requestId)&&/^[a-f0-9]{64}$/.test(v?.payloadHash)&&typeof v?.reviewedAt==='string'&&Number.isFinite(Date.parse(v.reviewedAt)))saved=v;}catch{/* In-memory retry remains available. */}}
 const payloadHash=await digest(JSON.stringify([intent,message.trim()]));
 const attempt=saved?.payloadHash===payloadHash?saved:{requestId:crypto.randomUUID(),payloadHash,reviewedAt:saved?.reviewedAt??reviewedAt};
 try{storage?.setItem(key,JSON.stringify(attempt));}catch{/* Private browsing can disable storage. */}
 return{key,attempt};
}
export function forgetChangeOrderResponseAttempt(key:string,storage:StorageLike|null){try{storage?.removeItem(key);}catch{/* No stored identity to clear. */}}
