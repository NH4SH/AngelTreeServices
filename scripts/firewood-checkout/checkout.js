(() => {
  'use strict';
  const get = id => document.getElementById(id);
  const form = get('order-form');
  const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(cents / 100);
  let state;
  let busy = false;
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  async function api(path, data) {
    const response = await fetch(`/firewood/checkout/api/${path}`, {
      method: data ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
      headers: data ? { 'Content-Type': 'application/json' } : {},
      body: data ? JSON.stringify({ ...data, csrf: state.csrf }) : undefined,
    });
    const value = await response.json();
    if (!response.ok) {
      const error = new Error(value.error || 'The test checkout is unavailable. Please try again.');
      error.field = value.field;
      throw error;
    }
    return value;
  }
  function clearFieldError(field) {
    if (!(field instanceof HTMLElement) || !field.name) return;
    const id = `${field.name}-error`;
    get(id)?.remove();
    field.removeAttribute('aria-invalid');
    const descriptions = (field.getAttribute('aria-describedby') || '').split(' ').filter(value => value && value !== id);
    if (descriptions.length) field.setAttribute('aria-describedby', descriptions.join(' '));
    else field.removeAttribute('aria-describedby');
  }
  function showError(error) {
    get('form-error').textContent = error.message;
    get('form-error').hidden = false;
    const field = typeof error.field === 'string' ? form.elements.namedItem(error.field) : null;
    if (!(field instanceof HTMLElement)) { get('form-error').focus(); return; }
    const message = document.createElement('span');
    message.id = `${field.name}-error`; message.className = 'error field-error'; message.textContent = error.message;
    field.insertAdjacentElement('afterend', message);
    field.setAttribute('aria-invalid', 'true');
    field.setAttribute('aria-describedby', `${field.getAttribute('aria-describedby') || ''} ${message.id}`.trim());
    field.focus();
  }
  function summary() {
    const item = state.catalog.quantities.find(x => x.id === form.elements.quantity.value);
    const stacking = form.elements.stacking.checked;
    const stackingCents = stacking ? state.catalog.stackingCents : 0;
    get('summary-quantity').textContent = item.label;
    get('summary-wood').textContent = money(item.cents);
    get('summary-delivery').textContent = item.deliveryCents ? money(item.deliveryCents) : 'Included';
    get('summary-stacking-row').hidden = !stacking;
    get('summary-stacking').textContent = money(state.catalog.stackingCents);
    get('summary-total').value = money(item.cents + item.deliveryCents + stackingCents);
    get('stacking-help').hidden = !stacking;
  }
  function renderOrder() {
    const choices = get('quantity-options');
    const halfCord = state.catalog.quantities.find(item => item.id === 'half');
    const halfCordCounts = { half: 1, full: 2, two: 4 };
    state.catalog.quantities.forEach((item, index) => {
      const label = document.createElement('label'); label.className = 'quantity-choice';
      const input = document.createElement('input'); input.type = 'radio'; input.name = 'quantity'; input.value = item.id; input.checked = index === 0;
      const description = document.createElement('span');
      const title = document.createElement('strong'); title.textContent = item.label;
      const price = document.createElement('span'); price.className = 'detail'; price.textContent = `${money(item.cents + item.deliveryCents)} delivered`;
      description.append(title, price);
      const comparisonCents = halfCord ? (halfCord.cents + halfCord.deliveryCents) * halfCordCounts[item.id] : 0;
      const savedCents = comparisonCents - item.cents - item.deliveryCents;
      if (savedCents > 0) {
        const savings = document.createElement('span'); savings.className = 'quantity-saving';
        const percent = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(savedCents / comparisonCents * 100);
        savings.textContent = `Save ${percent}% (${money(savedCents)})`;
        description.append(savings);
      }
      label.append(input, description); choices.append(label);
    });
    if (state.order) {
      form.elements.quantity.value = state.order.quote.quantity;
      form.elements.stacking.checked = state.order.quote.stacking;
      Object.entries(state.order.contact).forEach(([name, value]) => { if (form.elements[name]) form.elements[name].value = value; });
    }
    get('stacking-price').textContent = `+${money(state.catalog.stackingCents)}`;
    get('stacking-help').textContent = state.catalog.stackingAccess;
    get('processor-note').textContent = state.processor === 'stripe-test' ? 'Stripe test payments' : 'Local payment simulator';
    if (new URLSearchParams(location.search).has('canceled')) {
      get('return-note').hidden = false;
      get('return-note').textContent = state.order ? 'Payment canceled. Your order details are still here.' : 'This test session has ended. Enter your details to start a new test.';
    }
    get('order-view').hidden = false;
    summary();
  }
  async function start() {
    try {
      state = await api(`state${location.pathname.endsWith('/result/') ? '?verify=1' : ''}`);
      get('test-notice').textContent = 'Test checkout. Use made-up details only. No real payment or delivery. ' +
        (state.confirmationMode === 'controlled-email'
          ? `${state.storageLocation === 'home-macbook' ? 'Orders are saved on the home test MacBook.' : 'Orders are saved in isolated test storage.'} Controlled confirmation copies can be sent only to info@angeltreeservice.org.`
          : 'Test orders and confirmation previews are saved privately on this Mac; no email is sent.');
      get('loading').hidden = true;
      if (state.status === 'paid') {
        get('result-summary').textContent = `${state.receipt.label}${state.receipt.stacking ? ' with stacking' : ', delivery only'} · ${money(state.receipt.totalCents)} test total.`;
        get('order-reference').textContent = `Test order reference: ${state.receipt.orderNumber}`;
        if (state.crm) {
          get('crm-status').hidden = false;
          get('crm-status').textContent = state.crm.status === 'synced' ? `Saved CRM test invoice: ${state.crm.invoiceNumber}`
            : state.crm.status === 'review' ? 'Your test order is saved. Invoice sync needs office review. No further payment is needed.'
            : 'Your test order is saved. Invoice sync is pending; reload to check its status. No further payment is needed.';
        }
        get('result-view').hidden = false;
        get('result-title').focus();
        try {
          const preview = await api('confirmation');
          get('confirmation-status').textContent = preview.status === 'captured' ? 'Saved for review. No email was sent.'
            : preview.status === 'accepted' ? 'The email provider accepted a controlled test copy for the owner. This does not confirm inbox delivery.'
            : preview.status === 'review' ? 'Your test order is saved. Its confirmation needs review before another send attempt.'
            : 'Your test order is saved. Its confirmation is waiting for processing.';
          get('confirmation-subject').textContent = preview.confirmation?.subject || '';
          get('confirmation-text').textContent = preview.confirmation?.text || '';
        } catch { get('confirmation-status').textContent = 'Your test order is saved. Reload to try loading its confirmation again.'; }
        return;
      }
      if (location.pathname.endsWith('/payment/') && state.status === 'pending' && state.processor === 'local-simulator') {
        get('payment-summary').textContent = `${state.order.quote.label}${state.order.quote.stacking ? ' with stacking' : ', delivery only'} · ${money(state.order.quote.totalCents)} test total`;
        get('payment-view').hidden = false;
        return;
      }
      renderOrder();
      if (location.pathname.endsWith('/result/')) {
        get('return-note').hidden = false;
        get('return-note').textContent = 'No completed test payment was verified. You can return to the payment step below.';
      }
    } catch (error) {
      get('loading').textContent = `${error.message} Reload this page to try again.`;
    }
  }
  form.addEventListener('change', summary);
  form.addEventListener('input', event => clearFieldError(event.target));
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !form.reportValidity()) return;
    [...form.elements].forEach(clearFieldError);
    busy = true; get('continue').disabled = true; get('continue').textContent = 'Opening test payment…'; get('form-error').hidden = true;
    const values = Object.fromEntries(new FormData(form)); values.stacking = form.elements.stacking.checked;
    try { const result = await api('start', values); location.assign(result.next); }
    catch (error) { showError(error); }
    finally { busy = false; get('continue').disabled = false; get('continue').textContent = 'Continue to test payment'; }
  });
  get('example').addEventListener('click', () => {
    const example = { name: 'Test Customer', email: 'test@example.invalid', phone: '2025550142', address: '123 Example Lane', address2: '', city: 'Fredericksburg', state: 'VA', postal: '22401', notes: 'Synthetic test only. No delivery.' };
    Object.entries(example).forEach(([name, value]) => { form.elements[name].value = value; });
    get('return-note').hidden = false; get('return-note').textContent = 'Example details filled in. These are for testing only.';
  });
  async function simulate(outcome) {
    if (busy) return;
    busy = true;
    const buttons = [...get('payment-view').querySelectorAll('button')]; buttons.forEach(button => { button.disabled = true; });
    try {
      const result = await api('simulate', { outcome });
      if (result.declined) { get('payment-message').textContent = 'Test payment declined. Try again or return to your order; your details have been kept.'; }
      else location.assign(result.next);
    } catch (error) { get('payment-message').textContent = error.message; }
    finally { busy = false; buttons.forEach(button => { button.disabled = false; }); }
  }
  get('simulate-success').addEventListener('click', () => simulate('success'));
  get('simulate-decline').addEventListener('click', () => simulate('decline'));
  get('cancel-payment').addEventListener('click', () => location.assign('/firewood/checkout/?canceled=1'));
  // A fresh test clears browser authorization, but retains the private test order record.
  get('result-view').querySelector('a').addEventListener('click', async event => {
    event.preventDefault();
    try { await api('reset', {}); location.assign('/firewood/checkout/'); }
    catch (error) { get('result-summary').textContent = error.message; }
  });
  start();
})();
