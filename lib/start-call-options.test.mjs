import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

test("outgoing calls ring without the incompatible notify option", async () => {
  const source = await readFile(new URL("../components/chat-dashboard.tsx", import.meta.url), "utf8");
  const file = ts.createSourceFile("chat-dashboard.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let options;
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText(file) === "call" &&
      node.expression.name.text === "getOrCreate"
    ) {
      assert.equal(options, undefined, "expected one call creation request");
      options = node.arguments[0];
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.ok(options && ts.isObjectLiteralExpression(options));
  const fields = new Map(
    options.properties
      .filter(ts.isPropertyAssignment)
      .map((property) => [property.name.getText(file), property.initializer.getText(file)]),
  );
  assert.equal(fields.get("ring"), "true");
  assert.notEqual(fields.get("notify"), "true");
  assert.equal(fields.get("video"), "videoEnabled");
  assert.match(fields.get("data") ?? "", /channel\.state\.members/);
});
