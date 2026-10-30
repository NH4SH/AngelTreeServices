export function createSupabaseServerFetch(
  publicUrl: string | undefined,
  internalUrl: string | undefined,
  fetchImpl?: typeof fetch,
): typeof fetch;
