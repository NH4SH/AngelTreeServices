import { readFile } from 'node:fs/promises';
import { handoffAssets } from '../launch/assets.mjs';
import { FIREWOOD_LIVE_REVIEW_PROFILE } from './live-profile.mjs';
import { LIVE_TERMS_POLICY, LIVE_TERMS_HASH, LIVE_PAYMENT_POLICY_HASH } from './contract.mjs';
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

// Rendering is pure and creates no production runtime or payment capability.
// Inherit the reviewed Poppins/green/cream interface; only the live copy differs.
export async function liveAssets(profile = FIREWOOD_LIVE_REVIEW_PROFILE) {
  if (profile !== FIREWOOD_LIVE_REVIEW_PROFILE || profile.runtimeLoadable !== false)
    throw Error('reviewed_live_surface_required');
  const files = await handoffAssets({ sandbox: true });
  const terms = `<section class="order-terms" id="order-terms" aria-labelledby="terms-title"
    data-terms-hash="${LIVE_TERMS_HASH}" data-payment-policy-hash="${LIVE_PAYMENT_POLICY_HASH}">
    <h2 id="terms-title">Payment, delivery and cancellation terms</h2>
    ${LIVE_TERMS_POLICY.clauses.map(clause => `<p><strong>${escape(clause.label)}.</strong> ${escape(clause.text)}</p>`).join('\n')}
    <p><a href="https://angeltreeservices.org/privacy/">Read our privacy policy</a></p>
    <label class="stacking-choice"><input name="termsAccepted" type="checkbox" required><span>I confirm personal household use at the delivery address and have read the payment, delivery and cancellation terms.</span></label>
  </section>`;
  for (const path of ['/firewood/checkout/', '/firewood/checkout/result/']) {
    const file = files.get(path);
    if (!/<section class="order-terms"[\s\S]*?<\/section>/u.test(file.body)) throw Error('live_terms_template_anchor_missing');
    const html = file.body.replace(/<div class="test-notice"[\s\S]*?<\/div>/u, '')
      .replace(/<div class="test-tools"[\s\S]*?<\/div>/u, '')
      .replace(/<section class="order-terms"[\s\S]*?<\/section>/u, terms);
    if (/sandbox|Use example details|Test checkout|isolated QA/iu.test(html)) throw Error('fixture_copy_in_live_surface');
    files.set(path, { ...file, body: html });
  }
  files.set('/firewood/checkout/checkout.js', { body: await readFile(new URL('./browser.js', import.meta.url), 'utf8'), type: 'text/javascript; charset=utf-8' });
  return files;
}
