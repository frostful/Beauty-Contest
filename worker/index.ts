/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
export { RoomEvents } from "./room-events";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  ADMIN_API_LIMITER?: RateLimit;
  GAME_API_LIMITER?: RateLimit;
  LIVE_CONNECT_LIMITER?: RateLimit;
  ROOM_CREATE_LIMITER?: RateLimit;
  ROOM_JOIN_LIMITER?: RateLimit;
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

const ROOM_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const SECURITY_HEADERS = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data:",
    "media-src 'self'",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline'",
    "connect-src 'self' ws: wss:",
  ].join("; "),
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
} as const;

function withSecurityHeaders(response: Response, requestUrl: URL): Response {
  const secured = new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    secured.headers.set(name, value);
  }
  if (requestUrl.protocol === "https:") {
    secured.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return secured;
}

function clientKey(request: Request): string {
  return request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-real-ip")
    ?? `local:${request.headers.get("user-agent") ?? "unknown"}`;
}

async function isAllowed(limiter: RateLimit | undefined, key: string): Promise<boolean> {
  if (!limiter) return true;
  try {
    return (await limiter.limit({ key })).success;
  } catch (error) {
    console.error("Rate limiter unavailable; allowing request.", error);
    return true;
  }
}

function rateLimited(url: URL): Response {
  return withSecurityHeaders(new Response(JSON.stringify({ error: "Too many requests. Try again shortly." }), {
    status: 429,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "Retry-After": "60",
    },
  }), url);
}

function websocketToken(request: Request, url: URL): string {
  const protocols = request.headers.get("sec-websocket-protocol")
    ?.split(",")
    .map((protocol) => protocol.trim());
  const authProtocol = protocols?.find((protocol) => protocol.startsWith("median.auth."));
  return authProtocol?.slice("median.auth.".length) ?? url.searchParams.get("token") ?? "";
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const requester = clientKey(request);

    if (url.pathname.startsWith("/api/admin") && !await isAllowed(env.ADMIN_API_LIMITER, requester)) {
      return rateLimited(url);
    }

    if (url.pathname === "/api/game") {
      if (!await isAllowed(env.GAME_API_LIMITER, requester)) return rateLimited(url);

      if (request.method === "POST") {
        const declaredLength = Number(request.headers.get("content-length") ?? "0");
        if (Number.isFinite(declaredLength) && declaredLength > 16_384) {
          return withSecurityHeaders(new Response(JSON.stringify({ error: "Request body is too large." }), {
            status: 413,
            headers: { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" },
          }), url);
        }

        let action = "";
        try {
          action = String((await request.clone().json() as { action?: unknown }).action ?? "");
        } catch {
          // The route returns the canonical malformed-body response.
        }
        if (action === "create" && !await isAllowed(env.ROOM_CREATE_LIMITER, requester)) return rateLimited(url);
        if ((action === "join" || action === "spectate") && !await isAllowed(env.ROOM_JOIN_LIMITER, requester)) {
          return rateLimited(url);
        }
      }
    }

    if (url.pathname === "/api/live") {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return withSecurityHeaders(new Response("WebSocket upgrade required.", { status: 426 }), url);
      }
      const code = (url.searchParams.get("code") ?? "").toUpperCase();
      const token = websocketToken(request, url);
      if (!/^[A-Z]{4}$/.test(code) || !/^[A-Za-z0-9_]{20,96}$/.test(token)) {
        return withSecurityHeaders(new Response("Invalid room or session.", { status: 400 }), url);
      }
      if (!await isAllowed(env.LIVE_CONNECT_LIMITER, `${requester}:${code}`)) return rateLimited(url);
      const binding = env.ROOM_EVENTS;
      if (!binding) return withSecurityHeaders(new Response("Realtime service unavailable.", { status: 503 }), url);
      const player = await env.DB.prepare("SELECT 1 FROM players WHERE room_code=? AND token=? LIMIT 1").bind(code, token).first();
      if (!player) return withSecurityHeaders(new Response("Room or player session not found.", { status: 404 }), url);
      await env.DB.prepare("UPDATE players SET last_seen=? WHERE room_code=? AND token=?").bind(Date.now(), code, token).run();
      const stub = binding.get(binding.idFromName(code));
      return stub.fetch(new Request(`https://room.internal/socket?code=${encodeURIComponent(code)}&token=${encodeURIComponent(token)}`, request));
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      const response = await handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
      return withSecurityHeaders(response, url);
    }

    const response = await handler.fetch(request, env, ctx);
    return withSecurityHeaders(response, url);
  },
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      env.DB.prepare("DELETE FROM rooms WHERE created_at < ?")
        .bind(Date.now() - ROOM_RETENTION_MS)
        .run()
        .then(() => undefined),
    );
  },
};

export default worker;
