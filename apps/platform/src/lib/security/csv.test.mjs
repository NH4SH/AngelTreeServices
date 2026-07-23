import assert from "node:assert/strict";
import test from "node:test";
import { serializeCsvCell } from "./csv.ts";

const dangerous = ["=HYPERLINK(\"https://evil.example\")", "+SUM(1,2)", "-1+2", "@SUM(1,2)", "\t=1+1", "\r=1+1", "\n=1+1"];
for (const value of dangerous) {
  test(`CSV text is neutralized: ${JSON.stringify(value)}`, () => {
    const serialized = serializeCsvCell(value);
    assert.match(serialized.replace(/^"|"$/g, ""), /^'/);
  });
}

test("CSV escaping follows RFC 4180 rules", () => {
  assert.equal(serializeCsvCell("one,two"), '"one,two"');
  assert.equal(serializeCsvCell('a"b'), '"a""b"');
  assert.equal(serializeCsvCell("line one\nline two"), '"line one\nline two"');
});

test("typed negative numbers remain numeric", () => {
  assert.equal(serializeCsvCell(-42), "-42");
  assert.equal(serializeCsvCell("ordinary text"), "ordinary text");
});
