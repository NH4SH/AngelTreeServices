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
    files.set(path, { ...file, body: html });
  }
  files.set('/firewood/checkout/checkout.js', { body: await readFile(new URL('./browser.js', import.meta.url), 'utf8'), type: 'text/javascript; charset=utf-8' });
  const css = files.get('/firewood/checkout/checkout.css');
  files.set('/firewood/checkout/checkout.css', { ...css, body: css.body + '\n' + await readFile(new URL('./customer.css', import.meta.url), 'utf8') });
  return files;
}
