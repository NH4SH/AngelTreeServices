export type LiveCollectorPolicy=Readonly<{profile:'firewood-acceptance-v1';mode:'test';sourceId:string;orderId:string;invoiceId:string;accountId:string;receiptAuthority:'crm';surchargeReporting:true}>;
export function sameCollectorRelease(a:any,b:any):boolean;
export function isReleasedFirewoodMode(context:any,mode:'collection'|'sending',nowMs:number):boolean;
export function collectionKeyMatches(context:any,key:unknown):boolean;
export function exactLiveInvoice(invoice:any):boolean;
export function looksLiveCollectorPolicy(policy:any):boolean;
export function createLiveCollectorAdmission(input:{readContext:(mode:'collection')=>any;readKey:()=>unknown;readCollectorContext:(db:any,invoiceId:string)=>Promise<any>;now?:()=>number}):Readonly<{
 mint(db:any,invoice:any,livemode:boolean):Promise<LiveCollectorPolicy|null>;
 isMinted(policy:unknown):boolean;
 revalidate(policy:unknown,db:any,invoiceId:string,livemode:boolean,clientFingerprint:string|null):Promise<boolean>;
}>;
