import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { JOIN_PLAYER_SQL, LOCK_PICK_SQL, RESET_START_PLAYERS_SQL, START_ROOM_SQL } from "../lib/game-writes.ts";

function setup(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  db.exec("PRAGMA foreign_keys=ON");
  for (const name of ["0000_equal_johnny_blaze", "0001_awesome_banshee", "0002_room_guards"]) {
    db.exec(readFileSync(new URL(`../drizzle/${name}.sql`, import.meta.url), "utf8"));
  }
  db.prepare("INSERT INTO rooms (code,host_token,created_at) VALUES ('TEST','host',0)").run();
  db.prepare(JOIN_PLAYER_SQL).run("host", "TEST", "Host", "host", 1, 0, 0, "TEST", 0);
  db.prepare(JOIN_PLAYER_SQL).run("guest", "TEST", "Guest", "guest", 1, 0, 0, "TEST", 0);
  return db;
}

function start(db, count=2) {
  // D1 batch executes both writes in one transaction.
  db.exec("BEGIN");
  db.prepare(RESET_START_PLAYERS_SQL).run("TEST", "TEST", "host", "TEST", count);
  const result = db.prepare(START_ROOM_SQL).run("playing", count, 1000, null, "TEST", "host", "TEST", count);
  db.exec("COMMIT");
  return result.changes;
}

test("a choice before the deadline locks once and cannot be replaced", t => {
  const db = setup(t);
  start(db);
  assert.equal(db.prepare(LOCK_PICK_SQL).run(37, 999, "guest", 1, 999).changes, 1);
  assert.equal(db.prepare(LOCK_PICK_SQL).run(40, 999, "guest", 1, 999).changes, 0);
  assert.equal(db.prepare("SELECT pick FROM players WHERE id='guest'").get().pick, 37);
});

test("picks at or after the deadline are rejected even before resolution runs", t => {
  const db = setup(t);
  start(db);
  for (const now of [1000, 1001]) {
    assert.equal(db.prepare(LOCK_PICK_SQL).run(37, now, "guest", 1, now).changes, 0);
  }
});

test("a stale pick cannot write into resolution or a later round", t => {
  const db = setup(t);
  start(db);
  db.exec("UPDATE rooms SET status='resolving'");
  assert.equal(db.prepare(LOCK_PICK_SQL).run(37, 900, "guest", 1, 900).changes, 0);
  db.exec("UPDATE rooms SET status='playing', round=2, deadline=2000");
  assert.equal(db.prepare(LOCK_PICK_SQL).run(37, 1100, "guest", 1, 1100).changes, 0);
});

test("a join racing with start cannot add a contestant, but spectators may still join", t => {
  const db = setup(t);
  start(db);
  assert.equal(db.prepare(JOIN_PLAYER_SQL).run("late", "TEST", "Late", "late", 1, 0, 0, "TEST", 0).changes, 0);
  assert.equal(db.prepare(JOIN_PLAYER_SQL).run("bot", "TEST", "Bot", "bot_0_test", 1, 0, 0, "TEST", 0).changes, 0);
  assert.equal(db.prepare(JOIN_PLAYER_SQL).run("viewer", "TEST", "Viewer", "spectator_viewer", 0, 0, 0, "TEST", 1).changes, 1);
  db.exec("UPDATE rooms SET status='finished'");
  assert.equal(db.prepare(JOIN_PLAYER_SQL).run("viewer2", "TEST", "Viewer2", "spectator_viewer2", 0, 0, 0, "TEST", 1).changes, 0);
});

test("a duplicate start cannot erase a pick already made in the match", t => {
  const db = setup(t);
  assert.equal(start(db), 1);
  db.prepare(LOCK_PICK_SQL).run(37, 900, "guest", 1, 900);
  assert.equal(start(db), 0);
  assert.equal(db.prepare("SELECT pick FROM players WHERE id='guest'").get().pick, 37);
});

test("start retries when the roster changes so the opening rules use the correct count", t => {
  const db = setup(t);
  db.prepare(JOIN_PLAYER_SQL).run("third", "TEST", "Third", "third", 1, 0, 0, "TEST", 0);
  assert.equal(start(db, 2), 0);
  assert.equal(db.prepare("SELECT status FROM rooms").get().status, "lobby");
  assert.equal(start(db, 3), 1);
  assert.equal(db.prepare("SELECT initial_players FROM rooms").get().initial_players, 3);
});

test("starting preserves the spectator role", t => {
  const db = setup(t);
  db.prepare(JOIN_PLAYER_SQL).run("viewer", "TEST", "Viewer", "spectator_viewer", 0, 0, 0, "TEST", 1);
  start(db);
  assert.equal(db.prepare("SELECT alive FROM players WHERE id='viewer'").get().alive, 0);
});
