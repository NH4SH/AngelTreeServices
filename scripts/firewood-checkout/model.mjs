import facts from '../../public-firewood.json' with { type: 'json' };
import { createHash } from 'node:crypto';
import Stripe from 'stripe';
import { crmMetadata } from './crm.mjs';

export const STRIPE_API_VERSION = '2026-09-30.endive';

export const catalog = Object.freeze({
  currency: 'usd',
  quantities: [...facts.quantities.map(item => Object.freeze({
    id: item.label === 'Full cord' ? 'full' : 'half',
    label: item.label,
    cents: item.delivered_price * 100,
    deliveryCents: 0,
  })), Object.freeze({ id: 'two', label: 'Two cords', cents: 84000, deliveryCents: 0 })],
  stackingCents: facts.stacking_fee * 100,
  stackingAccess: facts.stacking_access,
});

export class CheckoutError extends Error {
  constructor(message, status = 400, field = null) { super(message); this.status = status; this.field = field; }
}

function text(value, label, max, required = true) {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b-\u001f\u007f]/u.test(value)) {
    throw new CheckoutError(`Please check ${label}.`);
  }
  const result = value.trim();
  if (required && !result) throw new CheckoutError(`Please enter ${label}.`);
  return result;
}

export function priceOrder(input) {
  const item = catalog.quantities.find(value => value.id === input?.quantity);
  if (!item || typeof input.stacking !== 'boolean') throw new CheckoutError('Choose a cord size and stacking option.');
  if (input.veteran !== undefined && input.veteran !== false) throw new CheckoutError('This checkout no longer accepts discount selections. Reload the checkout and try again.');
  const stackingCents = input.stacking ? catalog.stackingCents : 0;
  return {
    quantity: item.id, label: item.label, stacking: input.stacking,
    woodCents: item.cents, deliveryCents: item.deliveryCents, stackingCents,
    totalCents: item.cents + item.deliveryCents + stackingCents, currency: catalog.currency,
  };
}

export function validateOrder(input) {
  const quote = priceOrder(input);
  function field(name, label, max, required = true) {
    try { return text(input[name] ?? '', label, max, required); }
    catch (error) { error.field = name; throw error; }
  }
  const contact = {
    name: field('name', 'your name', 100),
    email: field('email', 'your email address', 254),
    phone: field('phone', 'your phone number', 30),
    address: field('address', 'the delivery street address', 150),
    address2: field('address2', 'the apartment or unit', 100, false),
    city: field('city', 'the delivery city', 100),
    state: field('state', 'the state abbreviation', 2).toUpperCase(),
    postal: field('postal', 'the ZIP code', 10),
    notes: field('notes', 'the delivery instructions', 500, false),
  };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(contact.email)) throw new CheckoutError('Please enter a valid email address.', 400, 'email');
  if (!/^[+()\d\s.\-]+$/u.test(contact.phone) || !/^1?\d{10}$/u.test(contact.phone.replace(/\D/gu, ''))) {
    throw new CheckoutError('Please enter a 10-digit phone number.', 400, 'phone');
  }
  if (!/^[A-Z]{2}$/u.test(contact.state)) throw new CheckoutError('Please enter a two-letter state abbreviation.', 400, 'state');
  if (!/^\d{5}(?:-\d{4})?$/u.test(contact.postal)) throw new CheckoutError('Please enter a valid ZIP code.', 400, 'postal');
  return { quote, contact };
}

export function testKey(value) {
  if (!value) return null;
  if (!/^(?:(?:sk|rk)_test_|rkcs_test_)[A-Za-z0-9]+$/u.test(value)) {
    throw new Error('Firewood checkout accepts only a dedicated Stripe TEST key. Live keys are refused.');
  }
  return value;
}

