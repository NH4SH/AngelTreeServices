import { readFile } from 'node:fs/promises';
import { liveAssets } from '../live/assets.mjs';
export async function customerAssets() {
  const files = await liveAssets();
  const office = `<details class="office-review-help" id="office-help"><summary>Need an office-approved price?</summary>
    <p>Contact Angel before purchasing to arrange an eligible veterans discount or another office-approved price.</p>
    <p>Send your quantity and delivery details for office review. This saves a request; it does not place an order.</p>
    <button class="secondary" type="button" id="request-office">Request office price review</button>
  </details>
  <section id="office-review" class="office-review" aria-labelledby="office-review-title" hidden>
    <h2 id="office-review-title" tabindex="-1">Your office price review</h2><p id="office-message" role="status"></p>
    <p id="office-reference"></p><p id="office-expiry" class="field-help"></p>
    <div class="office-actions"><button class="text-button" type="button" id="refresh-office">Check office review</button>
      <button class="text-button" type="button" id="edit-office">Edit request details</button>
      <button class="text-button" type="button" id="standard-price">Use standard pricing</button></div>
  </section>`;
  for (const path of ['/firewood/checkout/', '/firewood/checkout/result/']) {
    const file = files.get(path); let html = file.body;
    if (!html.includes('<section class="payment-options"') || !html.includes('<details class="confirmation-preview">')) throw Error('customer_template_anchor_missing');
    html = html.replace('<section class="payment-options"', office + '<section class="payment-options"')
      .replace('<noscript>', '<button id="retry-load" class="secondary" type="button" hidden>Try again</button><noscript>')
      .replace(/<details class="confirmation-preview">[\s\S]*?<\/details>/u, '')
      .replace('<div id="paid-balance-row">', '<div id="cancellation-credit-row" hidden><dt>Cancellation credit</dt><dd id="cancellation-credit"></dd></div><div id="paid-balance-row">')
      .replace('<dt>Order balance</dt>', '<dt>Amount owed</dt>')
      .replace('<p id="saved-help"', '<p id="credit-note" class="field-help" hidden>This credit closes the amount owed. Any refund is shown separately above.</p><p id="saved-help"')
      .replace('<p id="saved-help"', '<p class="field-help">The payment page provides your payment receipt. Keep this page to check your order.</p><p id="saved-help"');
    // Progressive disclosure changes presentation only. Accepted policy clauses,
    // required acknowledgement, field names and every payment control remain.
    html = html.replace('<h1>Order your firewood.</h1>', '<h1 id="checkout-title">Order your firewood.</h1>')
      .replace('<p class="intro">', '<p class="intro" id="checkout-intro">')
      .replace(/<section class="payment-options"([^>]*)>\s*<h2[^>]*>Payment options<\/h2>([\s\S]*?)<\/section>/u,
        '<details class="payment-options checkout-disclosure"$1><summary id="payment-options-title">How payment works</summary>$2</details>')
      .replace(/(<h2 id="terms-title">Payment, delivery and cancellation terms<\/h2>)([\s\S]*?)(<label class="stacking-choice"><input name="termsAccepted")/u,
        '<details class="checkout-disclosure terms-disclosure"><summary id="terms-title">Payment, delivery &amp; cancellation terms</summary>$2</details>$3')
      .replace(/<p class="field-help" id="quantity-savings-note">([\s\S]*?)<\/p>/u,
        '<details class="savings-help" id="quantity-savings-note"><summary>About the savings</summary><p class="field-help">$1</p></details>');
    const unit = html.match(/<label class="wide"><span id="label-address2">[\s\S]*?<\/label>/u)?.[0];
    const instructions = html.match(/<label class="wide"><span id="label-notes">[\s\S]*?<\/label>/u)?.[0];
    if (!unit || !instructions) throw Error('optional_delivery_fields_anchor_missing');
    html = html.replace(unit, '').replace(instructions,
      `<details class="checkout-disclosure optional-delivery wide"><summary>Apartment, unit or delivery instructions</summary>${unit}${instructions.replace('aria-describedby="notes-help"', 'aria-describedby="delivery-instructions-help"')}<p class="field-help" id="delivery-instructions-help">Tell us where the wood should go and anything useful about access.</p></details>`)
      .replace(/\s*<p class="field-help" id="notes-help">[\s\S]*?<\/p>/u, '');
    // Saved orders lead with status and the safe next action, not repeated terms.
    html = html.replace(/<section id="result-view"[\s\S]*?<\/section>/u, `<section id="result-view" hidden aria-labelledby="result-title">
      <h1 id="result-title" tabindex="-1">Your order</h1>
      <p id="order-reference" class="field-help"></p><p id="result-summary" class="saved-order-total"></p>
      <p id="result-detail" role="status"></p><p id="crm-status" hidden></p>
      <p id="saved-error" class="error" role="alert" tabindex="-1" hidden></p>
      <div class="payment-actions"><button class="primary" id="resume-payment" type="button" hidden>Choose payment option</button><button class="text-button" id="refresh-order" type="button">Check order status</button><a href="tel:+15403888715">Contact Angel</a></div>
      <details class="checkout-disclosure saved-details"><summary>Delivery details</summary><p id="saved-delivery"></p><p id="saved-instructions"></p><p id="saved-help" class="field-help"></p></details>
      <details class="checkout-disclosure saved-details" id="payment-details" hidden><summary>Payment details</summary>
        <dl id="paid-breakdown" hidden><div><dt>Order subtotal</dt><dd id="paid-principal"></dd></div><div><dt>Credit-card surcharge collected</dt><dd id="paid-fee"></dd></div><div><dt>Total payment collected</dt><dd id="paid-gross"></dd></div><div><dt>Total refunded</dt><dd id="paid-refund"></dd></div><div id="cancellation-credit-row" hidden><dt>Cancellation credit</dt><dd id="cancellation-credit"></dd></div><div id="paid-balance-row"><dt>Amount owed</dt><dd id="paid-balance"></dd></div></dl>
        <p id="credit-note" class="field-help" hidden>This credit closes the amount owed. Any refund is shown separately above.</p>
        <p class="field-help">The payment page provides your payment receipt.</p>
      </details>
      <p class="field-help saved-retain">Keep this page to check this order.</p>
    </section>`);
    files.set(path, { ...file, body: html });
  }
  files.set('/firewood/checkout/checkout.js', { body: await readFile(new URL('./browser.js', import.meta.url), 'utf8'), type: 'text/javascript; charset=utf-8' });
  const css = files.get('/firewood/checkout/checkout.css');
  files.set('/firewood/checkout/checkout.css', { ...css, body: css.body + '\n' + await readFile(new URL('./customer.css', import.meta.url), 'utf8') });
  return files;
}
