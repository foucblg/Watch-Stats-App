import { createClient } from "@supabase/supabase-js"

type Group = {
  id: string
  name: string
}

type CreateGroupBody = {
  name?: unknown
  member_user_ids?: unknown
}

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

function uniqStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

export async function GET(req: Request): Promise<Response> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    return json(
      { error: "Configuration Supabase manquante (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)." },
      { status: 500 },
    )
  }

  const token = getBearerToken(req)
  if (!token) {
    return json({ error: "Non autorisé: token Bearer manquant." }, { status: 401 })
  }

  const supabase = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  })

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token)

  if (userError || !user) {
    return json({ error: "Non autorisé: token invalide ou expiré." }, { status: 401 })
  }

  // Option A: partir de group_users et embarquer groups
  const { data, error } = await supabase
    .from("group_users")
    .select("group_id, groups ( id, name )")
    .eq("user_id", user.id)

  if (error) {
    return json({ error: error.message }, { status: 500 })
  }

  const groups: Group[] = (data ?? [])
    .map((row: any) => row?.groups)
    .filter(Boolean)
    .map((g: any) => ({ id: String(g.id), name: String(g.name) }))

  return json({ groups })
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
          "Création impossible: variable serveur SUPABASE_SERVICE_ROLE_KEY manquante (ne jamais utiliser une clé NEXT_PUBLIC).",
      },
      { status: 500 },
    )
  }

  const token = getBearerToken(req)
  if (!token) {
    return json({ error: "Non autorisé: token Bearer manquant." }, { status: 401 })
  }

  let body: CreateGroupBody = {}
  try {
    body = (await req.json()) as CreateGroupBody
  } catch {
    return json({ error: "Body JSON invalide." }, { status: 400 })
  }

  const name = typeof body.name === "string" ? body.name.trim() : ""
  if (!name) return json({ error: "Le nom du groupe est requis." }, { status: 400 })
  if (name.length > 80) return json({ error: "Le nom du groupe est trop long (max 80)." }, { status: 400 })

  const memberIdsRaw = Array.isArray(body.member_user_ids) ? body.member_user_ids : []
  const memberUserIds = uniqStrings(memberIdsRaw.filter(x => typeof x === "string") as string[])

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

  // 2) Créer le groupe + membres via service role
  const supabaseAdmin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  const { data: createdGroup, error: createGroupError } = await supabaseAdmin
    .from("groups")
    .insert({ name })
    .select("id, name")
    .single()

  if (createGroupError || !createdGroup) {
    return json({ error: createGroupError?.message || "Impossible de créer le groupe." }, { status: 500 })
  }

  const allUserIds = uniqStrings([user.id, ...memberUserIds])
  const rows = allUserIds.map(uid => ({ group_id: createdGroup.id, user_id: uid }))

  const { error: addMembersError } = await supabaseAdmin.from("group_users").insert(rows)
  if (addMembersError) {
    // rollback best-effort (évite les groupes orphelins)
    await supabaseAdmin.from("groups").delete().eq("id", createdGroup.id)
    return json({ error: addMembersError.message }, { status: 500 })
  }

  return json({ group: createdGroup, members_count: allUserIds.length }, { status: 201 })
}
