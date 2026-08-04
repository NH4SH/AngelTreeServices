export type PortalTokenRpcRecord = {
  created: boolean;
  encrypted_token?: string | null;
  expires_at: string | null;
  id: string;
  token_encrypted?: string | null;
};

export function getEncryptedPortalToken(record: PortalTokenRpcRecord) {
  return record.token_encrypted ?? record.encrypted_token ?? null;
}
