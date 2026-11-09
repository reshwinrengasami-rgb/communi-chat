import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../public/call-notifications-sw.js", import.meta.url), "utf8");

function worker() {
  const handlers = {};
  const shown = [];
  let backgroundHandler;
  const self = {
    location: { href: "https://example.test/call-notifications-sw.js?firebase=%7B%7D", origin: "https://example.test" },
    registration: { showNotification: async (title, options) => shown.push({ title, options }) },
    clients: { matchAll: async () => [], openWindow: async (url) => url },
    addEventListener: (name, handler) => { handlers[name] = handler; },
  };
  vm.runInNewContext(source, {
    self, URL, console, importScripts() {},
    firebase: { initializeApp() {}, messaging: () => ({ onBackgroundMessage: (handler) => { backgroundHandler = handler; } }) },
  });
  return { self, handlers, shown, backgroundHandler };
}

test("legacy and Firebase pushes render once with the same message destination", async () => {
  const w = worker();
  let promise;
  let stopped = false;
  w.handlers.push({
    data: { json: () => ({ type: "message", title: "Hi", channelCid: "messaging:123" }) },
    stopImmediatePropagation: () => { stopped = true; },
    waitUntil: (value) => { promise = value; },
  });
  await promise;
  assert.equal(stopped, true);
  assert.equal(w.shown[0].options.data.channelCid, "messaging:123");
  await w.backgroundHandler({ data: { type: "message", title: "Hi", channelCid: "messaging:123" } });
  assert.equal(w.shown[1].options.data.channelCid, "messaging:123");
});

test("FCM envelopes are left for Firebase to handle", () => {
  const w = worker();
  w.handlers.push({
    data: { json: () => ({ from: "123", data: { type: "message" } }) },
    stopImmediatePropagation: () => assert.fail("FCM should not be stopped"),
    waitUntil: () => assert.fail("FCM should not be rendered twice"),
  });
});

for (const [data, expected] of [
  [{ callCid: "", channelCid: "messaging:123" }, "https://example.test/?channel=messaging%3A123"],
  [{ callCid: "default:456", channelCid: "" }, "https://example.test/?call=default%3A456"],
]) {
  test(`notification click opens ${expected}`, async () => {
    const w = worker();
    let promise;
    w.handlers.notificationclick({
      notification: { data, close() {} },
      waitUntil: (value) => { promise = value; },
    });
    assert.equal(await promise, expected);
  });
}
