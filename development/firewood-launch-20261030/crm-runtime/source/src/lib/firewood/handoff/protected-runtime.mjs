import 'server-only';
import { lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerFetch } from '../../supabase/server-transport.mjs';
import { readReleasedContext, createReleasedDependenciesFactory } from '../runtime-admission/released-context.mjs';
import { sameRelease } from '../runtime-admission/released-context-core.mjs';
import { readBoundedFile, assertReadOnlyMount } from '../runtime-admission/release-filesystem.mjs';
import { supabaseLiveDatabase } from './live-database.mjs';
import { supabaseOfficeDatabase } from './office-database.mjs';
import { FirewoodLiveHandoffError, LIVE_PORTAL_ORIGIN, LIVE_PREPARE_PATH, LIVE_RENEW_PATH, LIVE_STATUS_PATH } from './live-contract.mjs';
import { OFFICE_PRICE_REQUEST_PATH, OFFICE_PRICE_STATUS_PATH, OFFICE_ORDER_STATUS_PATH } from './office-contract.mjs';

const SECRET_PATH = '/run/secrets/firewood_handoff.json';
const MAX_SECRET_BYTES = 8192;
const hash = value => createHash('sha256').update(value).digest('hex');
const sameSource = (a, b) => a && b && sameRelease(a, { ...b, mode: a.mode });
const unavailable = () => { throw new FirewoodLiveHandoffError('handoff_runtime_unavailable', true, 503); };
const liveOperations = Object.freeze({
  prepare: { mode: 'preparation', names: ['get_firewood_live_handoff_context', 'prepare_firewood_live_handoff'] },
  renew: { mode: 'preparation', names: ['get_firewood_live_handoff_context', 'renew_firewood_live_handoff'] },
  status: { mode: 'status', names: ['get_firewood_live_handoff_context', 'read_firewood_live_handoff', 'record_firewood_live_handoff_observation'] },
});
const officeOperations = Object.freeze({
  'price-request': { mode: 'office', preparation: true, names: ['get_firewood_live_handoff_context', 'request_firewood_live_office_price'] },
  'price-status': { mode: 'status', preparation: false, names: ['get_firewood_live_handoff_context', 'read_firewood_live_office_price'] },
  'order-status': { mode: 'status', preparation: false, names: ['get_firewood_live_handoff_context', 'read_firewood_live_handoff', 'record_firewood_live_handoff_observation'] },
});

function requestPath(request) {
  try {
    if (request?.method !== 'POST') return null;
    const url = new URL(request.url), host = new URL(LIVE_PORTAL_ORIGIN).host;
    const originalHost = request.headers.get('host');
    const external = url.origin === LIVE_PORTAL_ORIGIN && (!originalHost || originalHost === host);
    const internal = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname) && originalHost === host;
    if (!(external || internal) || url.search || url.hash || url.username || url.password) return null;
    return url.pathname;
  } catch { return null; }
}
export function classifyLiveHandoffRequest(request) {
  const path = requestPath(request);
  if (path === LIVE_PREPARE_PATH) return Object.freeze({ operation: 'prepare', mode: 'preparation' });
  if (path === LIVE_RENEW_PATH) return Object.freeze({ operation: 'renew', mode: 'preparation' });
  if (path === LIVE_STATUS_PATH) return Object.freeze({ operation: 'status', mode: 'status' });
  return null;
}
export function classifyOfficeHandoffRequest(request) {
  const path = requestPath(request);
  if (path === OFFICE_PRICE_REQUEST_PATH) return 'price-request';
  if (path === OFFICE_PRICE_STATUS_PATH) return 'price-status';
  if (path === OFFICE_ORDER_STATUS_PATH) return 'order-status';
  return null;
}

