export function handleHandoff(request:Request,deps:{config:any;db:any;now?:()=>number}):Promise<Response>;
export function makeCapability(key:Buffer,now?:number):any;
export function decryptCapability(value:string,key:Buffer):string;
