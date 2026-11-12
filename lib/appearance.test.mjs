import { test } from "node:test";
import assert from "node:assert/strict";
import { contrastTextColor, defaultAppearance, isAppearance } from "./appearance.ts";

test("validates appearance including safe image formats and size", () => {
  assert.equal(isAppearance(defaultAppearance), true);
  assert.equal(isAppearance({ ...defaultAppearance, backgroundPhoto: "data:image/png;base64,AAAA" }), true);
  assert.equal(isAppearance({ ...defaultAppearance, backgroundPhoto: "data:image/svg+xml;base64,AAAA" }), false);
  assert.equal(isAppearance({ ...defaultAppearance, backgroundPhoto: `data:image/png;base64,${"A".repeat(400001)}` }), false);
  assert.equal(isAppearance({ ...defaultAppearance, buttonSize: "huge" }), false);
  assert.equal(isAppearance({ ...defaultAppearance, bubbleColor: "red" }), false);
});

test("chooses legible text for light and dark bubbles", () => {
  assert.equal(contrastTextColor("#ffffff"), "#000000");
  assert.equal(contrastTextColor("#000000"), "#ffffff");
});
