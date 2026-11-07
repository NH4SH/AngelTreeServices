import { openOrderStore, defaultDataDirectory } from './store.mjs';

// Local owner inspection only. Stop the preview first: the embedded database
// intentionally allows one process, and there is no public order-list API.
const store = await openOrderStore({ directory: defaultDataDirectory });
try {
  const retry = process.argv[2] === '--retry';
  const number = process.argv[retry ? 3 : 2];
  if (retry && !number) throw new Error('Specify the exact test order reference to retry.');
  if (!number) console.log(JSON.stringify(await store.orders(), null, 2));
  else {
    const order = await store.findOrder(number);
    if (!order) throw new Error('Test order not found.');
    if (retry) await store.retryCrm(order.id);
    console.log(JSON.stringify({ order, confirmations: await store.confirmations(order.id), crm: await store.crmSync(order.id) }, null, 2));
  }
} finally { await store.close(); }
