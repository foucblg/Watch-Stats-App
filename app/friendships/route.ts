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

type CreateFriendshipBody = {
  addressee_id?: unknown
}

type Friend = {
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

  // Récupérer les amis (statut accepted) via service role
  const supabaseAdmin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  // Récupérer les amitiés où l'utilisateur est le demandeur
  const { data: friendshipsAsRequester } = await supabaseAdmin
    .from("friendship")
    .select("addressee_id")
    .eq("requester_id", user.id)
    .eq("status", "accepted")

  // Récupérer les amitiés où l'utilisateur est le destinataire
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

  // Récupérer les informations des amis
  const friends: Friend[] = []
  for (const friendId of friendIds) {
    try {
      const { data: friend, error: friendError } = await supabaseAdmin.auth.admin.getUserById(friendId)
      if (friendError || !friend) continue

      const email = friend.email || null
      const displayName = ((friend.user_metadata as any)?.display_name ?? null) as string | null

      friends.push({
        id: friendId,
        email,
        display_name: displayName,
      })
    } catch (e) {
      // Ignore errors for individual users
    }
  }

  return json({ friends })
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

  let body: CreateFriendshipBody = {}
  try {
    body = (await req.json()) as CreateFriendshipBody
  } catch {
    return json({ error: "Body JSON invalide." }, { status: 400 })
  }

  const addresseeId = typeof body.addressee_id === "string" ? body.addressee_id.trim() : ""
  if (!addresseeId) return json({ error: "L'ID du destinataire est requis." }, { status: 400 })

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

  if (user.id === addresseeId) {
    return json({ error: "Vous ne pouvez pas vous ajouter vous-même comme ami." }, { status: 400 })
  }

  // Créer la demande d'amitié via service role
  const supabaseAdmin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  // Vérifier que le destinataire existe
  const { data: addressee, error: addresseeError } = await supabaseAdmin.auth.admin.getUserById(addresseeId)
  if (addresseeError || !addressee) {
    return json({ error: "Utilisateur introuvable." }, { status: 404 })
  }

  // Vérifier si une demande existe déjà (dans les deux sens)
  const { data: existing1 } = await supabaseAdmin
    .from("friendship")
    .select("id, status")
    .eq("requester_id", user.id)
    .eq("addressee_id", addresseeId)
    .maybeSingle()

  const { data: existing2 } = await supabaseAdmin
    .from("friendship")
    .select("id, status")
    .eq("requester_id", addresseeId)
    .eq("addressee_id", user.id)
    .maybeSingle()

  const existing = existing1 || existing2

  if (existing) {
    if (existing.status === "accepted") {
      return json({ error: "Vous êtes déjà ami avec cet utilisateur." }, { status: 400 })
    }
    if (existing.status === "pending") {
      return json({ error: "Une demande d'amitié est déjà en attente." }, { status: 400 })
    }
    // Si refusée, on peut créer une nouvelle demande
  }

  // Créer la nouvelle demande
  const { data: friendship, error: createError } = await supabaseAdmin
    .from("friendship")
    .insert({
      requester_id: user.id,
      addressee_id: addresseeId,
      status: "pending",
    })
    .select("id, requester_id, addressee_id, status, created_at")
    .single()

  if (createError || !friendship) {
    return json({ error: createError?.message || "Impossible de créer la demande d'amitié." }, { status: 500 })
  }

  return json({ friendship }, { status: 201 })
}
