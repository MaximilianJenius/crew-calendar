/**
 * Sends JSON and returns the JSON reply. Throws an Error with a readable message on failure, including
 * when the server answers with an HTML error page or the network drops.
 */
export async function postJson<T = unknown>(url: string, body?: unknown, method = "POST"): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("Couldn't reach the server. Check your connection and try again.");
  }
  const json = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || json === null) {
    throw new Error(json?.error ?? `Something went wrong (error ${res.status}). Try again.`);
  }
  return json;
}
