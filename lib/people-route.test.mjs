import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import { peopleSearchPattern, peopleSearchTerm } from "./people-search.ts";

const source = await readFile(new URL("../app/api/people/route.ts", import.meta.url), "utf8");
const compiled = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });

function route(userId = "alice") {
  const counts = new Map();
  let queries = 0;
  const dependencies = {
    "@clerk/nextjs/server": { auth: async () => ({ userId }) },
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
    "@/lib/mongodb": { connectToDatabase: async () => {} },
    "@/lib/people-search": { peopleSearchPattern, peopleSearchTerm },
    "@/models/SearchRateLimit": { default: {
      findOneAndUpdate: async ({ _id }) => {
        const count = (counts.get(_id) ?? 0) + 1;
        counts.set(_id, count);
        return { count };
      },
    } },
    "@/models/User": { default: {
      find: () => {
        queries++;
        const chain = {
          select: () => chain,
          sort: () => chain,
          limit: () => chain,
          lean: async () => [],
        };
        return chain;
      },
    } },
  };
  const exports = {};
  class FixedDate extends Date {
    static now() { return 1_700_000_000_000; }
  }
  vm.runInNewContext(compiled, { exports, console, URL, Date: FixedDate, require: (name) => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`);
    return dependencies[name];
  } });
  return { get: exports.GET, queries: () => queries };
}

test("people search rejects anonymous and empty requests", async () => {
  const anonymous = route(null);
  assert.equal((await anonymous.get(new Request("https://example.test/api/people?q=alex"))).status, 401);
  const authenticated = route();
  assert.equal((await authenticated.get(new Request("https://example.test/api/people?q=a"))).status, 400);
  assert.equal(authenticated.queries(), 0);
});

test("people search limits each account to thirty valid searches per minute", async () => {
  const r = route();
  const request = new Request("https://example.test/api/people?q=alex");
  for (let i = 0; i < 30; i++) assert.equal((await r.get(request)).status, 200);
  const limited = await r.get(request);
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
  assert.equal(r.queries(), 30);
});
