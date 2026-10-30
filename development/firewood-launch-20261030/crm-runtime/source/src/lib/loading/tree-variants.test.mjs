import assert from "node:assert/strict";
import test from "node:test";
import {
  artisticTreeVariants,
  chooseLoadingTreeVariant,
  isArtisticTreeVariant,
} from "./tree-variants.ts";

test("all three loading artwork variants are available", () => {
  assert.deepEqual(artisticTreeVariants, ["sparse", "balanced", "golden"]);
});

test("random boundaries can select every variant", () => {
  assert.equal(chooseLoadingTreeVariant(null, 0), "sparse");
  assert.equal(chooseLoadingTreeVariant(null, 0.34), "balanced");
  assert.equal(chooseLoadingTreeVariant(null, 0.99), "golden");
});

test("the immediately previous variant is excluded", () => {
  for (const previous of artisticTreeVariants) {
    assert.notEqual(chooseLoadingTreeVariant(previous, 0), previous);
    assert.notEqual(chooseLoadingTreeVariant(previous, 0.99), previous);
  }
});

test("stored variant values are validated before reuse", () => {
  assert.equal(isArtisticTreeVariant("balanced"), true);
  assert.equal(isArtisticTreeVariant("unknown"), false);
  assert.equal(isArtisticTreeVariant(null), false);
});
