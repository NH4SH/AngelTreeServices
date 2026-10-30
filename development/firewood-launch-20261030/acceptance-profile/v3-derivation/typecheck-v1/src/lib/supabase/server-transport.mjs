// Server-only callers keep the public SDK URL (and therefore cookie names and
// signed download links), but send network requests over the private VM network.
export function createSupabaseServerFetch(publicUrl, internalUrl, fetchImpl = globalThis.fetch) {
  if (!internalUrl) return fetchImpl;
  const external = new URL(publicUrl), internal = new URL(internalUrl);
  if (internal.href !== 'http://api-gw:8000/' || external.username || external.password ||
      external.search || external.hash || external.pathname !== '/backend' ||
      (external.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(external.hostname))) {
    throw new Error('Invalid private Supabase transport configuration.');
  }
  return async (input, init) => {
    const original = new Request(input, init), url = new URL(original.url);
    if (url.origin !== external.origin ||
        (url.pathname !== '/backend' && !url.pathname.startsWith('/backend/'))) {
      throw new Error('Supabase request is outside the configured API.');
    }
    const target = new URL(internal);
    target.pathname = url.pathname.slice('/backend'.length) || '/';
    target.search = url.search;
    // Never retry a mutation or follow a redirect carrying API credentials.
    return fetchImpl(new Request(target, original), { redirect: 'error' });
  };
}
