import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const migrations = [
  "../drizzle/0000_equal_johnny_blaze.sql",
  "../drizzle/0001_awesome_banshee.sql",
  "../drizzle/0002_room_guards.sql",
];

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const migration of migrations) {
    const sql = readFileSync(new URL(migration, import.meta.url), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) db.exec(statement);
    }
  }
  db.prepare("INSERT INTO rooms (code, host_token, created_at) VALUES (?, ?, ?)").run("TEST", "host-token", Date.now());
  return db;
}

function insertPlayer(db, index, { spectator = false, host = false } = {}) {
  const token = spectator ? `spectator_${index}` : `human_${index}`;
  db.prepare("INSERT INTO players (id, room_code, name, token, is_host, joined_at, last_seen) VALUES (?, 'TEST', ?, ?, ?, 0, 0)")
    .run(`player-${index}`, `Player ${index}`, token, host ? 1 : 0);
}

test("database enforces the five contestant seat limit atomically", () => {
  const db = database();
  for (let index = 0; index < 5; index++) insertPlayer(db, index, { host: index === 0 });
  assert.throws(() => insertPlayer(db, 5), /room_full/);
  db.close();
});

test("database enforces the spectator gallery limit atomically", () => {
  const db = database();
  for (let index = 0; index < 24; index++) insertPlayer(db, index, { spectator: true });
  assert.throws(() => insertPlayer(db, 24, { spectator: true }), /gallery_full/);
  db.close();
});

test("database rejects invalid locked choices", () => {
  const db = database();
  insertPlayer(db, 0, { host: true });
  assert.throws(() => db.prepare("UPDATE players SET pick = 101, submitted = 1 WHERE id = 'player-0'").run(), /invalid_pick/);
  assert.throws(() => db.prepare("UPDATE players SET pick = 2.5, submitted = 1 WHERE id = 'player-0'").run(), /invalid_pick/);
  db.close();
});

test("database permits only one host per room", () => {
  const db = database();
  insertPlayer(db, 0, { host: true });
  assert.throws(() => insertPlayer(db, 1, { host: true }), /UNIQUE constraint failed/);
  db.close();
});
