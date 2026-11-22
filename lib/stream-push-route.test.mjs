import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../app/api/webhooks/stream/route.ts", import.meta.url), "utf8");
const compiled = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });

function route() {
  const sent = [];
  const dependencies = {
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
    "stream-chat": { StreamChat: { getInstance: () => ({ verifyWebhook: () => true }) } },
    "@/lib/mongodb": { connectToDatabase: async () => {} },
    "@/lib/web-push": {
      configureWebPush: () => {},
      sendNotification: async (_subscription, payload, options) => sent.push({ payload: JSON.parse(payload), ttl: options.TTL, urgency: options.urgency }),
    },
    "@/models/PushSubscription": { default: { find: () => ({ lean: async () => [{ endpoint: "https://push.test", keys: {} }] }) } },
    "@/lib/firebase-admin": { sendFirebasePush: async (_users, _payload, _token, ttl) => {
      sent.push({ firebaseTtl: ttl });
      return { sent: 0, failed: 0 };
    } },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, console, process: { env: { NEXT_PUBLIC_STREAM_API_KEY: "key", STREAM_API_SECRET: "secret" } },
    require: (name) => {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`);
      return dependencies[name];
    },
  });
  return { post: exports.POST, sent };
}

function request(event) {
  return new Request("https://example.test/api/webhooks/stream", {
    method: "POST", headers: { "x-signature": "signature" }, body: JSON.stringify(event),
  });
}

test("message pushes use usernames and request a longer delivery window", async () => {
  const r = route();
  const response = await r.post(request({
    type: "message.new", cid: "messaging:chat", members: [{ user_id: "alice" }, { user_id: "bob" }],
    message: { id: "m1", user: { id: "alice", name: "Private Name", username: "alice123" } },
  }));
  assert.equal(response.status, 200);
  const push = r.sent.find((item) => item.payload);
  assert.equal(push.payload.title, "New message from alice123");
  assert.equal(push.ttl, 604800);
  assert.equal(push.urgency, "high");
  assert.equal(r.sent.find((item) => item.firebaseTtl).firebaseTtl, 604800);
});

test("call pushes do not expose old names and expire quickly", async () => {
  const r = route();
  const response = await r.post(request({
    type: "call.ring", call_cid: "default:call", members: [{ user_id: "alice" }, { user_id: "bob" }],
    call: { created_by: { id: "alice", name: "Private Name" } },
  }));
  assert.equal(response.status, 200);
  const push = r.sent.find((item) => item.payload);
  assert.equal(push.payload.body, "A teammate invited you to join a call.");
  assert.equal(push.ttl, 60);
  assert.equal(push.urgency, "high");
  assert.equal(r.sent.find((item) => item.firebaseTtl).firebaseTtl, 60);
});
