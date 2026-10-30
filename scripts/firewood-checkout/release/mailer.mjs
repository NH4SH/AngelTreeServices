// Fixed Angel sender. The runtime reads the sending-only credential privately;
// this transport never reads environment files or exposes the credential.
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(value);
const owner = 'info@angeltreeservice.org';
export function orderMailer({ mode, key, customerSending = false, ownerSending = false, fetcher = fetch }) {
  if (!['controlled-test','live'].includes(mode) || !/^re_[A-Za-z0-9_]{12,}$/u.test(key ?? '') || typeof fetcher !== 'function'
    || mode === 'live' && (!customerSending || !ownerSending)) throw Error('explicit_order_sender_required');
  return Object.freeze({ async send(message, idempotencyKey, kind) {
    if (!/^fw-order-v2-[a-f0-9]{64}$/u.test(idempotencyKey ?? '') || !['customer_order','owner_order'].includes(kind)
      || message?.replyTo !== owner || typeof message.to !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(message.to)
      || kind === 'owner_order' && message.to !== owner || typeof message.subject !== 'string' || message.subject.length > 200
      || /[\r\n]/u.test(message.subject) || typeof message.text !== 'string' || message.text.length > 16000) throw Error('frozen_order_message_required');
    const testing = mode === 'controlled-test';
    const payload = { from: 'Angel Tree Services Firewood <orders@firewood.angeltreeservice.org>', to: [testing ? owner : message.to],
      reply_to: owner, subject: (testing ? '[Firewood test] ' : '') + message.subject,
      text: (testing ? 'Controlled Firewood test confirmation. No real order or payment.\n\n' : '') + message.text };
    let response;
    try { response = await fetcher('https://api.resend.com/emails', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(12000),
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', 'Idempotency-Key': (testing ? 'test-' : '') + idempotencyKey },
      body: JSON.stringify(payload) }); }
    catch { throw Error('order_confirmation_pending'); }
    if (!(response instanceof Response) || !response.ok) throw Error('order_confirmation_pending');
    const reader = response.body?.getReader(); if (!reader) throw Error('order_confirmation_unverified');
    const chunks = []; let bytes = 0;
    try { for (;;) { const item = await reader.read(); if (item.done) break; bytes += item.value.byteLength;
      if (bytes > 65536) throw Error('bounded_response'); chunks.push(Buffer.from(item.value)); }
      const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
      if (!uuid(value.id)) throw Error('unverified_id'); return value.id;
    } catch { throw Error('order_confirmation_unverified'); }
    finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
  } });
}
