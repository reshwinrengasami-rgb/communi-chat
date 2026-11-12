import test from "node:test";
import assert from "node:assert/strict";
import { peopleSearchPattern, peopleSearchTerm } from "./people-search.ts";

test("people search never creates an unfiltered query", () => {
  assert.equal(peopleSearchTerm(""), null);
  assert.equal(peopleSearchTerm(" \t "), null);
  assert.equal(peopleSearchTerm("a"), null);
  assert.equal(peopleSearchTerm("a".repeat(81)), null);
});

test("people search uses a trimmed partial name or username", () => {
  assert.equal(peopleSearchTerm("  Alex  "), "Alex");
  assert.equal(peopleSearchPattern("Alex").test("alexander"), true);
  assert.equal(peopleSearchPattern(".*").test("anyone"), false);
  assert.equal(peopleSearchPattern(".*").test(".*literal"), true);
});
