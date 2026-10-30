// Client-side conversion only. Never sends SQL or changes a database.
import assert from 'node:assert/strict';
const identifier = value => { assert.match(value, /^[a-z_][a-z0-9_]*$/); return '"' + value + '"'; };
export function copyValue(value) {
  if (value === '\\N') return null;
  // COPY octal/hex escapes denote bytes in the client encoding. Decode after
  // unescaping so multibyte UTF-8 names are not silently changed into Latin-1.
  const input = new TextEncoder().encode(value), output = [];
  for (let i = 0; i < input.length; i++) {
    if (input[i] !== 92) { output.push(input[i]); continue; }
    assert.ok(++i < input.length, 'Trailing COPY escape');
    let code = String.fromCharCode(input[i]);
    if (/[0-7]/.test(code)) {
      for (let n = 1; n < 3 && /[0-7]/.test(String.fromCharCode(input[i+1])); n++) code += String.fromCharCode(input[++i]);
      const byte = parseInt(code, 8); assert.ok(byte <= 255, 'Invalid octal byte'); output.push(byte);
    } else if (code === 'x' && /[0-9a-fA-F]/.test(String.fromCharCode(input[i+1]))) {
      code = String.fromCharCode(input[++i]);
      if (/[0-9a-fA-F]/.test(String.fromCharCode(input[i+1]))) code += String.fromCharCode(input[++i]);
      output.push(parseInt(code, 16));
    } else output.push(({b:8,f:12,n:10,r:13,t:9,v:11})[code] ?? input[i]);
  }
  return new TextDecoder('utf-8', {fatal:true}).decode(new Uint8Array(output));
}
export const sqlValue = value => value === null ? 'NULL' : "E'" + value.replaceAll('\\', '\\\\').replaceAll("'", "''") + "'";
export function parseCopies(text) {
  const result = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const match = /^COPY ([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*) \(([^)]+)\) FROM stdin;$/.exec(lines[i]);
    if (!match) { assert.ok(!lines[i].startsWith('COPY '), 'Unsupported COPY syntax'); continue; }
    const columns = match[3].split(', ').map(x => { identifier(x); return x; });
    const rows = [];
    for (++i; lines[i] !== '\\.'; i++) {
      assert.ok(i < lines.length, 'Unterminated COPY');
      const row = lines[i].split('\t').map(copyValue);
      assert.equal(row.length, columns.length, 'COPY column mismatch');
      rows.push(row);
    }
    result.push({schema:match[1],table:match[2],columns,rows});
  }
  assert.ok(result.length > 0, 'No COPY blocks found');
  return result;
}
export function copyInsert(block) {
  if (!block.rows.length) return '';
  // Archive recovery must retain original identity values and their references.
  // PostgreSQL accepts this clause on ordinary tables as well as identity tables.
  return `insert into ${identifier(block.schema)}.${identifier(block.table)} (${block.columns.map(identifier).join(',')}) overriding system value values\n` + block.rows.map(row => '(' + row.map(sqlValue).join(',') + ')').join(',\n') + ';';
}
