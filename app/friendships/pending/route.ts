import { createClient } from "@supabase/supabase-js"

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init?.headers ?? {}),
    },
  })
}

function getBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization")
  if (!header) return null

  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

type PendingFriendship = {
  id: string
  requester_id: string
  addressee_id: string
  status: string
  created_at: string
  requester_email: string | null
  requester_display_name: string | null
}

export async function GET(req: Request): Promise<Response> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !anonKey) {
    return json(
      { error: "Configuration Supabase manquante (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)." },
      { status: 500 },
    )
  }

  if (!serviceRoleKey) {
    return json(
      {
        error:
          "Récupération impossible: variable serveur SUPABASE_SERVICE_ROLE_KEY manquante (ne jamais utiliser une clé NEXT_PUBLIC).",
      },
      { status: 500 },
    )
  }

  const token = getBearerToken(req)
  if (!token) {
    return json({ error: "Non autorisé: token Bearer manquant." }, { status: 401 })
  }

  // Vérifier le user à partir du token (clé anon)
  const supabaseUser = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const {
    data: { user },
    error: userError,
  } = await supabaseUser.auth.getUser(token)

  if (userError || !user) {
    return json({ error: "Non autorisé: token invalide ou expiré." }, { status: 401 })
  }

  // Récupérer les invitations en attente où l'utilisateur est le destinataire
  const supabaseAdmin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  const { data: friendships, error: fetchError } = await supabaseAdmin
    .from("friendship")
    .select("id, requester_id, addressee_id, status, created_at")
    .eq("addressee_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })

  if (fetchError) {
    return json({ error: fetchError.message }, { status: 500 })
  }

  // Récupérer les informations des demandeurs
  const pendingFriendships: PendingFriendship[] = []
  for (const f of friendships || []) {
    try {
      const { data: requester, error: requesterError } = await supabaseAdmin.auth.admin.getUserById(f.requester_id)
      if (requesterError || !requester) continue

      const email = requester.email || null
      const displayName = ((requester.user_metadata as any)?.display_name ?? null) as string | null

      pendingFriendships.push({
        id: String(f.id),
        requester_id: f.requester_id,
        addressee_id: f.addressee_id,
        status: f.status,
        created_at: f.created_at,
        requester_email: email,
        requester_display_name: displayName,
      })
    } catch (e) {
      // Ignore errors for individual users
    }
  }

  return json({ friendships: pendingFriendships })
}
