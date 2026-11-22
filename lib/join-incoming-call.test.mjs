import assert from "node:assert/strict";
import { test } from "node:test";
import { joinIncomingCall } from "./join-incoming-call.ts";

function call(overrides = {}) {
  const steps = [];
  return {
    steps,
    value: {
      type: "default",
      state: { custom: {} },
      join: async () => { steps.push("join"); },
      camera: {
        enable: async () => { steps.push("camera on"); },
        disable: async () => { steps.push("camera off"); },
      },
      microphone: { enable: async () => { steps.push("microphone"); } },
      ...overrides,
    },
  };
}

test("joins video calls with microphone and camera", async () => {
  const c = call();
  assert.equal(await joinIncomingCall(c.value), "");
  assert.deepEqual(c.steps, ["join", "microphone", "camera on"]);
});

for (const overrides of [
  { type: "default", state: { custom: { audioOnly: true } } },
  { type: "audio_call" },
]) {
  test("disables the camera before joining an audio call", async () => {
    const c = call(overrides);
    assert.equal(await joinIncomingCall(c.value), "");
    assert.deepEqual(c.steps, ["camera off", "join", "microphone"]);
  });
}

test("does not join an audio call if the camera cannot be disabled", async () => {
  const c = call({
    type: "audio_call",
    camera: { disable: async () => { throw new Error("camera failure"); }, enable: async () => {} },
  });
  await assert.rejects(joinIncomingCall(c.value), /camera failure/);
  assert.deepEqual(c.steps, []);
});

test("reports microphone and camera errors after joining", async () => {
  const c = call({
    microphone: { enable: async () => { throw new Error("mic denied"); } },
    camera: { disable: async () => {}, enable: async () => { throw new Error("camera denied"); } },
  });
  const originalError = console.error;
  console.error = () => {};
  try {
    const warning = await joinIncomingCall(c.value);
    assert.match(warning, /microphone unavailable/i);
    assert.match(warning, /joined without video/i);
    assert.deepEqual(c.steps, ["join"]);
  } finally {
    console.error = originalError;
  }
});

test("surfaces join errors without enabling microphone or camera", async () => {
  const c = call({ join: async () => { throw new Error("call ended"); } });
  await assert.rejects(joinIncomingCall(c.value), /call ended/);
  assert.deepEqual(c.steps, []);
});
