import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../app/api/push-subscriptions/test/route.ts", import.meta.url), "utf8");
const compiled = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });
const nodeRequire = createRequire(import.meta.url);

function route({ userId = "alice", firebaseResult = { sent: 1, failed: 0 }, subscription = null } = {}) {
  const calls = [];
  const dependencies = {
    "@clerk/nextjs/server": { auth: async () => ({ userId }) },
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
    "@/lib/mongodb": { connectToDatabase: async () => {} },
    "@/lib/web-push": {
      configureWebPush: () => {},
      sendNotification: async (target) => { calls.push(["webpush", target.endpoint]); },
    },
    "@/models/PushSubscription": {
      default: {
        findOne: (filter) => ({ lean: async () => {
          calls.push(["lookup", filter.userId, filter.endpoint]);
          return subscription;
        } }),
      },
    },
    "@/lib/firebase-admin": { sendFirebasePush: async (users, payload, token) => {
      calls.push(["firebase", users, token]);
      return firebaseResult;
    } },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, console, require: (name) => dependencies[name] ?? nodeRequire(name),
  });
  return { post: exports.POST, calls };
}

function request(data) {
  return new Request("https://example.test/api/push-subscriptions/test", {
    method: "POST", body: JSON.stringify(data),
  });
}

test("notification test requires authentication and a specific target", async () => {
  const anonymous = route({ userId: null });
  assert.equal((await anonymous.post(request({ type: "firebase", target: "x" }))).status, 401);
  const authenticated = route();
  assert.equal((await authenticated.post(request({}))).status, 400);
  assert.equal(authenticated.calls.length, 0);
});

test("Firebase test targets the signed-in user and requested token only", async () => {
  const r = route();
  assert.equal((await r.post(request({ type: "firebase", target: "device-token" }))).status, 200);
  assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0][0], "firebase");
  assert.equal(r.calls[0][1][0], "alice");
  assert.equal(r.calls[0][2], "device-token");
  const missing = route({ firebaseResult: { sent: 0, failed: 0 } });
  assert.equal((await missing.post(request({ type: "firebase", target: "other-token" }))).status, 404);
  const failure = route({ firebaseResult: { sent: 0, failed: 1 } });
  assert.equal((await failure.post(request({ type: "firebase", target: "device-token" }))).status, 502);
});

test("Web Push test only uses the signed-in user's selected endpoint", async () => {
  const subscription = { endpoint: "https://push.example/device", keys: { p256dh: "key", auth: "auth" } };
  const r = route({ subscription });
  assert.equal((await r.post(request({ type: "webpush", target: subscription.endpoint }))).status, 200);
  assert.equal(r.calls[0][1], "alice");
  assert.equal(r.calls[0][2], subscription.endpoint);
  assert.equal(r.calls[1][1], subscription.endpoint);
  const missing = route();
  assert.equal((await missing.post(request({ type: "webpush", target: subscription.endpoint }))).status, 404);
  assert.equal(missing.calls.length, 1);
});
