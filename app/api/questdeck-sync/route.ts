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
  const user = await userResponse.json() as { id?: string; email?: string };
  if (!user.id || !user.email) return Response.json({ error: "Account identity is incomplete" }, { status: 401 });

  const memberResponse = await fetch(`${SUPABASE_URL}/rest/v1/questdeck_members?select=id&email=eq.${encodeURIComponent(user.email)}&status=eq.Active&limit=1`, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, authorization },
  });
  if (!memberResponse.ok) return Response.json({ error: "Workspace access could not be verified" }, { status: 403 });
  const memberships = await memberResponse.json() as Array<{ id: number }>;
  if (!memberships.length) return Response.json({ error: "This account is not an active workspace member" }, { status: 403 });

  const syncUrl = process.env.QUESTDECK_SYNC_URL;
  const syncSecret = process.env.QUESTDECK_SYNC_SECRET;
  if (!syncUrl || !syncSecret) return Response.json({ error: "Sync is not configured" }, { status: 503 });

  const response = await fetch(syncUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-questdeck-sync-secret": syncSecret,
      "x-questdeck-user-id": user.id,
      "x-questdeck-user-email": user.email,
    },
    body: await request.text(),
  });

  return new Response(await response.text(), {
    status: response.status,
    headers: { "content-type": "application/json" },
  });
}
