import {readFile} from 'node:fs/promises';
import {browserAssets} from '../../render/assets.mjs';
export async function assets(config){const result=await browserAssets();let html=result.get('/firewood/checkout/').body;
  html=html.replace('<meta name="referrer" content="no-referrer">','<meta name="referrer" content="same-origin">')
    .replace('Firewood checkout — isolated QA test','Firewood checkout')
    .replace('<p class="intro">Choose up to two cords, with optional stacking.</p>',
      '<p class="intro">Choose up to two cords, with optional stacking.</p><p class="field-help" id="household-note">Online orders are for personal household use. <a href="tel:+15403888715">Call (540) 388-8715 for business purchases.</a></p>')
    .replace('This test checkout needs JavaScript.','Online ordering needs JavaScript. Call (540) 388-8715 to order.')
    .replace('<p id="loading" role="status">Loading the test checkout…</p>','<p id="loading" role="status">Loading your checkout…</p>')
    .replace('<p>Cancel at least 48 hours before your scheduled delivery for a full refund. Cancellations with less than 48 hours’ notice are non-refundable.</p>',
      '<p>Cancel at least 48 hours before the start of your agreed delivery window for a full refund. Cancellations with less notice are non-refundable.</p><p>You’ll also receive a full refund before delivery is scheduled, if Angel cancels or cannot fulfil your order, or if you decline a reschedule initiated by Angel.</p><p>For the residential veterans benefit, inform Angel before purchase so the office can agree your price. One discount applies.</p><p><a href="https://angeltreeservices.org/privacy/">Read our privacy policy</a></p><label class="stacking-choice"><input name="termsAccepted" type="checkbox" required><span>I confirm personal household use at the delivery address and have read the delivery and cancellation terms.</span></label>')
    .replace('Tax treatment is pending confirmation. No tax is calculated in this QA test.','No tax is added to qualifying household orders.')
    .replace('<p>No money was charged and no delivery was ordered. Your details have been removed from the form and saved in the private test order record.</p>','<p id="result-detail">Your order details are saved privately. You can call Angel about scheduling.</p>')
    .replace('Test payment complete.','Payment confirmation')
    .replace('View test confirmation','View order confirmation')
    .replace('Test total','Total')
    .replace('Start another test order','Start another order')
    .replace('This is a test, not a reservation or scheduled delivery.','Payment is processed securely by Stripe. Angel will contact you with a delivery date.')
    .replace('Isolated Firewood QA checkout.','Angel Tree Services Firewood checkout.');
  // A receipt URL itself never authorizes another customer's order or initiates
  // payment fulfillment. The API uses only the scoped HttpOnly session cookie.
  if(!config.sandbox){html=html.replace(/<div class="test-notice"[\s\S]*?<\/div>/u,'').replace(/<div class="test-tools"[\s\S]*?<\/div>/u,'');}
  if(!html.includes('name="termsAccepted"')||!html.includes('48 hours before the start')||!html.includes('inform Angel before purchase')||!html.includes('id="household-note"')||!html.includes('I confirm personal household use'))throw Error('confirmed_checkout_terms_template_required');
  for(const path of ['/firewood/checkout/','/firewood/checkout/result/'])result.set(path,{body:html,type:'text/html; charset=utf-8'});
  result.set('/firewood/checkout/checkout.js',{body:await readFile(new URL('./browser.js',import.meta.url),'utf8'),type:'text/javascript; charset=utf-8'});
  // The inherited label size is 15px. Keep actual fields at 16px or larger so
  // focusing them does not force iPhone Safari to zoom the layout.
  const css=result.get('/firewood/checkout/checkout.css');css.body+='\ninput:not([type=radio]):not([type=checkbox]),textarea{font-size:1rem;}\n';
  return result;
}