export function stripeParams(order, origin, reference, attempt = reference, binding = null) {
  const { quote } = order;
  const contact = binding?.order.contact ?? order.contact;
  const suffix = [...createHash('sha256').update(attempt).digest().subarray(0, 8)].map(value => String.fromCharCode(97 + value % 26)).join('');
  const params = {
    mode: 'payment',
    success_url: `${origin}/firewood/checkout/result/`,
    cancel_url: `${origin}/firewood/checkout/?canceled=1`,
    customer_email: contact.email,
    client_reference_id: reference,
    integration_identifier: `firewood-local-${suffix}`,
    metadata: { purpose: 'firewood_test_only', quantity: quote.quantity, stacking: String(quote.stacking), attempt, ...(binding ? crmMetadata(binding) : {}) },
    line_items: [{ price_data: { currency: quote.currency,
      product_data: { name: `${quote.label} of firewood — delivery included` },
      unit_amount: quote.woodCents }, quantity: 1 }],
    payment_intent_data: { ...(binding ? { metadata: crmMetadata(binding) } : {}), shipping: { name: contact.name, phone: contact.phone, address: {
      line1: contact.address, line2: contact.address2, city: contact.city,
      state: contact.state, postal_code: contact.postal, country: 'US',
    } } },
  };
  if (quote.stacking) {
    params.line_items.push({ price_data: { currency: quote.currency,
      product_data: { name: 'Stacking — one charge per delivery' },
      unit_amount: quote.stackingCents }, quantity: 1 });
  }
  return params;
}

export function stripeAdapter(key, fetcher = fetch) {
  const secret = testKey(key);
  if (!secret) throw new Error('A dedicated Stripe test key is required.');
  const client = new Stripe(secret, { apiVersion: STRIPE_API_VERSION,
    httpClient: Stripe.createFetchHttpClient(fetcher), maxNetworkRetries: 0, timeout: 15000 });
  async function call(operation) {
    let data;
    try { data = await operation(); }
    catch { throw new CheckoutError('The test payment service could not complete this step. Your details are still here; please try again.', 502); }
    if (!data || data.livemode !== false || !/^cs_test_/u.test(data.id)) {
      throw new CheckoutError('The test payment service did not return a valid test session. No order was placed.', 502);
    }
    return data;
  }
  let accountId;
  async function requireAccount(binding) {
    if (!binding) return;
    if (!accountId) { try { accountId = (await client.accounts.retrieve()).id; } catch { throw new CheckoutError('The dedicated Stripe test account could not be verified.', 502); } }
    if (accountId !== binding.account_id) throw new CheckoutError('The configured Stripe test account does not match the CRM test connection.', 503);
  }
  async function state(id, total, reference, attempt, binding = null) {
    await requireAccount(binding);
    if (!/^cs_test_[A-Za-z0-9_]+$/u.test(id)) throw new CheckoutError('Invalid test payment session.');
    const session = await call(() => client.checkout.sessions.retrieve(id));
    if (session.amount_total !== total || session.currency !== 'usd' || session.client_reference_id !== reference ||
        session.metadata?.purpose !== 'firewood_test_only' || (attempt !== undefined && session.metadata?.attempt !== attempt)) throw new CheckoutError('The test payment does not match this order.', 502);
    if (binding && Object.entries(crmMetadata(binding)).some(([key, value]) => session.metadata?.[key] !== value)) throw new CheckoutError('The test payment does not match the saved CRM order.', 502);
    const intentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
    return { intentId, paid: session.status === 'complete' && session.payment_status === 'paid',
      expired: session.status === 'expired', closed: session.status === 'complete' };
  }
  return {
    async create(order, origin, reference, attempt, binding = null) {
      await requireAccount(binding);
      const session = await call(() => client.checkout.sessions.create(stripeParams(order, origin, reference, attempt, binding), { idempotencyKey: attempt }));
      const url = new URL(session.url);
      if (url.origin !== 'https://checkout.stripe.com' || !url.pathname.includes('/cs_test_')) {
        throw new CheckoutError('An unexpected payment destination was refused.', 502);
      }
      return { id: session.id, url: url.href };
    },
    state,
    async paid(id, total, reference, attempt, binding) { return (await state(id, total, reference, attempt, binding)).paid; },
    verifyEvent(payload, signature, signingSecret) {
      if (!signingSecret || !/^whsec_[A-Za-z0-9]+$/u.test(signingSecret)) throw new CheckoutError('The local test webhook is not configured.', 503);
      let event;
      try { event = client.webhooks.constructEvent(payload, signature, signingSecret); }
      catch { throw new CheckoutError('Invalid test webhook signature.', 400); }
      if (event.livemode !== false) throw new CheckoutError('Live webhook events are refused.', 400);
      return event;
    },
  };
}
