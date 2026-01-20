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

export async function POST(req: Request): Promise<Response> {
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
          "Suppression impossible: variable serveur SUPABASE_SERVICE_ROLE_KEY manquante (ne jamais utiliser une clé NEXT_PUBLIC).",
      },
      { status: 500 },
    )
  }

  const token = getBearerToken(req)
  if (!token) return json({ error: "Non autorisé: token Bearer manquant." }, { status: 401 })

  // 1) Vérifier le user à partir du token (clé anon)
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

  // 2) Supprimer le user via service role (admin)
  const supabaseAdmin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id)
  if (deleteError) {
    return json({ error: deleteError.message }, { status: 500 })
  }

  return json({ ok: true })
}

