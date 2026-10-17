import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { request } from 'node:https';
import { setTimeout as delay } from 'node:timers/promises';
import { scanDocumentBytes } from '../src/lib/security/document-scanner.ts';

const enabled = process.env.SCANNER_HOSTING_DISPOSABLE === '1' && Boolean(process.env.SCANNER_HOSTING_FIXTURE_FILE);
test('private scanner hosting — isolated local TLS, limits, failure and recovery', { skip: !enabled }, async t => {
  const c = JSON.parse(readFileSync(process.env.SCANNER_HOSTING_FIXTURE_FILE, 'utf8'));
  const url = new URL(c.url); assert.equal(url.origin, 'https://127.0.0.1:33443'); assert.equal(url.pathname, '/scan');
  assert.match(c.project, /^ats_host_local_[a-z0-9_]+$/); assert.match(process.env.DOCKER_HOST ?? '', /^unix:.*pr02-disposable\/sock\/docker.sock$/);
  const token = readFileSync(c.tokenFile, 'utf8').trim(); const results = [];
  const docker = (...args) => execFileSync(c.docker, args, { encoding: 'utf8', env: process.env, timeout: 25000 });
  const assertNoPayloadLayer = id => {
    // Docker may create empty bind-mount targets before mounting private files.
    const changes = docker('diff', id).trim().split('\n').filter(Boolean);
    assert.ok(changes.every(x => /^[AC] \/run(?:\/secrets(?:\/(?:scanner_token|tls_cert|tls_key))?)?$/.test(x)), 'Only secret mount scaffolding may differ from the immutable image.');
  };
  function inspect(service) {
    const value = JSON.parse(docker('inspect', c.ids[service]))[0];
    assert.equal(value.Config.Labels['com.docker.compose.project'], c.project);
    assert.equal(value.Config.Labels['com.docker.compose.service'], service); return value;
  }
  // Resolve ownership BEFORE any stop/restart. Never accept arbitrary container IDs.
  for (const service of ['engine', 'bridge', 'proxy', 'signature-updater']) inspect(service);
  const bytes = Buffer.from('ATS synthetic hosting verification; no customer bytes.');
  const scan = b => scanDocumentBytes(b, { url: c.url, token, production: true });
  async function ready() {
    for (let i = 0; i < 40; i++) { if ((await scan(bytes)).status === 'clean') return; await delay(1000); }
    assert.fail('Owned scanner did not become ready.');
  }
  const run = (name, fn) => t.test(name, async () => { await fn(); results.push({ name, pass: true }); });
  t.after(() => { if (process.env.SCANNER_HOSTING_RESULTS_FILE) writeFileSync(process.env.SCANNER_HOSTING_RESULTS_FILE, JSON.stringify({ results }, null, 2)); });
  await ready();
  await run('all services are non-root, read-only, bounded, capability-free and network isolated', async () => {
    const services = Object.fromEntries(['engine', 'bridge', 'proxy', 'signature-updater'].map(s => [s, inspect(s)]));
    for (const v of Object.values(services)) {
      assert.notEqual(v.Config.User.split(':')[0], '0'); assert.equal(v.HostConfig.ReadonlyRootfs, true);
      assert.ok(v.HostConfig.CapDrop.includes('ALL')); assert.ok(v.HostConfig.SecurityOpt.includes('no-new-privileges:true'));
      assert.ok(v.HostConfig.Memory > 0); assert.equal(v.HostConfig.MemorySwap, v.HostConfig.Memory);
      const enforced = docker('exec', v.Id, 'cat', '/sys/fs/cgroup/memory.max', '/sys/fs/cgroup/memory.swap.max').trim().split('\n');
      assert.deepEqual(enforced, [String(v.HostConfig.Memory), '0'], 'The daemon must enforce the declared memory/no-swap limits.');
      assert.equal(v.HostConfig.Ulimits.find(x => x.Name === 'core').Hard, 0); assert.ok(v.HostConfig.Tmpfs['/tmp'].includes('noexec'));
      assertNoPayloadLayer(v.Id);
    }
    for (const s of ['engine', 'bridge', 'signature-updater']) assert.equal(Object.keys(services[s].HostConfig.PortBindings ?? {}).length, 0);
    assert.deepEqual(services.proxy.HostConfig.PortBindings['8443/tcp'], [{ HostIp: '127.0.0.1', HostPort: '33443' }]);
    assert.equal(services.engine.Mounts.find(x => x.Destination === '/var/lib/clamav').RW, false);
    assert.equal(services['signature-updater'].Mounts.find(x => x.Destination === '/var/lib/clamav').RW, true);
    const networks = s => Object.keys(services[s].NetworkSettings.Networks).sort();
    assert.deepEqual(networks('engine'), [c.project + '_engine']);
    assert.deepEqual(networks('bridge'), [c.project + '_engine', c.project + '_ingress']);
    assert.deepEqual(networks('signature-updater'), [c.project + '_updates']);
    assert.deepEqual(networks('proxy'), [c.project + '_edge', c.project + '_ingress']);
    for (const name of ['engine', 'ingress']) assert.equal(JSON.parse(docker('network', 'inspect', c.project + '_' + name))[0].Internal, true);
    assert.equal(services.engine.HostConfig.LogConfig.Type, 'none');
  });
  await run('real HTTPS client confirms clean content, EICAR quarantine and the 25 MiB boundary', async () => {
    assert.equal((await scan(bytes)).status, 'clean');
    const eicar = Buffer.from(['X5O!P%@AP[4\\PZX54(P^)7CC)7}', '$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'].join(''));
    assert.equal((await scan(eicar)).status, 'quarantined');
    assert.equal((await scan(Buffer.alloc(25 * 1024 * 1024, 65))).status, 'clean');
    assert.equal((await scan(Buffer.alloc(25 * 1024 * 1024 + 1))).status, 'unavailable');
    const oversized = await fetch(c.url, { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/octet-stream' }, body: Buffer.alloc(25 * 1024 * 1024 + 1) });
    assert.equal(oversized.status, 413); await oversized.arrayBuffer();
  });
  await run('TLS trust, authentication, MIME and path checks fail closed', async () => {
    const noTrust = { ...process.env }; delete noTrust.NODE_EXTRA_CA_CERTS;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', "try { await fetch('https://127.0.0.1:33443/scan'); process.exit(2); } catch { process.exit(0); }"], { env: noTrust, timeout: 15000 });
    assert.equal(child.status, 0, 'Self-signed local certificate must require explicit trust.');
    const wrong = await scanDocumentBytes(bytes, { url: c.url, token: 'synthetic-wrong-credential-at-least-32-characters', production: true }); assert.equal(wrong.status, 'unavailable');
    for (const [path, contentType, body, expected] of [['/scan', 'text/plain', bytes, 400], ['/other', 'application/octet-stream', bytes, 404], ['/scan', 'application/octet-stream', Buffer.alloc(0), 400]]) {
      const response = await fetch(url.origin + path, { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': contentType }, body });
      assert.equal(response.status, expected); assert.match(response.headers.get('cache-control'), /no-store/); await response.arrayBuffer();
    }
  });
  await run('encrypted archives and expanded-size limits are held instead of reported clean', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ats-scanner-archive-'));
    try {
      const small = join(dir, 'synthetic.txt'), large = join(dir, 'synthetic-large.txt');
      writeFileSync(small, bytes, { mode: 0o600 }); writeFileSync(large, Buffer.alloc(110 * 1024 * 1024, 65), { mode: 0o600 });
      execFileSync('zip', ['-j', '-q', '-P', 'synthetic-fixture-only', join(dir, 'encrypted.zip'), small], { timeout: 15000 });
      execFileSync('zip', ['-j', '-q', join(dir, 'large.zip'), large], { timeout: 15000 });
      assert.equal((await scan(readFileSync(join(dir, 'encrypted.zip')))).status, 'quarantined');
      assert.equal((await scan(readFileSync(join(dir, 'large.zip')))).status, 'quarantined');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  await run('two in-flight requests bound concurrency; extra requests are refused without retry', async () => {
    const partials = [];
    try {
      for (let i = 0; i < 2; i++) {
        const req = request(c.url, { method: 'POST', ca: readFileSync(c.caFile), headers: { authorization: 'Bearer ' + token, 'content-type': 'application/octet-stream', 'content-length': '1024' } });
        req.on('error', () => {}); req.flushHeaders(); req.write('A'); partials.push(req);
      }
      await delay(300); const response = await fetch(c.url, { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/octet-stream' }, body: bytes });
      assert.equal(response.status, 503); await response.arrayBuffer();
    } finally { partials.forEach(r => r.destroy()); }
    await delay(300); await ready();
  });
  await run('engine outage refuses approval; restart recovers without bypassing a scan', async () => {
    try { docker('stop', '-t', '2', c.ids.engine); assert.equal((await scan(bytes)).status, 'unavailable'); }
    finally { docker('start', c.ids.engine); }
    await ready(); assert.equal((await scan(bytes)).status, 'clean');
  });
  await run('readiness measures loaded signatures and no file body or token is retained in logs or disk layers', async () => {
    const state = JSON.parse(docker('exec', c.ids.bridge, 'node', 'probe.mjs')); assert.equal(state.status, 'ok');
    assert.equal(state.engineVersion, '1.5.4'); assert.ok(state.signatureAgeSeconds < 48 * 3600);
    for (const service of ['engine', 'bridge', 'proxy']) {
      const names = docker('exec', c.ids[service], 'find', '/tmp', '-type', 'f').trim().split('\n').filter(Boolean);
      assert.ok(names.every(x => ['/tmp/clamd.pid', '/tmp/nginx.pid'].includes(x)), 'Only PID files may remain in scratch space.');
      assertNoPayloadLayer(c.ids[service]);
    }
    for (const service of ['bridge', 'proxy', 'signature-updater']) {
      const logs = docker('logs', c.ids[service]); assert.equal(logs.includes(token), false); assert.equal(logs.includes(bytes.toString()), false);
    }
    results.push({ name: 'loaded signature state', ...state });
  });
});
