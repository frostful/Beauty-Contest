/** Never expose JSON parser errors or an HTML server error page to players. */
export async function readApiResponse(response: Response): Promise<Record<string, unknown>> {
  let data: unknown;
  try { data = await response.json(); }
  catch {
    throw new Error(response.ok
      ? "The server returned an incomplete response. Please try again."
      : "The game service is temporarily unavailable. Please try again.");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("The server returned an incomplete response. Please try again.");
  }
  const body = data as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "The game service is temporarily unavailable. Please try again.");
  return body;
}
