import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import {load} from './pr10-test-helpers.mjs';
import {communicationReadFixture} from './communication-read-fixture.mjs';

const tokens=load('../src/lib/portal/tokens.ts',{'server-only':{},'node:crypto':crypto});
export function syntheticTokenCodec(key=crypto.randomBytes(32).toString('base64')) {
  function underKey(action) {
    const previous=process.env.PORTAL_TOKEN_ENCRYPTION_KEY;
    process.env.PORTAL_TOKEN_ENCRYPTION_KEY=key;
    try { return action(); }
    finally {
      if(previous===undefined)delete process.env.PORTAL_TOKEN_ENCRYPTION_KEY;
      else process.env.PORTAL_TOKEN_ENCRYPTION_KEY=previous;
    }
  }
  return {key,hashPortalToken:tokens.hashPortalToken,
    encryptPortalToken:raw=>underKey(()=>tokens.encryptPortalToken(raw)),
    decryptPortalToken:value=>underKey(()=>tokens.decryptPortalToken(value))};
}

export function reminderLinkReadFixture(options={}) {
  const codec=syntheticTokenCodec(options.syntheticKey),linkReads=[];
  const tokenReader=load('../src/lib/portal/document-token.ts',{'server-only':{},'@/lib/portal/tokens':{
    hashPortalToken:codec.hashPortalToken,decryptPortalToken:value=>options.noKey?null:codec.decryptPortalToken(value),
  }});
  const portal=load('../src/lib/communications/portal-links.ts',{'server-only':{},'@/lib/portal/document-token':tokenReader,
    '@/lib/security/app-base-url':{getCanonicalAppBaseUrl:()=>options.noHost?null:'https://crm.example.invalid'},
  });
  const f=communicationReadFixture({...options,portalOverride:options.portalOverride??portal});
  const kind=f.row.communication_type==='quote_follow_up'?'quote':'invoice';
  const table=kind+'_portal_tokens',column=kind+'_id',sourceId=f.row[column];
  const raw=options.rawToken??crypto.randomBytes(32).toString('base64url');
  const record=f.tables[kind==='quote'?'quotes':'invoices'].find(row=>row.id===sourceId);
  record.customer_id??=null;
  record.organization_id??=null;
  f.tables[table]??=[{id:crypto.randomUUID(),[column]:sourceId,customer_id:record.customer_id??null,
    organization_id:record.organization_id??null,token_hash:codec.hashPortalToken(raw),
    token_encrypted:codec.encryptPortalToken(raw).encryptedToken,expires_at:null,revoked_at:null,
    created_at:new Date().toISOString(),...options.token}];
  if(options.token)f.tables[table]=f.tables[table].map(row=>row[column]===sourceId?{...row,...options.token}:row);
  const from=f.db.from.bind(f.db);
  f.db.from=name=>{
    if(!name.endsWith('_portal_tokens')) {
      const query=from(name),select=query.select.bind(query),read=query.maybeSingle.bind(query);let selected='';
      query.select=(columns,...args)=>{selected=columns;return select(columns,...args);};
      query.maybeSingle=async()=>{
        const result=await read();
        if(selected==='customer_id, organization_id') {
          linkReads.push({table:name,source:true});
          if(options.linkFault==='source-throw')throw Error('PRIVATE_SYNTHETIC_LINK_DIAGNOSTIC');
          if(options.linkFault?.startsWith('source-'))return {data:options.linkFault==='source-data-error'?result.data:null,error:{message:'PRIVATE_SYNTHETIC_LINK_DIAGNOSTIC'}};
        }
        return result;
      };
      return query;
    }
    let filters=[];
    const query={select(){return query;},eq(key,value){filters.push(row=>row[key]===value);return query;},
      is(key,value){filters.push(row=>row[key]===value);return query;},
      or(expression){assert.match(expression,/^expires_at.is.null,expires_at.gt\./);filters.push(row=>row.expires_at===null||Date.parse(row.expires_at)>Date.now());return query;},
      order(){return query;},limit(n){assert.equal(n,1);return query;},
      async maybeSingle(){
        linkReads.push({table:name,source:false});
        if(options.linkFault==='token-throw')throw Error('PRIVATE_SYNTHETIC_LINK_DIAGNOSTIC');
        const data=options.missingToken?null:(f.tables[name]??[]).filter(row=>filters.every(test=>test(row)))[0]??null;
        if(options.linkFault?.startsWith('token-'))return {data:options.linkFault==='token-data-error'?data:null,error:{message:'PRIVATE_SYNTHETIC_LINK_DIAGNOSTIC'}};
        return {data,error:null};
      }};
    return query;
  };
  return {...f,kind,raw,codec,linkReads,portal,tokenTable:table,get acks(){return f.acks;}};
}
