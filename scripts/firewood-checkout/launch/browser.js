(() => {
  'use strict';
  const get=id=>document.getElementById(id),form=get('order-form');
  const money=c=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(c/100);
  let state,busy=false,polls=0,timer;
  window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
  async function api(path,data){
    const r=await fetch('/firewood/checkout/api/'+path,{method:data?'POST':'GET',credentials:'same-origin',cache:'no-store',
      headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify({...data,csrf:state.csrf}):undefined});
    let value;try{value=await r.json();}catch{throw Error('The connection was interrupted. Your details are still saved. Please check again.');}
    if(!r.ok){const e=Error(value.error||'This step is unavailable. Please check again or call Angel.');e.field=value.field;throw e;}return value;
  }
  function clearError(field){if(!(field instanceof HTMLElement)||!field.name)return;get(field.name+'-error')?.remove();field.removeAttribute('aria-invalid');
    const ids=(field.getAttribute('aria-describedby')||'').split(' ').filter(x=>x&&x!==field.name+'-error');if(ids.length)field.setAttribute('aria-describedby',ids.join(' '));else field.removeAttribute('aria-describedby');}
  function showError(e,saved=false){const target=get(saved?'saved-error':'form-error');target.textContent=e.message;target.hidden=false;
    const field=saved?null:form.elements.namedItem(e.field??'');if(!(field instanceof HTMLElement)){target.focus();return;}
    clearError(field);const el=document.createElement('span');el.id=field.name+'-error';el.className='error field-error';el.textContent=e.message;field.insertAdjacentElement('afterend',el);
    field.setAttribute('aria-invalid','true');field.setAttribute('aria-describedby',((field.getAttribute('aria-describedby')||'')+' '+el.id).trim());field.focus();
  }
  function summary(){if(!state||state.order)return;const q=state.catalog.quantities.find(x=>x.id===form.elements.quantity.value),stack=form.elements.stacking.checked;
    get('summary-quantity').textContent=q.label;get('summary-wood').textContent=money(q.cents);get('summary-delivery').textContent='Included';
    get('summary-stacking-row').hidden=!stack;get('summary-stacking').textContent=money(state.catalog.stackingCents);get('summary-total').value=money(q.cents+(stack?state.catalog.stackingCents:0));get('stacking-help').hidden=!stack;
  }
  function draftView(){get('result-view').hidden=true;get('order-view').hidden=false;
    if(!get('quantity-options').children.length)for(const q of state.catalog.quantities){const label=document.createElement('label');label.className='quantity-choice';
      const radio=document.createElement('input');radio.type='radio';radio.name='quantity';radio.value=q.id;radio.checked=q.id==='half';
      const group=document.createElement('span'),title=document.createElement('strong'),price=document.createElement('span');title.textContent=q.label;price.className='detail';price.textContent=money(q.cents)+' delivered';group.append(title,price);
      const saving={full:25,two:30}[q.id];if(saving){const note=document.createElement('span');note.className='quantity-saving';note.textContent='Save '+saving+'% ('+money((q.id==='two'?120000:60000)-q.cents)+')';group.append(note);}label.append(radio,group);get('quantity-options').append(label);
    }
    get('stacking-price').textContent='+'+money(state.catalog.stackingCents);get('stacking-help').textContent=state.catalog.stackingAccess;
    get('continue').disabled=state.paused;get('continue').textContent=state.paused?'Ordering paused':'Continue to payment options';
    get('return-note').hidden=!state.paused;get('return-note').textContent=state.paused?'Online ordering is paused. Call (540) 388-8715 for availability.':'';summary();
  }
  function savedView(){const order=state.order,p=state.payment;
    get('order-view').hidden=true;get('result-view').hidden=false;get('result-title').textContent='Your saved order';
    get('result-summary').textContent=order.quote.label+(order.quote.stacking?' with stacking':' delivered')+' · Order subtotal '+money(order.quote.totalCents);
    get('order-reference').textContent='Order reference: '+order.orderNumber;
    get('saved-delivery').textContent='Delivery to '+order.contact.address+(order.contact.address2?', '+order.contact.address2:'')+', '+order.contact.city+', '+order.contact.state+' '+order.contact.postal+'. Contact: '+order.contact.email+'.';
    get('saved-instructions').textContent=order.contact.notes?'Delivery instructions: '+order.contact.notes:'';
    let detail='Your order is saved. Payment options are being prepared. Check again shortly.';
    if(p){detail={unpaid:'Payment has not been completed. You can choose a payment option for this same order.',failed:'Payment was not completed. Your order is saved; check payment options before trying again.',
      processing:'Your payment is processing. Please do not pay again. Delivery can be arranged after payment clears.',
      offline_pending:'Your payment preference is saved. Payment is still outstanding; contact Angel to arrange your check or pickup.',
      paid:'Payment is recorded. This sandbox order will not schedule a real delivery.',partially_paid:'A partial payment is recorded. Contact Angel before making another payment.',
      partially_refunded:'A partial refund is recorded. Contact Angel if you need an update; do not pay again.',refunded:'The refund is recorded. Contact Angel if you need an update; do not pay again.',
      disputed:'This payment needs office review. Please contact Angel; do not pay again.',void:'This invoice is closed. Please contact Angel about ordering.'}[p.payment_state]||detail;}
    if(state.preparation==='review')detail='Your order is saved and needs office review before payment. Contact Angel; please do not start another order.';
    else if(state.verificationPending)detail='Your saved payment status is being checked. Please do not start another order or pay again.';
    else if(p?.review_required)detail='Angel needs to review this payment. Your order is saved. Please contact the office before paying again.';
    get('result-detail').textContent=detail;
    get('paid-breakdown').hidden=!p;
    if(p){get('paid-balance-row').hidden=p.review_required||['refunded','partially_refunded','disputed','void'].includes(p.payment_state);get('paid-principal').textContent=money(p.totals.invoice_principal_cents);get('paid-fee').textContent=money(p.totals.surcharge_collected_cents);
      get('paid-gross').textContent=money(p.totals.gross_collected_cents);get('paid-refund').textContent=money(p.totals.gross_refunded_cents);get('paid-balance').textContent=money(p.totals.balance_due_cents);}
    get('resume-payment').hidden=state.verificationPending||state.preparation!=='prepared'||!p||p.original_paid_evidence!==null||p.payment_pending||p.review_required||!['unpaid','failed','offline_pending'].includes(p.payment_state);
    get('resume-payment').textContent=state.paymentExecutionReady?'Choose payment option':'Check payment options';
    get('saved-help').textContent='Your accepted quantity, price and delivery details are fixed to this invoice. Call Angel if you need a change.';
    if(++polls<20&&(state.preparation==='pending'||state.verificationPending||p?.payment_pending))timer=setTimeout(load,3000);
    api('confirmation').then(v=>{get('confirmation-status').textContent=v.status==='captured'?'Saved for test review; no email sent.':'Order confirmation will appear after verified payment.';
      get('confirmation-subject').textContent=v.confirmation?.subject||'';get('confirmation-text').textContent=v.confirmation?.text||'';}).catch(()=>{get('confirmation-status').textContent='Check again to view the saved confirmation.';});
  }
  async function load(){clearTimeout(timer);try{state=await api('state');get('loading').hidden=true;
    get('test-notice').textContent='Sandbox checkout. Use made-up details only. Live payments and email sending are off.';get('processor-note').textContent='Stripe sandbox';
    if(state.order)savedView();else draftView();
  }catch(e){get('loading').hidden=false;get('loading').textContent=e.message+' Reload to check again.';}}
  form.addEventListener('change',summary);form.addEventListener('input',e=>clearError(e.target));
  form.addEventListener('submit',async e=>{e.preventDefault();if(busy||!form.reportValidity())return;busy=true;get('form-error').hidden=true;[...form.elements].forEach(clearError);
    const input=Object.fromEntries(new FormData(form));input.quantity=form.elements.quantity.value;input.stacking=form.elements.stacking.checked;input.termsAccepted=form.elements.termsAccepted.checked;input.householdUseConfirmed=form.elements.termsAccepted.checked;
    const fields=[...form.elements].filter(x=>!x.disabled);for(const field of fields)field.disabled=true;get('continue').textContent='Saving your order…';
    try{await api('start',input);await load();get('result-title').focus();}
    catch(e){try{const saved=await api('state');if(saved.order){state=saved;savedView();get('result-title').focus();}else showError(e);}catch{showError(e);}}
    finally{busy=false;for(const field of fields)field.disabled=false;get('continue').disabled=state.paused;get('continue').textContent='Continue to payment options';}
  });
  get('example')?.addEventListener('click',()=>{for(const [k,v] of Object.entries({name:'Sandbox Customer',email:'sandbox@example.invalid',phone:'2025550142',address:'123 Example Lane',address2:'',city:'Fredericksburg',state:'VA',postal:'22401',notes:'Synthetic sandbox order only; no dispatch.'}))form.elements[k].value=v;});
  get('refresh-order').addEventListener('click',()=>{polls=0;get('saved-error').hidden=true;load();});
  get('resume-payment').addEventListener('click',async()=>{if(busy)return;busy=true;get('resume-payment').disabled=true;get('saved-error').hidden=true;
    try{const v=await api('resume',{});location.assign(v.next);}catch(e){showError(e,true);}finally{busy=false;get('resume-payment').disabled=false;}
  });
  load();
})();
