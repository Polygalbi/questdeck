export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const userId = request.headers.get("oai-authenticated-user-id");
  if (!userId) return Response.json({ error: "Sign in required" }, { status: 401 });

  const syncUrl = process.env.QUESTDECK_SYNC_URL;
  const syncSecret = process.env.QUESTDECK_SYNC_SECRET;
  if (!syncUrl || !syncSecret) return Response.json({ error: "Sync is not configured" }, { status: 503 });

  const response = await fetch(syncUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-questdeck-sync-secret": syncSecret,
    },
    body: await request.text(),
  });

  return new Response(await response.text(), {
    status: response.status,
    headers: { "content-type": "application/json" },
  });
}
