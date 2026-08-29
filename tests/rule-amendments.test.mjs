import assert from "node:assert/strict";
import test from "node:test";
import { tieBriefingIds } from "../lib/rule-amendments.ts";

test("a non-tie does not schedule a tie briefing", () => {
  assert.deepEqual(tieBriefingIds({
    currentWasTie: false,
    previousWasTie: true,
    deadlockPreviouslyAnnounced: false,
  }), []);
});

test("the first tie announces only the newly sealed number", () => {
  assert.deepEqual(tieBriefingIds({
    currentWasTie: true,
    previousWasTie: false,
    deadlockPreviouslyAnnounced: false,
  }), ["tie_seal"]);
});

test("the first consecutive tie introduces the deadlock rule after sealing the number", () => {
  assert.deepEqual(tieBriefingIds({
    currentWasTie: true,
    previousWasTie: true,
    deadlockPreviouslyAnnounced: false,
  }), ["tie_seal", "consecutive_tie"]);
});

test("later consecutive ties do not replay the deadlock rule introduction", () => {
  assert.deepEqual(tieBriefingIds({
    currentWasTie: true,
    previousWasTie: true,
    deadlockPreviouslyAnnounced: true,
  }), ["tie_seal"]);
});
