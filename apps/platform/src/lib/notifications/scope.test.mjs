import assert from "node:assert/strict";
import test from "node:test";

import {
  isSystemHealthNotification,
  normalizeNotificationInboxTab,
  systemHealthNotificationDestination,
} from "./scope.ts";

test("notification inbox defaults to customer activity", () => {
  assert.equal(normalizeNotificationInboxTab(undefined), "activity");
  assert.equal(normalizeNotificationInboxTab("activity"), "activity");
  assert.equal(normalizeNotificationInboxTab("unexpected"), "activity");
});

test("notification inbox recognizes the system tab", () => {
  assert.equal(normalizeNotificationInboxTab("system"), "system");
});

test("system health notifications are identified by their dedicated destination", () => {
  assert.equal(isSystemHealthNotification({ destination_path: systemHealthNotificationDestination }), true);
  assert.equal(isSystemHealthNotification({ destination_path: "/admin/customers" }), false);
  assert.equal(isSystemHealthNotification({ destination_path: null }), false);
});
