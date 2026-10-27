// Compare effective function privileges, not PostgreSQL's equivalent explicit
// default-ACL versus NULL representation. Bodies, owners and every grant remain
// part of the comparison; no permission difference is ignored.
import assert from 'node:assert/strict';import{isDeepStrictEqual}from'node:util';
export const functionMetadataSql=`set search_path=pg_catalog;select jsonb_agg(to_jsonb(x) order by schema,name,args) from(select n.nspname schema,p.proname name,pg_get_function_identity_arguments(p.oid) args,pg_get_userbyid(p.proowner) owner,p.proacl::text raw_acl,md5(pg_get_functiondef(p.oid)) definition,coalesce((select jsonb_agg(jsonb_build_array(pg_get_userbyid(a.grantor),case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,a.privilege_type,a.is_grantable) order by pg_get_userbyid(a.grantor),a.grantee=0,pg_get_userbyid(a.grantee),a.privilege_type,a.is_grantable) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a),'[]') grants from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','app_private') and p.prokind='f')x;`;
export const effectiveFunctions=rows=>rows.map(({raw_acl,...rest})=>rest);
export function compareRecoveredManifest(expected,actual,sourceFunctions,targetFunctions){
  const{functions:sourceRaw,...sourceRest}=expected,{functions:targetRaw,...targetRest}=actual;
  assert.ok(isDeepStrictEqual(sourceRest,targetRest),'Restored rows, table permissions or RLS differ; inspect private manifests.');
  assert.ok(isDeepStrictEqual(effectiveFunctions(sourceFunctions),effectiveFunctions(targetFunctions)),'Restored function bodies, owners or effective grants differ.');
  return{functionCount:sourceFunctions.length,rawAclRepresentationChanged:sourceRaw!==targetRaw,effectiveFunctionsMatched:true};
}
