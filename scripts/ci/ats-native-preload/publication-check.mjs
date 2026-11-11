// Owned CI fixture only. No production reader or activation path.
import assert from 'node:assert/strict';
import { operationPublication } from './operation-publication.mjs';
const chunks = []; let length = 0;
for await (const chunk of process.stdin) {
  length += chunk.length; assert(length <= 16384); chunks.push(chunk);
}
const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
input.bindingBytes = Buffer.from(JSON.stringify(input.binding)); delete input.binding;
process.stdout.write(JSON.stringify(operationPublication(input)) + '\n');
