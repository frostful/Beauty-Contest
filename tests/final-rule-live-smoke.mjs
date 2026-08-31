import assert from "node:assert/strict";

const base = (process.argv[2] ?? "").replace(/\/$/, "");
if (!base.startsWith("https://")) throw new Error("Pass the deployed HTTPS origin.");

const post = async (body, token = "") => {
  const response = await fetch(`${base}/api/game`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  assert.equal(response.ok, true, JSON.stringify(data));
  return data;
};

const get = async (code, token) => {
  const response = await fetch(`${base}/api/game?code=${code}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const data = await response.json();
  assert.equal(response.ok, true, JSON.stringify(data));
  return data;
};

const host = await post({ action: "create", name: "ZERO-SEAT", avatar: "diamond", roundSeconds: 30 });
const guest = await post({ action: "join", code: host.code, name: "HUNDRED-SEAT", avatar: "heart" });
await post({ action: "start", code: host.code }, host.token);

let state = await get(host.code, host.token);
assert.equal(state.room.status, "briefing");
assert.deepEqual(state.room.amendmentIds, ["hundred_zero"]);
await new Promise((resolve) => setTimeout(resolve, Math.max(0, state.room.briefingEndsAt - Date.now() + 250)));

state = await get(host.code, host.token);
assert.equal(state.room.status, "playing");
await post({ action: "pick", code: host.code, pick: 0 }, host.token);
await post({ action: "pick", code: host.code, pick: 100 }, guest.token);

state = await get(host.code, host.token);
assert.equal(state.room.status, "results");
assert.equal(state.room.winnerName, "HUNDRED-SEAT");
assert.match(state.room.message, /100 defeats 0/i);
assert.equal(state.players.find((player) => player.name === "HUNDRED-SEAT").alive, true);
assert.equal(state.players.find((player) => player.name === "ZERO-SEAT").alive, false);

await post({ action: "leave", code: host.code }, guest.token);
await post({ action: "leave", code: host.code }, host.token);

console.log(JSON.stringify({ ok: true, room: host.code, winner: state.room.winnerName }));
