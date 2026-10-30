import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { commandSearchTerm, escapeSearchLike, recordSearchHref, recordSearchTypes, type RecordSearchResult } from '@/lib/record-search';
import { withDeadline } from '@/lib/runtime/deadline';

// Only minimal display fields are fetched. Search text contains internal fields
// and monetary values, so it must never become a result snippet.
const selections = {
  customer: ['customers', 'id,display_name,phone'],
  organization: ['organizations', 'id,name,billing_phone'],
  job: ['jobs', 'id,service_type,status,customers!jobs_customer_id_fkey(display_name),organizations(name),location:service_locations!jobs_service_location_id_fkey(street)'],
  quote: ['quotes', 'id,quote_number,status,customers!quotes_customer_id_fkey(display_name),organizations(name)'],
  invoice: ['invoices', 'id,invoice_number,status,customers!invoices_customer_id_fkey(display_name),organizations(name)'],
} as const;
export async function searchCommandRecords(db: SupabaseClient, raw: string, outerSignal?: AbortSignal) {
  const query=commandSearchTerm(raw);
  if(query.length<2)return [] as RecordSearchResult[];
  return withDeadline(async signal=>{
    // Queries share one bounded/cancellable request budget.
    const groups=await Promise.all(recordSearchTypes.map(async recordType=>{
      let request=db.from('admin_record_search').select('record_id').eq('record_type',recordType).is('archived_at',null);
      for(const term of query.split(' ').slice(0,6)) request=request.ilike('search_text',`%${escapeSearchLike(term)}%`);
      const found=await request.order('created_at',{ascending:false}).order('record_id').limit(4).abortSignal(signal);
      if(found.error)throw Error('Search unavailable');
      const ids=(found.data??[]).map(row=>row.record_id);if(!ids.length)return [];
      const [table,fields]=selections[recordType];
      const hydrated=await db.from(table).select(fields).in('id',ids).is('archived_at',null).abortSignal(signal);
      if(hydrated.error)throw Error('Search unavailable');
      return ids.flatMap(id=>{
        const row=(hydrated.data??[]).find((value:any)=>value.id===id) as any;
        const href=recordSearchHref(recordType,id);if(!row||!href)return [];
        const party=row.organizations?.name??row.customers?.display_name??'';
        const title=recordType==='customer'?row.display_name:recordType==='organization'?row.name:recordType==='quote'?row.quote_number||'Quote':recordType==='invoice'?row.invoice_number||(row.status==='draft'?'Draft invoice':'Invoice'):row.service_type&&row.service_type!=='other'?row.service_type.replaceAll('_',' '):'Work order';
        const detail=recordType==='customer'?row.phone??'Customer':recordType==='organization'?row.billing_phone??'Organization':[party,recordType==='job'?row.location?.street:null,row.status?.replaceAll('_',' ')].filter(Boolean).join(' · ');
        return [{id,recordType,title:String(title).slice(0,180),detail:String(detail).slice(0,180),href}];
      });
    }));
    return groups.flat();
  },4000,outerSignal);
}
