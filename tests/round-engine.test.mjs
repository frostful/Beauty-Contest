import assert from "node:assert/strict";
import test from "node:test";
import { calculateRound } from "../lib/round-engine.ts";

const player = (id, pick, score = 0, submitted = true) => ({
  id,
  name: id.toUpperCase(),
  score,
  pick,
  submitted,
});

test("an absent submission is excluded instead of impersonating a zero", () => {
  const result = calculateRound(
    [player("zero", 0), player("away", null, 0, false)],
    { eliminatedBefore: 0, previousWasTie: false },
  );
  assert.equal(result.average, 0);
  assert.equal(result.target, 0);
  assert.deepEqual(result.winnerIds, ["zero"]);
  assert.equal(result.outcomes.find((item) => item.id === "away").delta, -1);
});

test("duplicate choices become invalid only after the rule unlocks", () => {
  const open = calculateRound(
    [player("a", 25), player("b", 25), player("c", 40)],
    { eliminatedBefore: 0, previousWasTie: false },
  );
  assert.equal(open.invalidIds.size, 0);

  const restricted = calculateRound(
    [player("a", 25), player("b", 25), player("c", 40)],
    { eliminatedBefore: 1, previousWasTie: false },
  );
  assert.deepEqual([...restricted.invalidIds].sort(), ["a", "b"]);
  assert.deepEqual(restricted.winnerIds, ["c"]);
});

test("the exact-hit modifier doubles losses without changing the winner reward", () => {
  const result = calculateRound(
    [player("winner", 32), player("other", 48)],
    { eliminatedBefore: 2, previousWasTie: false },
  );
  assert.equal(result.target, 32);
  assert.equal(result.exact, true);
  assert.equal(result.outcomes.find((item) => item.id === "winner").delta, 1);
  assert.equal(result.outcomes.find((item) => item.id === "other").delta, -2);
});

test("100 defeats 0 and wins the match whenever only two living players remain", () => {
  const result = calculateRound(
    [player("zero", 0), player("hundred", 100)],
    { eliminatedBefore: 0, previousWasTie: false },
  );
  assert.deepEqual(result.winnerIds, ["hundred"]);
  assert.equal(result.gameWinnerId, "hundred");
  assert.equal(result.outcomes.find((item) => item.id === "hundred").alive, true);
  assert.equal(result.outcomes.find((item) => item.id === "zero").alive, false);
  assert.match(result.notice, /match is over/i);
});

test("0 versus 100 remains a normal calculation while more than two players remain", () => {
  const result = calculateRound(
    [player("zero", 0), player("hundred", 100), player("middle", 50)],
    { eliminatedBefore: 0, previousWasTie: false },
  );
  assert.deepEqual(result.winnerIds, ["middle"]);
  assert.equal(result.gameWinnerId, null);
  assert.equal(result.outcomes.every((item) => item.alive), true);
});

test("elimination is derived only from the committed round outcome", () => {
  const result = calculateRound(
    [player("winner", 20, -9), player("loser", 80, -9)],
    { eliminatedBefore: 0, previousWasTie: false },
  );
  assert.equal(result.outcomes.find((item) => item.id === "winner").alive, true);
  assert.equal(result.outcomes.find((item) => item.id === "loser").alive, false);
});
