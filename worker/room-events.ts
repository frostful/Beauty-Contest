type SocketAttachment = { token: string };

type DurableObjectContext = {
  acceptWebSocket(socket: WebSocket): void;
  getWebSockets(): WebSocket[];
};

/**
 * One hibernatable room signal per match. The database remains authoritative;
 * this object only tracks live seats and tells clients when to fetch a fresh
 * snapshot. That keeps the socket payloads small and reconnects deterministic.
 */
export class RoomEvents {
  constructor(private readonly ctx: DurableObjectContext) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

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
    if (!token) return new Response("Missing player token.", { status: 401 });

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.serializeAttachment({ token } satisfies SocketAttachment);
    this.ctx.acceptWebSocket(server);
    server.send(JSON.stringify({ type: "ready", at: Date.now() }));
    return new Response(null, { status: 101, webSocket: client } as ResponseInit & { webSocket: WebSocket });
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    if (typeof message === "string" && message === "ping") socket.send("pong");
  }

  webSocketClose(socket: WebSocket, code: number, reason: string) {
    try { socket.close(code, reason); } catch { /* Already closed. */ }
  }

  webSocketError(socket: WebSocket) {
    try { socket.close(1011, "Socket error"); } catch { /* Already closed. */ }
  }
}
