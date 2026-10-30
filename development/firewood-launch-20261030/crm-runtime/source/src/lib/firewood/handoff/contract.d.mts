export class FirewoodHandoffError extends Error{code:string;retryable:boolean;httpStatus:number;constructor(code:string,retryable?:boolean,httpStatus?:number)}
export const HANDOFF_CONTRACT:string,PREPARE_PATH:string,STATUS_PATH:string,RENEW_PATH:string,HANDOFF_SOURCE:string,SANDBOX_ACCOUNT:string;
export const PAYMENT_POLICY:Readonly<Record<string,unknown>>;
export function canonicalHandoff(v:unknown):string;
export function handoffDigest(v:unknown):string;
export function parsePrepareRequest(v:unknown):any;
export function parseStatusRequest(v:unknown):any;
export function parseRenewRequest(v:unknown):any;
export function validatePrepareReceipt(v:unknown,input:unknown,config?:{origin?:string}):any;
export function validateStatusReceipt(v:unknown,input:unknown,previous?:unknown):any;
export function signHandoff(raw:string,timestamp:string,secret:string,path:string):string;
export function makePrepareFixture(options?:Record<string,unknown>):any;
