import assert from "node:assert/strict";
import test from "node:test";
import { sessionEpochDecision, shouldAcceptHistory } from "./sessionOrdering";

test("a late response from an old server process cannot revert the active session epoch", () => {
  assert.equal(sessionEpochDecision("new-process", 12, "old-process", 8), "stale");
  assert.equal(sessionEpochDecision("old-process", 8, "new-process", 12), "new");
  assert.equal(sessionEpochDecision("new-process", 12, "new-process", 13), "same");
});

test("history is accepted only for the active process and a current-or-newer revision", () => {
  assert.equal(shouldAcceptHistory("new-process", "new-process", 3, 2), true);
  assert.equal(shouldAcceptHistory("old-process", "new-process", 99, 2), false);
  assert.equal(shouldAcceptHistory("new-process", "new-process", 1, 2), false);
});
