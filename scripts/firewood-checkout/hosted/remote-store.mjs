import { TEST_ORIGIN } from './runtime.mjs';
export const MAC_TEST_ORIGIN = 'http://127.0.0.1:56271';

// This client runs on the Mac's server, never in the browser or public bundle.
export function remoteOrderStore({ origin, token, fetcher = fetch } = {}) {
  if (![TEST_ORIGIN, MAC_TEST_ORIGIN].includes(origin) || !/^[a-f0-9]{64}$/u.test(token ?? '')) throw new Error('Only the dedicated Firewood test storage is permitted.');
  async function call(method, args) {
    const response = await fetcher(`${origin}${origin === MAC_TEST_ORIGIN ? '/storage' : '/.netlify/functions/storage'}`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(25000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ method, args }) });
    if (!response.ok) throw new Error('The hosted test storage could not complete this step.');
    return response.json();
  }
  const names = ['session','createSession','saveSession','forgetSession','purgeSessions','createAttempt','attempt','bindPayment','confirm','confirmations','findOrder','orders','crmSync','refreshCrm','retryCrm','work','summary'];
  const store = Object.fromEntries(names.map(name => [name, (...args) => call(name, args)]));
  store.drain = async () => {}; store.drainCrm = async () => {}; store.close = async () => {};
  store.confirmationMode = 'controlled-email';
  store.storageLocation = origin === MAC_TEST_ORIGIN ? 'home-macbook' : 'hosted-test';
  return store;
}
