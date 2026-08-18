export const dynamic = "force-dynamic";

const SUPABASE_URL = "https://duddukvihvuoqawsoqus.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_TcigjkGnxplktO6uSngk8w_UETJmWR6";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return Response.json({ error: "Sign in required" }, { status: 401 });

  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, authorization },
  });
  if (!userResponse.ok) return Response.json({ error: "Session expired" }, { status: 401 });

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
