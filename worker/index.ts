/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
export { RoomEvents } from "./room-events";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  ROOM_EVENTS?: {
    idFromName(name: string): unknown;
    get(id: unknown): { fetch(request: Request): Promise<Response> };
  };
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/live") {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return new Response("WebSocket upgrade required.", { status: 426 });
      }
      const code = (url.searchParams.get("code") ?? "").toUpperCase();
      const token = url.searchParams.get("token") ?? "";
      const binding = env.ROOM_EVENTS;
      if (!binding) return new Response("Realtime service unavailable.", { status: 503 });
      const player = await env.DB.prepare("SELECT 1 FROM players WHERE room_code=? AND token=? LIMIT 1").bind(code, token).first();
      if (!player) return new Response("Room or player session not found.", { status: 404 });
      await env.DB.prepare("UPDATE players SET last_seen=? WHERE room_code=? AND token=?").bind(Date.now(), code, token).run();
      const stub = binding.get(binding.idFromName(code));
      return stub.fetch(new Request(`https://room.internal/socket?code=${encodeURIComponent(code)}&token=${encodeURIComponent(token)}`, request));
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
