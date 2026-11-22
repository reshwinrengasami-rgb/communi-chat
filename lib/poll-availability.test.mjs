import test from "node:test";
import assert from "node:assert/strict";
import { pollUnavailableReason } from "./poll-availability.ts";

test("poll button explains missing settings and permissions", () => {
  assert.match(pollUnavailableReason(undefined, false), /unavailable/);
  assert.match(pollUnavailableReason(false, false), /not enabled/);
  assert.match(pollUnavailableReason(true, false), /send-poll/);
  assert.equal(pollUnavailableReason(true, true), "");
});
