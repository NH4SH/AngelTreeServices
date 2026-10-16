import { commandSearchTerm, recordSearchHref, recordSearchTypes, type RecordSearchResult } from './record-search.ts';
export type RecordSearchState={query:string;status:'idle'|'loading'|'ready'|'error';results:RecordSearchResult[]};
export function parseRecordSearchResults(value:unknown):RecordSearchResult[] {
  if(!Array.isArray(value)||value.length>20)throw Error('Invalid results');
  return value.map(row=>{
    if(!row||!recordSearchTypes.includes(row.recordType)||typeof row.id!=='string'||typeof row.title!=='string'||typeof row.detail!=='string')throw Error('Invalid result');
    const href=recordSearchHref(row.recordType,row.id);if(!href)throw Error('Invalid result');
    return{id:row.id,recordType:row.recordType,title:row.title.slice(0,180),detail:row.detail.slice(0,180),href};
  });
}
// Closing the palette or changing text invalidates the response even if a
// transport ignores cancellation. Nothing is cached across palette sessions.
export function createRecordSearchSession(publish:(state:RecordSearchState)=>void,request:(query:string,signal:AbortSignal)=>Promise<unknown>,delay=200) {
  let revision=0,timer:ReturnType<typeof setTimeout>|undefined,controller:AbortController|undefined,closed=false;
  function update(raw:string,enabled=true) {
    const current=++revision,query=commandSearchTerm(raw);clearTimeout(timer);controller?.abort();
    if(closed)return;
    if(!enabled||query.length<2){publish({query,status:'idle',results:[]});return;}
    publish({query,status:'loading',results:[]});
    timer=setTimeout(async()=>{
      controller=new AbortController();
      try{const results=parseRecordSearchResults(await request(query,controller.signal));if(!closed&&current===revision)publish({query,status:'ready',results});}
      catch{if(!closed&&current===revision)publish({query,status:'error',results:[]});}
    },delay);
  }
  return{update,close(){closed=true;revision++;clearTimeout(timer);controller?.abort();}};
}
