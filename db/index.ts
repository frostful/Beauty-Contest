import { env } from "cloudflare:workers";

export function getD1() {
  if (!env.DB) throw new Error("The game database is unavailable.");
  return env.DB;
}
