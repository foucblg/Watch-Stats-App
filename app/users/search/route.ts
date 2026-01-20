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

type PublicUser = {
  id: string
  email: string | null
  display_name: string | null
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
          "Recherche impossible: variable serveur SUPABASE_SERVICE_ROLE_KEY manquante (ne jamais utiliser une clé NEXT_PUBLIC).",
      },
      { status: 500 },
    )
  }

  const token = getBearerToken(req)
  if (!token) return json({ error: "Non autorisé: token Bearer manquant." }, { status: 401 })

  // Vérifier le user (clé anon)
  const supabaseUser = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const {
    data: { user },
    error: userError,
  } = await supabaseUser.auth.getUser(token)
  if (userError || !user) return json({ error: "Non autorisé: token invalide ou expiré." }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = (searchParams.get("q") ?? "").trim().toLowerCase()
  if (q.length < 2) return json({ users: [] })

  const supabaseAdmin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  const maxUsers = 10
  const perPage = 200
  const maxPages = 5

  const matches: PublicUser[] = []

  for (let page = 1; page <= maxPages && matches.length < maxUsers; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage })
    if (error) return json({ error: error.message }, { status: 500 })

    const users = data?.users ?? []
    for (const u of users) {
      const email = (u.email ?? null) as string | null
      const dn = ((u.user_metadata as any)?.display_name ?? null) as string | null

      const hay = `${email ?? ""} ${dn ?? ""}`.toLowerCase()
      if (!hay.includes(q)) continue

      matches.push({ id: u.id, email, display_name: typeof dn === "string" ? dn : null })
      if (matches.length >= maxUsers) break
    }

    if (users.length < perPage) break
  }

  return json({ users: matches })
}

