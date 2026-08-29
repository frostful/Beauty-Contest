import assert from "node:assert/strict";
import test from "node:test";
import { RoomEvents } from "../worker/room-events.ts";

class FakeStorage {
  alarm = null;
  deletedAll = false;
  values = new Map();

  async get(key) { return this.values.get(key); }
  async put(key, value) { this.values.set(key, value); }
  async setAlarm(value) { this.alarm = Number(value); }
  async deleteAlarm() { this.alarm = null; }
  async deleteAll() { this.deletedAll = true; this.values.clear(); this.alarm = null; }
}

function setup(sockets = []) {
  const storage = new FakeStorage();
  const deletedRooms = [];
  const ctx = {
    acceptWebSocket() {},
    getWebSockets: () => sockets,
    storage,
  };
  const env = {
    DB: {
      prepare() {
        return {
          bind(code) {
            return { async run() { deletedRooms.push(code); } };
          },
        };
      },
    },
  };
  return { room: new RoomEvents(ctx, env), storage, deletedRooms };
}

test("a room is armed for expiry before its first WebSocket opens", async () => {
  const { room, storage } = setup();
  const before = Date.now();
  const response = await room.fetch(new Request("https://room.internal/notify?code=ABCD", { method: "POST" }));
  assert.equal(response.status, 200);
  assert.ok(storage.alarm >= before + 120_000);
  assert.ok(storage.alarm <= Date.now() + 120_000);
});

test("a connected human cancels the empty-room alarm", async () => {
  const human = { deserializeAttachment: () => ({ token: "human-token", roomCode: "ABCD" }) };
  const { room, storage } = setup([human]);
  storage.alarm = Date.now() + 1_000;
  await room.fetch(new Request("https://room.internal/notify?code=ABCD", { method: "POST" }));
  assert.equal(storage.alarm, null);
});

test("expiry removes the D1 room and the coordinator's own storage", async () => {
  const { room, storage, deletedRooms } = setup();
  await room.fetch(new Request("https://room.internal/notify?code=WXYZ", { method: "POST" }));
  await room.alarm();
  assert.deepEqual(deletedRooms, ["WXYZ"]);
  assert.equal(storage.deletedAll, true);
});
