import test from "node:test";
import assert from "node:assert/strict";
import { peopleSearchFilter } from "./people-search.ts";

test("people search never creates an unfiltered query", () => {
  assert.equal(peopleSearchFilter(""), null);
  assert.equal(peopleSearchFilter(" \t "), null);
});

test("people search uses a trimmed partial name or username", () => {
  assert.deepEqual(peopleSearchFilter("  Alex  "), {
    $or: [
      { name: { $autocomplete: "Alex" } },
      { username: { $autocomplete: "Alex" } },
    ],
  });
});
