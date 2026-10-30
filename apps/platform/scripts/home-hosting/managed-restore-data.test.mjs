import test from 'node:test';import assert from 'node:assert/strict';
import {copyValue,sqlValue,parseCopies,copyInsert} from './managed-restore-data.mjs';
test('COPY decoding distinguishes null, literal backslash, tabs and newlines',()=>{
  assert.equal(copyValue('\\N'),null);assert.equal(copyValue('\\\\N'),'\\N');
  assert.equal(copyValue('a\\tb\\nc\\\\d'),'a\tb\nc\\d');assert.equal(copyValue('\\141\\x62'),'ab');
});
test('COPY byte escapes retain multibyte customer names and reject invalid UTF-8',()=>{
  assert.equal(copyValue('Jos\\303\\251'),'José');assert.equal(copyValue('Jos\\xc3\\xa9'),'José');
  assert.equal(copyValue('José'),'José');assert.throws(()=>copyValue('\\377'));assert.throws(()=>copyValue('abc\\'));
});
test('SQL output quotes data without turning quotes and backslashes into commands',()=>{
  assert.equal(sqlValue("x'\\n"),"E'x''\\\\n'");
  const b=parseCopies('COPY public.example (id, label) FROM stdin;\n1\tO\'Brien\\tready\n\\.\n')[0];
  assert.match(copyInsert(b),/E'O''Brien\tready'/);assert.equal(b.rows[0][1],"O'Brien\tready");
});
test('Malformed or unsupported COPY blocks are rejected before any import',()=>{
  assert.throws(()=>parseCopies('COPY public.example (id, label) FROM stdin;\n1\n\\.\n'));
  assert.throws(()=>parseCopies('COPY public.example (id) FROM stdin;\n1\n'));
  assert.throws(()=>parseCopies('COPY "other schema".table (id) FROM stdin;\n\\.\n'));
});
test('recovery preserves GENERATED ALWAYS IDs and their foreign-key references',async()=>{
  const {PGlite}=await import(process.env.HOME_HOSTING_PGLITE_MODULE??'@electric-sql/pglite');
  const db=new PGlite();
  try {
    await db.exec('create table public.parent(id bigint generated always as identity primary key,label text); create table public.child(id bigint primary key,parent_id bigint references public.parent);');
    const parent=parseCopies('COPY public.parent (id, label) FROM stdin;\n726\trestored\n\\.\n')[0];
    const child=parseCopies('COPY public.child (id, parent_id) FROM stdin;\n19\t726\n\\.\n')[0];
    await db.exec(copyInsert(parent));await db.exec(copyInsert(child));
    assert.deepEqual((await db.query('select p.id,c.id child_id,p.label from public.parent p join public.child c on c.parent_id=p.id')).rows,[{id:726,child_id:19,label:'restored'}]);
    await assert.rejects(db.exec(copyInsert(parent)),/duplicate key/);
  } finally {await db.close();}
});
