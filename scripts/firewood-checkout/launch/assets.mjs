import {assets as existingAssets} from '../production/runtime/assets.mjs';
import {readFile} from 'node:fs/promises';

// An opt-in view for the new invoice-before-payment flow. The installed v1
// runtime does not import this file or acquire a new payment capability.
export async function handoffAssets(config){
  if(config?.sandbox!==true)throw Error('handoff_preview_only');
  const files=await existingAssets(config);
  const options=`<section class="payment-options" aria-labelledby="payment-options-title">
    <h2 id="payment-options-title">Payment options</h2>
    <dl>
      <div><dt>Bank account</dt><dd>Pay securely by ACH. Bank payments can take several business days to clear.</dd></div>
      <div><dt>Debit or credit card</dt><dd>A 3% merchant surcharge applies to eligible credit-card payments. Debit and prepaid cards are not surcharged.</dd></div>
      <div><dt>Cash or check</dt><dd>Arrange pickup with the office, or send a check using the payment-page instructions.</dd></div>
    </dl>
    <p>You’ll choose your payment method and review any fee and the final total before authorizing payment. An unpaid order or saved payment preference does not schedule delivery.</p>
  </section>`;
  for(const path of ['/firewood/checkout/','/firewood/checkout/result/']){
    const file=files.get(path);let html=file.body;
    if(!html.includes('<section class="order-terms"')||!html.includes('<dt>Total</dt>'))throw Error('handoff_template_anchor_missing');
    html=html.replace('<section class="order-terms"',options+'<section class="order-terms"')
      .replace('I confirm personal household use at the delivery address and have read the delivery and cancellation terms.','I confirm personal household use at the delivery address and have read the payment, delivery and cancellation terms.')
      .replace('<dt>Total</dt>','<dt>Order subtotal</dt>')
      .replace('<button class="primary" id="continue"','<p class="field-help" id="payment-fee-note">Any eligible credit-card surcharge is shown separately on the next step.</p><button class="primary" id="continue"')
      .replace('<a class="primary" href="/firewood/checkout/">Start another order</a>',`<p id="saved-delivery"></p><p id="saved-instructions"></p>
        <dl id="paid-breakdown" hidden><div><dt>Order subtotal</dt><dd id="paid-principal"></dd></div><div><dt>Credit-card surcharge collected</dt><dd id="paid-fee"></dd></div><div><dt>Total payment collected</dt><dd id="paid-gross"></dd></div><div><dt>Total refunded</dt><dd id="paid-refund"></dd></div><div id="paid-balance-row"><dt>Order balance</dt><dd id="paid-balance"></dd></div></dl>
        <p id="saved-help" class="field-help"></p><p id="saved-error" class="error" role="alert" tabindex="-1" hidden></p>
        <div class="payment-actions"><button class="primary" id="resume-payment" type="button" hidden>Choose payment option</button><button class="text-button" id="refresh-order" type="button">Check order status</button><a href="tel:+15403888715">Contact Angel</a></div>`);
    if(!html.includes('id="resume-payment"'))throw Error('saved_order_anchor_missing');
    files.set(path,{...file,body:html});
  }
  files.set('/firewood/checkout/checkout.js',{body:await readFile(new URL('./browser.js',import.meta.url),'utf8'),type:'text/javascript; charset=utf-8'});
  const css=files.get('/firewood/checkout/checkout.css');
  css.body+='\n.payment-options{margin:0 0 32px;padding:24px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);}.payment-options h2{margin:0 0 16px;}.payment-options dl>div{display:block;margin:0 0 16px;}.payment-options dt{font-weight:600;}.payment-options dd{margin:4px 0 0;text-align:left;white-space:normal;font-size:.9375rem;}.payment-options p{margin:20px 0 0;font-size:.9375rem;}.payment-actions>a{display:inline-flex;align-items:center;min-height:44px;}#paid-breakdown{max-width:40rem;margin-top:24px;}\n';
  return files;
}
