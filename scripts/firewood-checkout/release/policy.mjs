import { LIVE_CATALOG, LIVE_TERMS_HASH, LIVE_PAYMENT_POLICY_HASH, LIVE_ACCEPTED_TERMS,
  priceLiveOrder } from '../live/live-contract.mjs';
import { CheckoutError } from '../production/runtime/policy.mjs';
import { assertLiveClient } from './live-client.mjs';
export { CheckoutError };
export const catalog = Object.freeze({ currency: 'usd', stackingCents: LIVE_CATALOG.stacking_cents,
  quantities: LIVE_CATALOG.quantities.map(q => Object.freeze({ id: q.id, label: q.label, cents: q.wood_cents, deliveryCents: 0 })),
  stackingAccess: 'The stacking location must be accessible by wheelbarrow and within a reasonable distance of the truck.' });
const contactKeys = ['name', 'email', 'phone', 'address', 'address2', 'city', 'state', 'postal', 'notes'];
const inputKeys = [...contactKeys, 'quantity', 'stacking', 'termsAccepted', 'householdUseConfirmed', 'termsHash', 'paymentPolicyHash', 'csrf'];
export function orderInput(input, client) {
  assertLiveClient(client);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new CheckoutError('Please check your order.', 400);
  if (input.assistedQuote !== undefined || input.officeApproval !== undefined || input.office_approval !== undefined)
    throw new CheckoutError('Contact Angel before purchasing to use an office-approved price.', 409);
  if (Object.keys(input).some(key => !inputKeys.includes(key))) throw new CheckoutError('Reload the checkout before sending this order.', 400);
  if (input.termsAccepted !== true || input.householdUseConfirmed !== true)
    throw new CheckoutError('Confirm household use and acknowledge the payment, delivery and cancellation terms.', 400, 'termsAccepted');
  if (input.termsHash !== LIVE_TERMS_HASH || input.paymentPolicyHash !== LIVE_PAYMENT_POLICY_HASH)
    throw new CheckoutError('The order terms have changed. Reload and review them before continuing.', 409, 'termsAccepted');
  let amount;
  try { amount = priceLiveOrder(input); } catch { throw new CheckoutError('Choose a cord size and stacking option.', 400, 'quantity'); }
  const values = Object.fromEntries(contactKeys.map(key => [key, input[key] ?? '']));
  let contact;
  try { contact = client.normalizeContact(values); }
  catch { throw new CheckoutError('Please check your email, phone and Virginia delivery address.', 400); }
  return { quote: { quantity: amount.quantity, label: catalog.quantities.find(q => q.id === amount.quantity).label,
    stacking: amount.stacking, woodCents: amount.wood_cents, deliveryCents: 0, stackingCents: amount.stacking_cents,
    totalCents: amount.principal_cents, currency: 'usd' }, contact, terms: structuredClone(LIVE_ACCEPTED_TERMS) };
}
