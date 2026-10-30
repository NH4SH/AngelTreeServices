'use client';
import {useEffect,useState} from 'react';
import {createRecordSearchSession,type RecordSearchState} from '@/lib/record-search-session';
import {commandSearchTerm} from '@/lib/record-search';
import {withDeadline} from '@/lib/runtime/deadline';
export function useRecordSearch(query:string,enabled:boolean) {
  const [state,setState]=useState<RecordSearchState>({query:'',status:'idle',results:[]});
  useEffect(()=>{
    const session=createRecordSearchSession(setState,async(term,signal)=>withDeadline(async bounded=>{
      const response=await fetch(`/api/admin/record-search?q=${encodeURIComponent(term)}`,{signal:bounded,cache:'no-store',credentials:'same-origin'});
      if(!response.ok)throw Error('Search unavailable');return (await response.json()).results;
    },6000,signal));
    session.update(query,enabled);return()=>session.close();
  },[query,enabled]);
  // Do not paint a previous query's private results while an effect catches up.
  if(!enabled)return{query:commandSearchTerm(query),status:'idle' as const,results:[]};
  return state.query===commandSearchTerm(query)?state:{query:commandSearchTerm(query),status:query.trim().length>=2&&enabled?'loading' as const:'idle' as const,results:[]};
}
