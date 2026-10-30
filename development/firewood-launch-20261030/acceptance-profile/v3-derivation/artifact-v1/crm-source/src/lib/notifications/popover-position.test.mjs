import assert from "node:assert/strict";
import test from "node:test";
import { getNotificationPopoverLayout } from "./popover-position.ts";

function assertContained(layout, viewportWidth, viewportHeight) {
  assert.ok(layout.left >= 0);
  assert.ok(layout.top >= 0);
  assert.ok(layout.left + layout.width <= viewportWidth);
  assert.ok(layout.top + layout.maxHeight <= viewportHeight);
}

test("desktop panel opens to the right of the sidebar bell", () => {
  const layout = getNotificationPopoverLayout({
    mobile: false,
    trigger: { bottom: 60, left: 188, right: 230, top: 18 },
    viewportHeight: 900,
    viewportWidth: 1440,
  });

  assert.equal(layout.left, 238);
  assert.equal(layout.width, 390);
  assertContained(layout, 1440, 900);
});

test("desktop positioning collides safely with a narrow or zoomed viewport", () => {
  const layout = getNotificationPopoverLayout({
    mobile: false,
    trigger: { bottom: 60, left: 620, right: 662, top: 18 },
    viewportHeight: 700,
    viewportWidth: 700,
  });

  assert.equal(layout.left, 298);
  assertContained(layout, 700, 700);
});

test("mobile panel aligns to the trigger while keeping safe viewport margins", () => {
  const layout = getNotificationPopoverLayout({
    mobile: true,
    trigger: { bottom: 54, left: 296, right: 338, top: 12 },
    viewportHeight: 667,
    viewportWidth: 350,
  });

  assert.equal(layout.left, 12);
  assert.equal(layout.width, 326);
  assert.equal(layout.top, 62);
  assertContained(layout, 350, 667);
});

test("short viewports constrain panel scrolling without vertical overflow", () => {
  const layout = getNotificationPopoverLayout({
    mobile: true,
    trigger: { bottom: 54, left: 740, right: 782, top: 12 },
    viewportHeight: 260,
    viewportWidth: 800,
  });

  assert.equal(layout.maxHeight, 186);
  assertContained(layout, 800, 260);
});
