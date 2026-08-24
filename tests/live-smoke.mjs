import assert from "node:assert/strict";

const base = (process.argv[2] ?? "").replace(/\/$/, "");
if (!base.startsWith("https://")) throw new Error("Pass the deployed HTTPS origin.");

const post = async (body) => {
  const response = await fetch(`${base}/api/game`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  assert.equal(response.ok, true, JSON.stringify(data));
  return data;
};

const host = await post({ action: "create", name: "SMOKE-HOST", avatar: "diamond", roundSeconds: 30 });
const socketUrl = `${base.replace("https://", "wss://")}/api/live?code=${host.code}&token=${host.token}`;
const socket = new WebSocket(socketUrl);
const messages = [];
socket.addEventListener("message", (event) => messages.push(String(event.data)));
await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error("WebSocket did not open.")), 10_000);
  socket.addEventListener("open", () => { clearTimeout(timeout); resolve(); }, { once: true });
  socket.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("WebSocket failed.")); }, { once: true });
});

const guest = await post({ action: "join", code: host.code, name: "SMOKE-GUEST", avatar: "heart" });
await new Promise((resolve, reject) => {
  const started = Date.now();
  const timer = setInterval(() => {
    if (messages.some((message) => message.includes("invalidate"))) {
      clearInterval(timer);
      resolve();
    } else if (Date.now() - started > 10_000) {
      clearInterval(timer);
      reject(new Error("Room invalidation was not delivered."));
    }
  }, 50);
});

const response = await fetch(`${base}/api/game?code=${host.code}&token=${host.token}`);
const snapshot = await response.json();
assert.equal(response.ok, true, JSON.stringify(snapshot));
assert.equal(snapshot.players.length, 2);
assert.equal(snapshot.me.isHost, true);

await post({ action: "leave", code: host.code, token: guest.token });
await post({ action: "leave", code: host.code, token: host.token });
socket.close();

console.log(JSON.stringify({ ok: true, room: host.code, websocketMessages: messages.length }));
