type SocketAttachment = { token: string; roomCode: string };

type DurableObjectStorage = {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  setAlarm(scheduledTime: number | Date): Promise<void>;
  deleteAlarm(): Promise<void>;
};

type DurableObjectContext = {
  acceptWebSocket(socket: WebSocket): void;
  getWebSockets(): WebSocket[];
  storage: DurableObjectStorage;
};

type RoomEventsEnv = { DB: D1Database };

const EMPTY_ROOM_TTL_MS = 2 * 60 * 1000;
const isHumanToken = (token: string) => !token.startsWith("bot_") && !token.startsWith("spectator_");

/**
 * One hibernatable room signal per match. The database remains authoritative;
 * this object only tracks live seats and tells clients when to fetch a fresh
 * snapshot. That keeps the socket payloads small and reconnects deterministic.
 */
export class RoomEvents {
  private roomCode = "";

  constructor(private readonly ctx: DurableObjectContext, private readonly env: RoomEventsEnv) {}

  private socketToken(socket: WebSocket) {
    try { return (socket.deserializeAttachment() as SocketAttachment | null)?.token ?? ""; }
    catch { return ""; }
  }

  private connectedHumanCount(except?: WebSocket) {
    return this.ctx.getWebSockets().filter(socket => socket !== except && isHumanToken(this.socketToken(socket))).length;
  }

  private async rememberRoom(code: string) {
    if (!code || this.roomCode === code) return;
    this.roomCode = code;
    await this.ctx.storage.put("roomCode", code);
  }

  private async updateExpiryAlarm(except?: WebSocket) {
    if (this.connectedHumanCount(except) > 0) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    await this.ctx.storage.setAlarm(Date.now() + EMPTY_ROOM_TTL_MS);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const code = (url.searchParams.get("code") ?? "").toUpperCase();
    await this.rememberRoom(code);

    if (url.pathname === "/notify" && request.method === "POST") {
      const message = JSON.stringify({ type: "invalidate", at: Date.now() });
      for (const socket of this.ctx.getWebSockets()) {
        try { socket.send(message); } catch { /* Closed sockets are discarded by the runtime. */ }
      }
      return Response.json({ delivered: this.ctx.getWebSockets().length });
    }

    if (url.pathname === "/connections") {
      const tokens = this.ctx.getWebSockets().flatMap(socket => {
        try {
          const attachment = socket.deserializeAttachment() as SocketAttachment | null;
          return attachment?.token ? [attachment.token] : [];
        } catch { return []; }
      });
      return Response.json({ tokens: [...new Set(tokens)] });
    }

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket upgrade required.", { status: 426 });
    }

    const token = url.searchParams.get("token") ?? "";
    if (!token || !code) return new Response("Missing room or player token.", { status: 401 });

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.serializeAttachment({ token, roomCode: code } satisfies SocketAttachment);
    this.ctx.acceptWebSocket(server);
    if (isHumanToken(token)) await this.ctx.storage.deleteAlarm();
    else await this.updateExpiryAlarm();
    server.send(JSON.stringify({ type: "ready", at: Date.now() }));
    return new Response(null, { status: 101, webSocket: client } as ResponseInit & { webSocket: WebSocket });
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    if (typeof message === "string" && message === "ping") socket.send("pong");
  }

  async webSocketClose(socket: WebSocket, code: number, reason: string) {
    try { socket.close(code, reason); } catch { /* Already closed. */ }
    await this.updateExpiryAlarm(socket);
  }

  async webSocketError(socket: WebSocket) {
    try { socket.close(1011, "Socket error"); } catch { /* Already closed. */ }
    await this.updateExpiryAlarm(socket);
  }

  async alarm() {
    if (this.connectedHumanCount() > 0) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    const code = this.roomCode || await this.ctx.storage.get<string>("roomCode") || "";
    if (!code) return;

    const message = JSON.stringify({ type: "expired", at: Date.now() });
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.send(message); socket.close(1000, "Room expired"); } catch { /* Already closed. */ }
    }
    await this.env.DB.prepare("DELETE FROM rooms WHERE code=?").bind(code).run();
  }
}
