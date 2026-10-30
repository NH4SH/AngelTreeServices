(() => {
  'use strict';
  const get = id => document.getElementById(id), form = get('order-form');
  const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
  const customerFields = ['quantity', 'stacking', 'name', 'email', 'phone', 'address', 'address2', 'city', 'state', 'postal', 'notes'];
  let state, busy = false, mode = 'standard', selectedMode = false, hydrated = false, shownQuote = null, polls = 0, timer, uncertain = false, generation = 0;
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  async function api(action, input) {
    const abort = new AbortController(), timeout = setTimeout(() => abort.abort(), 30000);
    try {
      const response = await fetch('/firewood/checkout/api/' + action, { method: input ? 'POST' : 'GET',
        credentials: 'same-origin', cache: 'no-store', signal: abort.signal,
        headers: input ? { 'Content-Type': 'application/json' } : {}, body: input ? JSON.stringify({ ...input, csrf: state.csrf }) : undefined });
      let value; try { value = await response.json(); } catch { throw Error('The connection was interrupted. Check the saved order before trying again.'); }
      if (!response.ok) { const error = Error(value.error || 'This step could not be confirmed. Check again or contact Angel.'); error.field = value.field; throw error; }
      return value;
    } catch (error) {
      if (['AbortError', 'TypeError'].includes(error?.name)) throw Error('The connection was interrupted. Keep this page open and check the order before sending again.');
      throw error;
    } finally { clearTimeout(timeout); }
  }
  function showError(error) {
    const saved = !!state?.order, target = get(saved ? 'saved-error' : 'form-error');
    target.textContent = error.message || 'The connection was interrupted. Your details are still here. Check again.';
    target.hidden = false; target.focus();
    const field = !saved && form.elements.namedItem(error.field ?? '');
    if (field instanceof HTMLElement && !field.disabled) { field.setAttribute('aria-invalid', 'true'); field.focus(); }
  }
  function values() {
    return Object.fromEntries(customerFields.map(name => [name, name === 'stacking' ? form.elements.stacking.checked : form.elements[name].value]));
  }
  function hydrate(draft) {
    form.elements.quantity.value = draft.quantity; form.elements.stacking.checked = draft.stacking;
    for (const [name, value] of Object.entries(draft.contact)) if (form.elements[name]) form.elements[name].value = value;
    hydrated = true;
  }
  function amount() {
    const quantity = state.catalog.quantities.find(q => q.id === form.elements.quantity.value), approved = mode === 'office' && state.officeDraft?.status === 'approved';
    const prices = approved ? state.officeDraft.prices : { wood_cents: quantity.cents,
      stacking_cents: form.elements.stacking.checked ? state.catalog.stackingCents : 0 };
    get('summary-title').textContent = approved ? 'Office-approved order' : 'Your order';
    get('summary-quantity').textContent = quantity.label; get('summary-wood').textContent = money(prices.wood_cents);
    get('summary-delivery').textContent = 'Included'; get('summary-stacking-row').hidden = !form.elements.stacking.checked;
    get('summary-stacking').textContent = money(prices.stacking_cents); get('summary-total').value = money(prices.wood_cents + prices.stacking_cents);
    get('quantity-savings-note').hidden = approved;
    for (const choice of get('quantity-options').children) {
      const radio = choice.querySelector('input'), q = state.catalog.quantities.find(q => q.id === radio.value);
      choice.querySelector('.detail').textContent = approved && radio.checked ? money(prices.wood_cents) + ' office-approved' : money(q.cents) + ' delivered';
      const saving = choice.querySelector('.quantity-saving'); if (saving) saving.hidden = approved;
    }
    get('stacking-price').textContent = '+' + money(approved && form.elements.stacking.checked ? prices.stacking_cents : state.catalog.stackingCents);
    get('stacking-help').hidden = !form.elements.stacking.checked;
  }
  function draftView() {
    get('order-view').hidden = false; get('result-view').hidden = true;
    if (!get('quantity-options').children.length) for (const q of state.catalog.quantities) {
      const label = document.createElement('label'); label.className = 'quantity-choice';
      const radio = document.createElement('input'); radio.type = 'radio'; radio.name = 'quantity'; radio.value = q.id; radio.checked = q.id === 'half';
      const group = document.createElement('span'), title = document.createElement('strong'), price = document.createElement('span');
      title.textContent = q.label; price.className = 'detail'; price.textContent = money(q.cents) + ' delivered'; group.append(title, price);
      const saving = { full: 25, two: 30 }[q.id]; if (saving) { const note = document.createElement('span'); note.className = 'quantity-saving';
        note.textContent = 'Save ' + saving + '% (' + money((q.id === 'two' ? 120000 : 60000) - q.cents) + ')'; group.append(note); }
      label.append(radio, group); get('quantity-options').append(label);
    }
    if (state.officeDraft && !selectedMode) mode = 'office';
    if (state.officeDraft && !hydrated && mode === 'office') hydrate(state.officeDraft.draft);
    const locked = mode === 'office', review = state.officeDraft, approved = locked && review?.status === 'approved';
    if (locked && shownQuote !== review?.quoteReviewHash) { form.elements.termsAccepted.checked = false; shownQuote = review?.quoteReviewHash ?? null; }
    for (const field of form.elements) if (customerFields.includes(field.name)) field.disabled = busy || locked;
    get('stacking-price').textContent = '+' + money(state.catalog.stackingCents); get('stacking-help').textContent = state.catalog.stackingAccess;
    get('office-help').hidden = locked;
    get('office-review').hidden = !review && mode !== 'editing';
    get('office-reference').textContent = review ? 'Request reference: ' + review.reference : '';
    get('office-message').textContent = mode === 'editing' ? 'Review your details, then send the request. Changed details need a new office review.'
      : !locked ? 'You are continuing with standard pricing.'
      : { pending: 'Your request is saved for office review. No order has been placed. Check again after speaking with Angel.',
        approved: 'The office has approved the price shown in your order summary. Review your delivery details and the terms before accepting.',
        revoked: 'This office price is no longer available. Contact Angel for a current price, or choose standard pricing.',
        expired: 'This office price has expired. Contact Angel for a current price, or choose standard pricing.',
        unconfirmed: 'Your request is saved, but a current office price could not be confirmed. Check again or contact Angel.' }[review?.status] || '';
    get('office-expiry').textContent = approved ? 'Price approval expires ' + new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' }).format(new Date(review.expiresAt)) + ' Eastern time.' : '';
    get('refresh-office').hidden = mode !== 'office'; get('edit-office').hidden = mode !== 'office'; get('standard-price').hidden = mode === 'standard';
    get('request-office').textContent = mode === 'editing' ? 'Send updated request' : 'Request office price review';
    get('continue').disabled = busy || uncertain || state.paused || mode === 'editing' || locked && !approved;
    get('continue').textContent = state.paused ? 'Ordering paused' : locked ? approved ? 'Accept price and continue' : 'Awaiting office review'
      : state.officeDraft ? 'Continue at standard price' : 'Continue to payment options';
    get('return-note').hidden = !state.paused; get('return-note').textContent = state.paused ? 'Online ordering is paused. Contact Angel for availability.' : '';
    get('request-office').disabled = busy || uncertain || state.paused;
    amount();
    if (mode === 'office' && ['pending', 'unconfirmed'].includes(review?.status) && ++polls < 20) timer = setTimeout(load, 5000);
    else if (approved) timer = setTimeout(load, Math.min(2147483647, Math.max(1000, Date.parse(review.expiresAt) - Date.now() + 100)));
  }
  function savedView() {
    const { order, payment: p } = state;
    get('order-view').hidden = true; get('result-view').hidden = false; get('result-title').textContent = 'Your saved order';
    get('result-summary').textContent = order.quote.label + (order.quote.stacking ? ' with stacking' : ' delivered') + ' · Order subtotal ' + money(order.quote.totalCents);
    get('order-reference').textContent = 'Order reference: ' + order.reference;
    const c = order.contact;
    get('saved-delivery').textContent = 'Delivery to ' + c.address + (c.address2 ? ', ' + c.address2 : '') + ', ' + c.city + ', ' + c.state + ' ' + c.postal + '. Contact: ' + c.email + '.';
    get('saved-instructions').textContent = c.notes ? 'Delivery instructions: ' + c.notes : '';
    let detail = 'Your order is saved. Payment options are being prepared. Check again shortly.';
    if (p) detail = { unpaid: 'Payment has not been completed. Choose a payment option for this same order.',
      failed: 'Payment was not completed. Check this order’s payment options before trying again.',
      processing: 'Your payment or refund is processing. Please do not pay again. Delivery remains on hold until it is confirmed.',
      offline_pending: 'Your payment preference is saved. Payment is still outstanding; contact Angel to arrange your check or pickup.',
      paid: 'Payment is recorded. Angel will contact you with a delivery date.',
      partially_paid: 'A partial payment is recorded. Contact Angel before making another payment.',
      partially_refunded: 'A partial refund is recorded. Contact Angel for an update; do not pay again.',
      refunded: 'The refund is recorded. Contact Angel for an update; do not pay again.',
      disputed: 'This payment needs office review. Please do not pay again.', void: 'This invoice is closed. Contact Angel about ordering.' }[p.state] || detail;
    if (state.preparation === 'review') detail = 'Your saved order needs office review before payment. Contact Angel; please do not start another order.';
    else if (state.verificationPending) detail = 'Your saved order status could not be confirmed. Check again before making any payment; do not start another order.';
    else if (p?.accounting.creditRecorded) detail = p.orderState === 'cancelled'
      ? 'Your order is cancelled. A cancellation credit has closed the amount owed. Refunds are shown separately below.'
      : 'A cancellation credit has closed the amount owed. Angel is finalizing the cancellation. Please do not pay again.';
    else if (p?.orderState === 'cancellation_requested') detail = 'Cancellation has been requested. Angel is reviewing the order and any payment or refund. Please do not pay again.';
    else if (p?.orderState === 'cancelled') detail = 'Your order is cancelled. The payment details below show the recorded outcome. Contact Angel if you need help.';
    else if (p?.review) detail = 'Angel needs to review this payment or refund. Please contact the office before paying again.';
    get('result-detail').textContent = detail;
    get('paid-breakdown').hidden = !p;
    get('cancellation-credit-row').hidden = !p?.accounting.creditRecorded; get('credit-note').hidden = !p?.accounting.creditRecorded;
    if (p) { get('paid-principal').textContent = money(p.totals.invoice_principal_cents); get('paid-fee').textContent = money(p.totals.surcharge_collected_cents);
      get('paid-gross').textContent = money(p.totals.gross_collected_cents); get('paid-refund').textContent = money(p.totals.gross_refunded_cents);
      get('cancellation-credit').textContent = money(p.accounting.creditCents);
      get('paid-balance').textContent = money(p.accounting.balanceDueCents); get('paid-balance-row').hidden = !p.accounting.creditRecorded
        && (p.orderState !== 'active' || p.review || ['void', 'refunded', 'partially_refunded', 'disputed'].includes(p.state)); }
    get('resume-payment').hidden = uncertain || !state.canCheckPayment; get('resume-payment').disabled = busy;
    get('resume-payment').textContent = state.paymentExecutionReady ? 'Choose payment option' : 'Check payment options';
    get('saved-help').textContent = 'Your accepted quantity, price and delivery details are saved to this order. Contact Angel before changing them.';
    if (++polls < 20 && (state.preparation === 'pending' || state.verificationPending || p?.pending)) timer = setTimeout(load, 5000);
  }
  function render() {
    clearTimeout(timer); if (!state) return;
    if (state.connectionVersion !== 'firewood-office-live-v2') {
      uncertain = true; get('order-view').hidden = true; get('result-view').hidden = true;
      get('loading').hidden = false; get('loading').textContent = 'The checkout has changed. Reload this page before continuing.';
      get('retry-load').hidden = false; return;
    }
    if (state.payment && (!state.payment.accounting || !Number.isSafeInteger(state.payment.accounting.creditCents)
      || !Number.isSafeInteger(state.payment.accounting.balanceDueCents) || typeof state.payment.accounting.creditRecorded !== 'boolean')) {
      state.payment = null; state.verificationPending = true; state.canCheckPayment = false;
    }
    const terms = get('order-terms'), stale = state.termsHash !== terms.dataset.termsHash || state.paymentPolicyHash !== terms.dataset.paymentPolicyHash;
    if (stale && !state.order) { uncertain = true; showError(Error('The order terms have changed. Reload and review them before continuing.')); }
    if (state.order) savedView(); else draftView();
    for (const id of ['refresh-office', 'edit-office', 'standard-price', 'refresh-order', 'retry-load']) get(id).disabled = busy;
  }
  async function load() {
    if (busy) return; clearTimeout(timer); const current = ++generation;
    try { const next = await api('state'); if (current !== generation || busy) return; state = next; uncertain = false; get('loading').hidden = true; get('retry-load').hidden = true;
      get('form-error').hidden = true; get('saved-error').hidden = true; render(); }
    catch (error) { if (current !== generation || busy) return; uncertain = true; get('retry-load').hidden = false;
      if (state) { render(); showError(error); } else get('loading').textContent = 'The checkout could not be loaded. Try again, or contact Angel.'; }
  }
  function acceptance() { return { termsAccepted: form.elements.termsAccepted.checked, householdUseConfirmed: form.elements.termsAccepted.checked,
    termsHash: get('order-terms').dataset.termsHash, paymentPolicyHash: get('order-terms').dataset.paymentPolicyHash }; }
  async function write(action, input, label, focusId) {
    if (busy) return; busy = true; generation++; get('form-error').hidden = true; get('saved-error').hidden = true; clearTimeout(timer);
    const controls = [...form.elements, get('resume-payment')], before = controls.map(field => field.disabled);
    for (const field of controls) field.disabled = true;
    const button = get(action === 'office-request' ? 'request-office' : action === 'resume' ? 'resume-payment' : 'continue');
    button.textContent = label; button.setAttribute('aria-busy', 'true');
    let error;
    try {
      const result = await api(action, input);
      if (action === 'resume' && result.next) {
        const url = new URL(result.next); if (url.origin !== 'https://admin.angeltreeservices.org' || !/^\/portal\/invoice\/[A-Za-z0-9_-]{40,200}$/.test(url.pathname) || url.search || url.hash || url.username || url.password) throw Error('The payment link could not be confirmed. Contact Angel.');
        location.assign(url.href); return;
      }
      if (action === 'office-request') { mode = 'office'; selectedMode = true; hydrated = false; shownQuote = null; polls = 0; }
      state = await api('state'); uncertain = false; get('retry-load').hidden = true;
      if (action === 'resume' && result.held && state.canCheckPayment) error = Error('Your order is saved. Payment options are not available yet. Check again shortly or contact Angel.');
    } catch (caught) {
      error = caught;
      try { state = await api('state'); uncertain = false;
        if (state.order && action !== 'resume') error = null;
        else if (action === 'office-request') {
          // A recovered state can belong to an older request. Keep the current
          // form editable rather than replacing it or accepting its old price.
          mode = 'editing'; selectedMode = true; hydrated = true; get('office-help').open = true;
        }
      } catch { uncertain = true; get('retry-load').hidden = false; }
    } finally {
      busy = false; controls.forEach((field, i) => { field.disabled = before[i]; }); button.removeAttribute('aria-busy'); render();
      if (error) showError(error); else get(state?.order ? 'result-title' : focusId)?.focus();
    }
  }
  form.addEventListener('input', event => { event.target.removeAttribute('aria-invalid'); });
  form.addEventListener('change', () => { if (state && !state.order) amount(); });
  form.addEventListener('submit', event => {
    event.preventDefault(); if (busy || uncertain || get('continue').disabled || !form.reportValidity()) return;
    if (mode === 'office') write('office-accept', { ...acceptance(), quoteReviewHash: state.officeDraft.quoteReviewHash }, 'Saving your order…', 'result-title');
    else write('start', { ...values(), ...acceptance() }, 'Saving your order…', 'result-title');
  });
  get('request-office').addEventListener('click', () => {
    if (busy || uncertain) return;
    const terms = form.elements.termsAccepted, required = terms.required; terms.required = false;
    const valid = form.reportValidity(); terms.required = required;
    if (valid) write('office-request', values(), 'Sending request…', 'office-review-title');
  });
  get('edit-office').addEventListener('click', () => { if (busy) return; mode = 'editing'; selectedMode = true; clearTimeout(timer);
    form.elements.termsAccepted.checked = false; get('office-help').open = true; render(); form.elements.name.focus(); });
  get('standard-price').addEventListener('click', () => { if (busy) return; mode = 'standard'; selectedMode = true;
    form.elements.termsAccepted.checked = false; shownQuote = null; render(); get('summary-title').scrollIntoView({ block: 'nearest' }); get('continue').focus(); });
  for (const id of ['refresh-office', 'refresh-order', 'retry-load']) get(id).addEventListener('click', () => { if (busy) return; polls = 0; load(); });
  get('resume-payment').addEventListener('click', () => write('resume', {}, 'Checking payment options…', 'result-title'));
  load();
})();
