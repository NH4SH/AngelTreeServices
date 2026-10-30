export const FIREWOOD_STAGING: Readonly<{ mode:string; projectRef:string; databaseOrigin:string; siteId:string; portalOrigin:string; environmentId:string; accountId:string; sourceId:string }>;
export function isFirewoodStagingIdentity(env?:Record<string,string|undefined>):boolean;
