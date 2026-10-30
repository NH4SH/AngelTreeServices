(() => {
  'use strict';
  const get=id=>document.getElementById(id),form=get('order-form');
  const money=c=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(c/100);
  let state,busy=false,polls=0;
  window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
  async function api(path,data){const r=await fetch('/firewood/checkout/api/'+path,{method:data?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify({...data,csrf:state.csrf}):undefined});
    let v;try{v=await r.json();}catch{throw Error('The connection was interrupted. Your entered details are still here. Please try again.');}
    if(!r.ok){const e=Error(v.error||'Checkout is temporarily unavailable. Please try again or call Angel.');e.field=v.field;throw e;}return v;}
  function clearError(field){if(!(field instanceof HTMLElement)||!field.name)return;get(field.name+'-error')?.remove();field.removeAttribute('aria-invalid');
    const ids=(field.getAttribute('aria-describedby')||'').split(' ').filter(x=>x&&x!==field.name+'-error');if(ids.length)field.setAttribute('aria-describedby',ids.join(' '));else field.removeAttribute('aria-describedby');}
  function error(e){get('form-error').textContent=e.message;get('form-error').hidden=false;const f=form.elements.namedItem(e.field??'');
    if(!(f instanceof HTMLElement)){get('form-error').focus();return;}clearError(f);const el=document.createElement('span');el.id=f.name+'-error';el.className='error field-error';el.textContent=e.message;f.insertAdjacentElement('afterend',el);f.setAttribute('aria-invalid','true');f.setAttribute('aria-describedby',((f.getAttribute('aria-describedby')||'')+' '+el.id).trim());f.focus();}
  function summary(){const q=state.catalog.quantities.find(x=>x.id===form.elements.quantity.value),stack=form.elements.stacking.checked;
    const approved=state.assistedQuote;
    get('summary-quantity').textContent=q.label;get('summary-wood').textContent=money(approved?.woodCents??q.cents);get('summary-delivery').textContent='Included';get('summary-stacking-row').hidden=!stack;
    get('summary-stacking').textContent=money(approved?.stackingCents??state.catalog.stackingCents);get('summary-total').value=money(approved?.totalCents??q.cents+(stack?state.catalog.stackingCents:0));get('stacking-help').hidden=!stack;}
  function formView(){get('quantity-options').replaceChildren();
    for(const q of state.catalog.quantities){const label=document.createElement('label');label.className='quantity-choice';const radio=document.createElement('input');radio.type='radio';radio.name='quantity';radio.value=q.id;radio.checked=q.id==='half';
      const group=document.createElement('span'),title=document.createElement('strong'),price=document.createElement('span');title.textContent=q.label;price.className='detail';price.textContent=money(q.cents)+' delivered';group.append(title,price);
      const saving={full:25,two:30}[q.id];if(saving&&!state.assistedQuote){const note=document.createElement('span');note.className='quantity-saving';note.textContent='Save '+saving+'% ('+money((q.id==='two'?120000:60000)-q.cents)+')';group.append(note);}label.append(radio,group);get('quantity-options').append(label);}
    if(state.order){form.elements.quantity.value=state.order.quote.quantity;form.elements.stacking.checked=state.order.quote.stacking;for(const [k,v] of Object.entries(state.order.contact))if(form.elements[k])form.elements[k].value=v;form.elements.termsAccepted.checked=state.order.termsAccepted===true&&state.order.householdUseConfirmed===true;}
    if(state.assistedQuote){form.elements.quantity.value=state.assistedQuote.quantity;form.elements.stacking.checked=state.assistedQuote.stacking;for(const f of form.querySelectorAll('[name="quantity"],[name="stacking"]'))f.disabled=true;get('quantity-savings-note').textContent='Your office-approved price is shown in the order total. Contact Angel before paying if you need to change the amount or stacking.';}
    get('stacking-price').textContent='+'+money(state.catalog.stackingCents);get('stacking-help').textContent=state.catalog.stackingAccess;
    get('order-view').hidden=false;get('continue').disabled=state.paused;get('continue').textContent=state.paused?'Ordering paused':state.sandbox?'Continue to test payment':'Continue to secure payment';summary();
    if(state.paused){get('return-note').hidden=false;get('return-note').textContent='Online ordering is paused. Call (540) 388-8715 for availability.';}
    else if(location.search.includes('canceled')){get('return-note').hidden=false;get('return-note').textContent='You returned without completing payment. Your order details are still here.';}
  }
  async function start(){try{const quote=new URLSearchParams(location.search).get('quote');state=await api('state'+(quote?'?quote='+encodeURIComponent(quote):''));get('loading').hidden=true;
    if(get('test-notice'))get('test-notice').textContent='Sandbox checkout. Use made-up details only. No real charge or delivery; email and CRM sending are off.';
    if(get('processor-note'))get('processor-note').textContent='Stripe sandbox';
    if(['paid','refunded'].includes(state.status)){get('result-view').hidden=false;get('order-view').hidden=true;const cancelled=state.receipt.fulfillment==='cancelled',review=state.receipt.refundStatus==='review',pending=state.receipt.refundStatus==='pending';get('result-title').textContent=review?'Refund needs attention':pending?'Refund pending':state.status==='refunded'?'Order refunded':cancelled?'Order cancelled':state.sandbox?'Sandbox payment confirmed':'Thank you for your order';
      get('result-summary').textContent=state.receipt.label+(state.receipt.stacking?' with stacking':' delivered')+' · '+money(state.receipt.totalCents);get('order-reference').textContent='Order reference: '+state.receipt.orderNumber;
      get('result-detail').textContent=review?'Angel needs to check the refund status. Please call (540) 388-8715 for an update. Do not pay again.':pending?'Your refund is still processing. Contact Angel if you need an update.':state.sandbox?'This is a saved sandbox order. No real money was charged and no delivery will be arranged.':state.status==='refunded'?'Stripe has confirmed the full refund. Contact Angel if you need an update.':cancelled?'Your order is cancelled under the non-refundable cancellation terms.':'Your order is saved. Angel will contact you with a delivery date within one week of ordering.';get('result-title').focus();
      try{const p=await api('confirmation');get('confirmation-status').textContent=p.status==='captured'?'Saved for review; no email sent.':p.status==='accepted'?'Email accepted by the sender.':'Confirmation processing is pending.';get('confirmation-subject').textContent=p.confirmation?.subject||'';get('confirmation-text').textContent=p.confirmation?.text||'';}catch{get('confirmation-status').textContent='Your order is saved. Reload to check the confirmation.';}return;}
    if(location.pathname.endsWith('/result/')){get('order-view').hidden=true;get('loading').hidden=false;get('loading').textContent='Checking your payment confirmation. Please do not pay again. If it remains pending, call (540) 388-8715.';
      if(++polls<20)setTimeout(start,2000);return;}
    formView();
  }catch(e){get('loading').hidden=false;get('loading').textContent=e.message+' Reload to check again.';}}
  form.addEventListener('change',summary);form.addEventListener('input',e=>clearError(e.target));
  form.addEventListener('submit',async e=>{e.preventDefault();if(busy||!form.reportValidity())return;busy=true;[...form.elements].forEach(clearError);get('form-error').hidden=true;get('continue').disabled=true;get('continue').textContent='Opening secure payment…';
    const input=Object.fromEntries(new FormData(form));input.quantity=form.elements.quantity.value;input.stacking=form.elements.stacking.checked;input.termsAccepted=form.elements.termsAccepted.checked;input.householdUseConfirmed=form.elements.termsAccepted.checked;
    const quote=new URLSearchParams(location.search).get('quote');if(quote)input.assistedQuote=quote;
    try{const v=await api('start',input);location.assign(v.next);}catch(e){error(e);}finally{busy=false;get('continue').disabled=false;get('continue').textContent=state.sandbox?'Continue to test payment':'Continue to secure payment';}});
  get('example')?.addEventListener('click',()=>{for(const [k,v] of Object.entries({name:'Sandbox Customer',email:'sandbox@example.invalid',phone:'2025550142',address:'123 Example Lane',address2:'',city:'Fredericksburg',state:'VA',postal:'22401',notes:'Synthetic sandbox order only; no dispatch.'}))form.elements[k].value=v;});
  get('result-view').querySelector('a').addEventListener('click',async e=>{e.preventDefault();try{await api('reset',{});location.assign('/firewood/checkout/');}catch(e){get('result-summary').textContent=e.message;}});
  start();
})();
