import {fixture as legacyFixture,refund,dispute}from './firewood-import.mjs';
import {candidateDigest,candidateMetadata,policy,policyHash,SANDBOX_ACCOUNT}from '../../src/lib/firewood/candidate-contract.mjs';
export {refund,dispute};
export function fixture(quantity='full',stacking=false,office=false){
 const f=legacyFixture(quantity,stacking),i=f.input,o=i.order;
 delete o.tax_assumption;delete o.terms_version;
 Object.assign(i,{contract:'firewood-paid-order-v1',source_id:'website_firewood_candidate_v1',account_id:SANDBOX_ACCOUNT,mode:'sandbox',attempt_id:i.order_id,reference:'FW-'+i.order_id.slice(0,8).toUpperCase()});
 Object.assign(o,{tax_cents:0,tax_basis:'va_domestic_use_locality_exempt',terms:{...policy,hash:policyHash,accepted:true,householdUseConfirmed:true},accepted_at_ms:Date.now()-60000,office_approval:null});
 if(office){o.office_approval={approval_id:crypto.randomUUID(),approved_at_ms:o.accepted_at_ms-1000,residential:true,single_discount_confirmed:true};o.wood_cents=Math.round(o.wood_cents*.95);o.stacking_cents=stacking?10000:0;o.total_cents=o.wood_cents+o.stacking_cents;}
 i.snapshot_hash=candidateDigest(o);
 const s=f.state;s.account.id=SANDBOX_ACCOUNT;s.session.client_reference_id=i.order_id;s.session.metadata=candidateMetadata(i);s.intent.metadata=candidateMetadata(i);
 s.session.amount_total=s.session.amount_subtotal=s.intent.amount=s.intent.amount_received=s.intent.latest_charge.amount=s.intent.latest_charge.amount_captured=o.total_cents;
 const lines=s.session.line_items.data;lines[0].amount_subtotal=lines[0].amount_total=lines[0].price.unit_amount=o.wood_cents;
 if(stacking){lines[1].price.product.name='Stacking — once per delivery';lines[1].amount_subtotal=lines[1].amount_total=lines[1].price.unit_amount=o.stacking_cents;}
 return f;
}
