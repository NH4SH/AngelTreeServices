import { readFileSync, statSync } from 'node:fs';

// Host credentials are mounted files, never image layers or Compose values.
// Existing local callers can continue to supply the original environment token.
export function readScannerToken(env = process.env) {
  const file = env.DOCUMENT_SCANNER_TOKEN_FILE;
  if (file && env.DOCUMENT_SCANNER_TOKEN) throw new Error('Choose one scanner credential source.');
  if (file) {
    const stat = statSync(file);
    if (!stat.isFile() || stat.size > 1024 || (stat.mode & 0o077)) throw new Error('Scanner credential file must be private.');
  }
  const value = file ? readFileSync(file, 'utf8').trimEnd() : env.DOCUMENT_SCANNER_TOKEN;
  if (!value || value.length < 32 || value.length > 1024 || /\s/.test(value)) throw new Error('Scanner credential is unavailable.');
  return value;
}
