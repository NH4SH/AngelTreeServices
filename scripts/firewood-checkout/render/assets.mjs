import { readFile } from 'node:fs/promises';

// Reuse the reviewed browser interface without exporting the local simulator,
// public website, analytics, consent scripts, or any CRM assets.
export async function browserAssets(source = new URL('../',import.meta.url)) {
  let html = await readFile(new URL('checkout.html',source),'utf8');
  let js = await readFile(new URL('checkout.js',source),'utf8');
  const paymentSection = /    <section id="payment-view"[\s\S]*?<\/section>\n/u;
  if (!paymentSection.test(html)) throw new Error('checkout_template_changed');
  html = html.replace(paymentSection,'').replace(' — local test',' — isolated QA test')
    .replace('<link rel="stylesheet" href="/assets/css2.css">','<link rel="stylesheet" href="/firewood/checkout/fonts.css">')
    .replaceAll('href="/firewood/"','href="https://angeltreeservices.org/firewood/"')
    .replace('in this local test','in this QA test').replace('Local firewood checkout preview.','Isolated Firewood QA checkout.');
  const start = js.indexOf('  async function simulate(outcome) {'), end = js.indexOf('  // A fresh test clears');
  const branchStart = js.indexOf("      if (location.pathname.endsWith('/payment/')"), branchEnd = js.indexOf('      renderOrder();',branchStart);
  if (start<0 || end<start || branchStart<0 || branchEnd<branchStart) throw new Error('checkout_script_changed');
  js = js.slice(0,start)+js.slice(end);
  js = js.slice(0,branchStart)+js.slice(branchEnd);
  const assets = new Map([
    ['/firewood/checkout/',{body:html,type:'text/html; charset=utf-8'}],
    ['/firewood/checkout/result/',{body:html,type:'text/html; charset=utf-8'}],
    ['/firewood/checkout/checkout.js',{body:js,type:'text/javascript; charset=utf-8'}],
    ['/firewood/checkout/checkout.css',{body:await readFile(new URL('checkout.css',source),'utf8'),type:'text/css; charset=utf-8'}],
    ['/firewood/checkout/enlarged.css',{body:await readFile(new URL('enlarged.css',source),'utf8'),type:'text/css; charset=utf-8'}],
  ]);
  let fontCss='';
  for(const [weight,name] of [[400,'poppins-400.3dc5d0c524.woff2'],[500,'poppins-500.289e0afc8b.woff2'],[700,'poppins-700.197a3cbd72.woff2']]) {
    assets.set(`/firewood/checkout/fonts/${name}`,{body:await readFile(new URL(`./fonts/${name}`,import.meta.url)),type:'font/woff2'});
    fontCss+=`@font-face{font-family:Poppins;font-style:normal;font-weight:${weight};font-display:swap;src:url('/firewood/checkout/fonts/${name}') format('woff2');}\n`;
  }
  assets.set('/firewood/checkout/fonts.css',{body:fontCss,type:'text/css; charset=utf-8'});
  return assets;
}