function readPrivateMaterial(context) {
  if (process.platform !== 'linux' || process.getuid?.() !== 1000 || process.getgid?.() !== 1000) unavailable();
  const before = lstatSync(SECRET_PATH);
  if (!before.isFile() || before.isSymbolicLink() || before.uid !== 0 || before.gid !== 1000
    || before.nlink !== 1 || (before.mode & 0o7777) !== 0o440) unavailable();
  const mountinfo = readBoundedFile('/proc/' + process.pid + '/mountinfo', 1048576, { processId: process.pid }).toString('utf8');
  assertReadOnlyMount(mountinfo, SECRET_PATH);
  const bytes = readBoundedFile(SECRET_PATH, MAX_SECRET_BYTES);
  const after = lstatSync(SECRET_PATH);
  if (after.uid !== 0 || after.gid !== 1000 || after.dev !== before.dev || after.ino !== before.ino
    || (after.mode & 0o7777) !== 0o440 || after.nlink !== 1) unavailable();
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const keys = ['version', 'keyId', 'signingSecret', 'encryptionKeyBase64', 'serviceKeyFingerprint'];
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join('|') !== keys.sort().join('|') || value.version !== 1
    || value.keyId !== context.signingKeyId || !/^[A-Za-z0-9_-]{32,256}$/u.test(value.signingSecret ?? '')
    || hash(value.signingSecret) !== context.signingKeyFingerprint
    || !/^[A-Za-z0-9+/]{43}=$/u.test(value.encryptionKeyBase64 ?? '')
    || !/^[a-f0-9]{64}$/u.test(value.serviceKeyFingerprint ?? '')) unavailable();
  const encryptionKey = Buffer.from(value.encryptionKeyBase64, 'base64');
  if (encryptionKey.length !== 32 || encryptionKey.toString('base64') !== value.encryptionKeyBase64) unavailable();
  // Firewood capabilities use the existing v1 portal token format. Reuse the existing
  // private portal key so generic owner Copy link/recovery can decrypt the same token.
  // Normalize exactly as portal/tokens.ts; never generate a replacement or use a fallback.
  const portalValue = process.env.PORTAL_TOKEN_ENCRYPTION_KEY?.trim();
  const portalKey = portalValue ? Buffer.from(portalValue, 'base64') : null;
  if (!portalKey || portalKey.length !== 32 || !portalKey.equals(encryptionKey)) unavailable();
  // The secret metadata is root controlled. Environment values can supply bytes, never admission.
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const internalUrl = process.env.SUPABASE_INTERNAL_URL;
  if (typeof serviceKey !== 'string' || serviceKey !== serviceKey.trim() || serviceKey.length < 100 || serviceKey.length > 4096
    || hash(serviceKey) !== value.serviceKeyFingerprint || publicUrl !== context.portalOrigin + '/backend'
    || !['http://api-gw:8000', 'http://api-gw:8000/'].includes(internalUrl)) unavailable();
  return { keyId: value.keyId, signingSecret: value.signingSecret, encryptionKey,
    serviceKey, serviceKeyFingerprint: value.serviceKeyFingerprint, publicUrl, internalUrl };
}
function freshContext(bound, policy) {
  const current = readReleasedContext(policy.mode);
  if (!current || !sameSource(bound, current)) unavailable();
  if (policy.preparation) {
    const preparation = readReleasedContext('preparation');
    if (!preparation || !sameSource(current, preparation)) unavailable();
  }
  return current;
}
function configFor(context, material) {
  return Object.freeze({ enabled: true, profile: 'live', mode: 'live', contract: context.contract,
    sourceId: context.source, environmentId: context.environment, accountId: context.account,
    portalOrigin: context.portalOrigin, websiteOrigin: context.websiteOrigin,
    termsHash: context.termsHash, paymentPolicyHash: context.paymentPolicyHash,
    keyId: material.keyId, signingSecret: material.signingSecret, encryptionKey: material.encryptionKey,
    officeEnabled: true, collectorReady: context.modes.collection === true });
}
function dependencies(policy, office) {
  return createReleasedDependenciesFactory(policy.mode, bound => {
    const current = freshContext(bound, policy);
    const material = readPrivateMaterial(current), config = configFor(current, material);
    const client = createClient(material.publicUrl, material.serviceKey, {
      global: { fetch: createSupabaseServerFetch(material.publicUrl, material.internalUrl) },
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const adapter = office ? supabaseOfficeDatabase(client) : supabaseLiveDatabase(client);
    const verify = () => {
      const latest = freshContext(bound, policy), secret = readPrivateMaterial(latest);
      if (secret.serviceKeyFingerprint !== material.serviceKeyFingerprint || secret.keyId !== material.keyId
        || secret.signingSecret !== material.signingSecret || !secret.encryptionKey.equals(material.encryptionKey)) unavailable();
    };
    return { config, db: { async call(name, args) {
      if (!policy.names.includes(name) || args?.p_source !== bound.source) unavailable();
      // Actual transaction row/deferred guards remain authoritative; this gate never bypasses them.
      verify(); const result = await adapter.call(name, args); verify(); return result;
    } } };
  })();
}
export function getProtectedLiveDependencies(mode, operation) {
  try {
    const policy = Object.hasOwn(liveOperations, operation) ? liveOperations[operation] : null;
    return policy && policy.mode === mode ? dependencies(policy, false) : null;
  } catch { return null; }
}
export function getProtectedOfficeDependencies(operation) {
  try {
    const policy = Object.hasOwn(officeOperations, operation) ? officeOperations[operation] : null;
    return policy ? dependencies(policy, true) : null;
  } catch { return null; }
}
