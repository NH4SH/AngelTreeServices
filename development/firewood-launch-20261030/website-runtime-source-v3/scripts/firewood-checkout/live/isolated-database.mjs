const databases = new WeakSet();

// The review service cannot accept a connection string, pool or remotely supplied
// database. This factory owns a disposable local test engine and no credentials.
export async function createIsolatedLiveDatabase() {
  const { NetlifyDB } = await import('@netlify/database-dev');
  const db = new NetlifyDB({ logger: () => {} });
  await db.start(); databases.add(db); return db;
}
export function assertIsolatedLiveDatabase(db) {
  if (!databases.has(db)) throw Error('isolated_live_database_required');
}
