export type QuoteEmailPortalLinkState = "recoverable" | "legacy_unrecoverable" | "none";

type QuotePortalLinkStateInput = {
  expires_at: string | null;
  portalUrl: string | null;
  revoked_at: string | null;
};

export function getQuoteEmailPortalLinkState(
  tokens: QuotePortalLinkStateInput[],
  now = Date.now(),
): QuoteEmailPortalLinkState {
  const activeTokens = tokens.filter(
    (token) => !token.revoked_at && (!token.expires_at || new Date(token.expires_at).getTime() > now),
  );

  if (activeTokens.some((token) => Boolean(token.portalUrl))) {
    return "recoverable";
  }

  return activeTokens.length > 0 ? "legacy_unrecoverable" : "none";
}
