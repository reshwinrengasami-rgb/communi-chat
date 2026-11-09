import assert from "node:assert/strict";
import { test } from "node:test";
import { joinIncomingCall } from "./join-incoming-call.ts";

test("joins a video call and enables its camera", async () => {
  const steps = [];
  const warning = await joinIncomingCall({
    type: "default",
    join: async () => { steps.push("join"); },
    camera: { enable: async () => { steps.push("camera"); } },
  });
  assert.deepEqual(steps, ["join", "camera"]);
  assert.equal(warning, "");
});

test("joins an audio call without enabling the camera", async () => {
  let cameraEnabled = false;
  const warning = await joinIncomingCall({
    type: "audio_call",
    join: async () => {},
    camera: { enable: async () => { cameraEnabled = true; } },
  });
  assert.equal(cameraEnabled, false);
  assert.equal(warning, "");
});

test("surfaces join errors and does not enable the camera", async () => {
  let cameraEnabled = false;
  await assert.rejects(joinIncomingCall({
    type: "default",
    join: async () => { throw new Error("call ended"); },
    camera: { enable: async () => { cameraEnabled = true; } },
  }), /call ended/);
  assert.equal(cameraEnabled, false);
});

test("reports a camera failure after successfully joining", async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const warning = await joinIncomingCall({
      type: "default",
      join: async () => {},
      camera: { enable: async () => { throw new Error("camera denied"); } },
    });
    assert.match(warning, /joined without video/i);
  } finally {
    console.error = originalError;
  }
});
