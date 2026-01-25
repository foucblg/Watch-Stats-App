import { createClient } from "@supabase/supabase-js"

type AddMembersBody = {
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

export async function POST(
  req: Request,
  { params }: { params: Promise<{ groupId: string }> }
): Promise<Response> {
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
          "Ajout impossible: variable serveur SUPABASE_SERVICE_ROLE_KEY manquante (ne jamais utiliser une clé NEXT_PUBLIC).",
      },
      { status: 500 },
    )
  }

  const token = getBearerToken(req)
  if (!token) {
    return json({ error: "Non autorisé: token Bearer manquant." }, { status: 401 })
  }

  const { groupId } = await params

  let body: AddMembersBody = {}
  try {
    body = (await req.json()) as AddMembersBody
  } catch {
    return json({ error: "Body JSON invalide." }, { status: 400 })
  }

  const memberIdsRaw = Array.isArray(body.member_user_ids) ? body.member_user_ids : []
  const memberUserIds = uniqStrings(memberIdsRaw.filter(x => typeof x === "string") as string[])

  if (memberUserIds.length === 0) {
    return json({ error: "Aucun membre à ajouter." }, { status: 400 })
  }

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

  // 2) Créer le client admin
  const supabaseAdmin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  // 3) Vérifier que l'utilisateur est membre du groupe
  const { data: groupMember, error: groupMemberError } = await supabaseAdmin
    .from("group_users")
    .select("group_id")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (groupMemberError || !groupMember) {
    return json({ error: "Groupe introuvable ou accès non autorisé." }, { status: 403 })
  }

  // 4) Vérifier que tous les membres à ajouter sont des amis
  const { data: friendshipsAsRequester } = await supabaseAdmin
    .from("friendship")
    .select("addressee_id")
    .eq("requester_id", user.id)
    .eq("status", "accepted")

  const { data: friendshipsAsAddressee } = await supabaseAdmin
    .from("friendship")
    .select("requester_id")
    .eq("addressee_id", user.id)
    .eq("status", "accepted")

  // Collecter tous les IDs d'amis
  const friendIds = new Set<string>()
  if (friendshipsAsRequester) {
    friendshipsAsRequester.forEach((f: any) => friendIds.add(f.addressee_id))
  }
  if (friendshipsAsAddressee) {
    friendshipsAsAddressee.forEach((f: any) => friendIds.add(f.requester_id))
  }

  // Vérifier que tous les membres sont des amis
  const nonFriends = memberUserIds.filter(id => !friendIds.has(id))
  if (nonFriends.length > 0) {
    return json(
      { error: "Vous ne pouvez ajouter que vos amis dans un groupe." },
      { status: 400 }
    )
  }

  // 5) Vérifier quels membres sont déjà dans le groupe
  const { data: existingMembers, error: existingMembersError } = await supabaseAdmin
    .from("group_users")
    .select("user_id")
    .eq("group_id", groupId)
    .in("user_id", memberUserIds)

  if (existingMembersError) {
    return json({ error: existingMembersError.message }, { status: 500 })
  }

  const existingMemberIds = new Set((existingMembers || []).map((m: any) => m.user_id))
  const newMemberIds = memberUserIds.filter(id => !existingMemberIds.has(id))

  if (newMemberIds.length === 0) {
    return json({ error: "Tous les membres sélectionnés sont déjà dans le groupe." }, { status: 400 })
  }

  // 6) Ajouter les nouveaux membres
  const rows = newMemberIds.map(uid => ({ group_id: groupId, user_id: uid }))

  const { error: addMembersError } = await supabaseAdmin.from("group_users").insert(rows)
  if (addMembersError) {
    return json({ error: addMembersError.message }, { status: 500 })
  }

  return json({ added_count: newMemberIds.length, skipped_count: existingMemberIds.size }, { status: 200 })
}
