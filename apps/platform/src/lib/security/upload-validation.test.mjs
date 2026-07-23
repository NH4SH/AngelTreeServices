import assert from "node:assert/strict";
import { File } from "node:buffer";
import test from "node:test";
import sharp from "sharp";
import { prepareSafeUpload } from "./upload-validation.ts";

test("valid images are decoded, normalized, and stripped of source metadata", async () => {
  const source = await sharp({ create: { width: 4, height: 4, channels: 3, background: "green" } })
    .withMetadata({ exif: { IFD0: { Copyright: "GPS TEST METADATA" } } })
    .jpeg()
    .toBuffer();
  const result = await prepareSafeUpload(new File([source], "photo.jpg", { type: "image/jpeg" }), { maxBytes: 1024 * 1024 });
  assert.equal(result.error, null);
  assert.ok(result.data);
  assert.equal(Buffer.from(result.data.bytes).includes(Buffer.from("GPS TEST METADATA")), false);
});

test("mislabeled HTML and SVG are rejected as images", async () => {
  for (const payload of ["<html><script>alert(1)</script></html>", "<svg xmlns='http://www.w3.org/2000/svg'></svg>"]) {
    const result = await prepareSafeUpload(new File([payload], "photo.jpg", { type: "image/jpeg" }), { maxBytes: 1024 * 1024 });
    assert.match(result.error, /contents do not match/);
  }
});

test("unsafe paths, oversized files, and malformed PDFs are rejected", async () => {
  const unsafe = await prepareSafeUpload(new File(["%PDF-1.7"], "../invoice.pdf", { type: "application/pdf" }), { maxBytes: 1024 });
  assert.match(unsafe.error, /file name is not safe/);
  const oversized = await prepareSafeUpload(new File([Buffer.alloc(2048)], "invoice.pdf", { type: "application/pdf" }), { maxBytes: 1024 });
  assert.match(oversized.error, /smaller than/);
  const malformed = await prepareSafeUpload(new File(["not a PDF"], "invoice.pdf", { type: "application/pdf" }), { maxBytes: 1024, allowDocuments: true });
  assert.match(malformed.error, /contents do not match/);
});

test("duplicate source names do not weaken unique destination-path responsibility", async () => {
  const source = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).png().toBuffer();
  const first = await prepareSafeUpload(new File([source], "same.png", { type: "image/png" }), { maxBytes: 1024 * 1024 });
  const second = await prepareSafeUpload(new File([source], "same.png", { type: "image/png" }), { maxBytes: 1024 * 1024 });
  assert.ok(first.data && second.data);
  assert.equal(first.data.fileName, second.data.fileName);
});
