import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
const workflow = readFileSync(new URL('../workflows/system-health-monitor.yml',import.meta.url),'utf8');
const functionText = workflow.slice(workflow.indexOf('          check_url() {'),workflow.indexOf('          check_url "Public website"'));

async function check(handler) {
  let requests=0;
  const server=createServer((req,res)=>handler(req,res,++requests));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const {stdout}=await execute('bash',['-c',`set +e
      observations=""
      record_failure() { printf 'FAIL:%s:%s\n' "$2" "$3"; }
      ${functionText.replace('--retry-delay 10','--retry-delay 0')}
      check_url 'Fixture' 'http://127.0.0.1:${server.address().port}' category title summary
      printf '%s' "$observations"
    `],{timeout:15000});
    return {stdout,requests};
  } finally { await new Promise(resolve=>server.close(resolve)); }
}
test('transport interruption receives a real retry before declaring an outage',async()=>{
  assert.ok(functionText.includes('--retry 1'));
  assert.ok(functionText.includes('--retry-all-errors'));
  const result=await check((req,res,n)=>n===1?req.socket.destroy():res.end('ok'));
  assert.equal(result.requests,2);assert.match(result.stdout,/passed \(HTTP 200\)/);assert.doesNotMatch(result.stdout,/FAIL/);
});
test('persistent missing asset reports HTTP 404 after exactly two attempts',async()=>{
  const result=await check((_req,res)=>{res.statusCode=404;res.end('missing');});
  assert.equal(result.requests,2);assert.match(result.stdout,/FAIL:404:summary \(HTTP 404, curl 22\)/);
});
test('persistent transport failure reports curl error, not a fabricated HTTP status',async()=>{
  const result=await check(req=>req.socket.destroy());
  assert.equal(result.requests,2);assert.match(result.stdout,/FAIL:none:summary \(connection failed before HTTP response, curl 52\)/);
});
test('healthy asset needs only one request',async()=>{
  const result=await check((_req,res)=>res.end('ok'));
  assert.equal(result.requests,1);assert.match(result.stdout,/passed \(HTTP 200\)/);
});
