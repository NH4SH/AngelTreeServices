import {createHash} from 'node:crypto';
import {catalog,validateOrder,CheckoutError} from '../../model.mjs';

export const policy=Object.freeze({version:'firewood-20261028-household-v2',currency:'usd',deliveryCents:0,stackingCents:15000,maximumCords:2,
  notificationDays:7,cancellationHours:48,cutoff:'delivery-window-start',unscheduledRefund:'full',angelCancellationRefund:'full',
  declinedAngelRescheduleRefund:'full',lateCustomerCancellation:'non-refundable',taxBasisPoints:0,purchaseUse:'personal-household-only',
  veterans:'Inform Angel before purchase; office-approved price; residential only; one discount.',timezone:'America/New_York'});
export const policyHash=createHash('sha256').update(JSON.stringify(policy)).digest('hex');
export {catalog,CheckoutError};
export function orderInput(input,{sandbox}) {
  if(input?.termsAccepted!==true)throw new CheckoutError('Please acknowledge the delivery and cancellation terms.',400,'termsAccepted');
  if(input.householdUseConfirmed!==true)throw new CheckoutError('Confirm personal household use at the delivery address. For business purchases, call (540) 388-8715.',400,'termsAccepted');
  const order=validateOrder(input);
  if(sandbox&&!/@[^@\s]+\.invalid$/iu.test(order.contact.email))throw new CheckoutError('Use a made-up .invalid email in this sandbox.',400,'email');
  return {...order,terms:{...policy,hash:policyHash,accepted:true,householdUseConfirmed:true}};
}
export function refundEligibility(order,reason,now) {
  if(order.payment_status!=='paid'||order.fulfillment==='delivered')return {eligible:false,code:'paid_undelivered_order_required'};
  if(['angel-cancels','cannot-fulfill','declined-angel-reschedule'].includes(reason))return {eligible:true,code:reason};
  if(reason!=='customer-cancels')return {eligible:false,code:'cancellation_reason_required'};
  return order.delivery_start===null||Number(order.delivery_start)-now>=48*3600000?
    {eligible:true,code:order.delivery_start===null?'before-scheduling':'at-least-48-hours'}:{eligible:false,code:'less-than-48-hours'};
}
