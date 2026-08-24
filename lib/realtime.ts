import { env } from "cloudflare:workers";

type RoomEventsNamespace = {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
};

const namespace = () => (env as unknown as { ROOM_EVENTS?: RoomEventsNamespace }).ROOM_EVENTS;

const roomStub = (code: string) => {
  const binding = namespace();
  return binding ? binding.get(binding.idFromName(code)) : null;
};

export async function notifyRoom(code: string) {
  const stub = roomStub(code);
  if (!stub) return false;
  try {
    await stub.fetch(new Request("https://room.internal/notify", { method: "POST" }));
    return true;
  } catch {
    // Sites previews do not provide this optional binding. HTTP fallback stays functional.
    return false;
  }
}

export async function getOnlineTokens(code: string): Promise<Set<string> | null> {
  const stub = roomStub(code);
  if (!stub) return null;
  try {
    const response = await stub.fetch(new Request("https://room.internal/connections"));
    if (!response.ok) return null;
    const data = await response.json() as { tokens?: string[] };
    return new Set(data.tokens ?? []);
  } catch {
    return null;
  }
}
