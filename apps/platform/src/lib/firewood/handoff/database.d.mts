export function databaseError(error:unknown):Error;
export function nativeDatabase(pool:any):{call(name:string,args:Record<string,unknown>):Promise<any>};
export function supabaseDatabase(client:any):{call(name:string,args:Record<string,unknown>):Promise<any>};
