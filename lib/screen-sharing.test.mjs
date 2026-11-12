import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { hasScreenShare, SfuModels } = require("@stream-io/video-react-sdk");

test("screen share is detected from published tracks before a stream is subscribed", () => {
  assert.equal(hasScreenShare({ publishedTracks: [SfuModels.TrackType.SCREEN_SHARE] }), true);
  assert.equal(hasScreenShare({ publishedTracks: [] }), false);
});

test("call stage selects the SDK screen-share layout", async () => {
  const source = await readFile(new URL("../components/chat-dashboard.tsx", import.meta.url), "utf8");
  const file = ts.createSourceFile("chat-dashboard.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const stage = file.statements.find((statement) =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === "CallStage");
  assert.ok(stage);
  const text = stage.getText(file);
  assert.match(text, /participants\.filter\(\s*hasScreenShare/);
  assert.match(text, /<SpeakerLayout\b/);
  assert.match(text, /<PaginatedGridLayout\b/);
});
