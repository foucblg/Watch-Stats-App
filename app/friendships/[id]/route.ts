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

type UpdateFriendshipBody = {
  status?: unknown
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params
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
          "Mise à jour impossible: variable serveur SUPABASE_SERVICE_ROLE_KEY manquante (ne jamais utiliser une clé NEXT_PUBLIC).",
      },
      { status: 500 },
    )
  }

  const token = getBearerToken(req)
  if (!token) {
    return json({ error: "Non autorisé: token Bearer manquant." }, { status: 401 })
  }

  let body: UpdateFriendshipBody = {}
  try {
    body = (await req.json()) as UpdateFriendshipBody
  } catch {
    return json({ error: "Body JSON invalide." }, { status: 400 })
  }

  const status = typeof body.status === "string" ? body.status.trim() : ""
  if (!status || !["accepted", "refused"].includes(status)) {
    return json({ error: "Le statut doit être 'accepted' ou 'refused'." }, { status: 400 })
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

  // Récupérer la demande d'amitié
  const supabaseAdmin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  const { data: friendship, error: fetchError } = await supabaseAdmin
    .from("friendship")
    .select("id, requester_id, addressee_id, status")
    .eq("id", id)
    .single()

  if (fetchError || !friendship) {
    return json({ error: "Demande d'amitié introuvable." }, { status: 404 })
  }

  // Vérifier que l'utilisateur est le destinataire
  if (friendship.addressee_id !== user.id) {
    return json({ error: "Vous n'êtes pas autorisé à modifier cette demande." }, { status: 403 })
  }

  // Vérifier que la demande est en attente
  if (friendship.status !== "pending") {
    return json({ error: "Cette demande d'amitié a déjà été traitée." }, { status: 400 })
  }

  // Mettre à jour le statut
  const { data: updated, error: updateError } = await supabaseAdmin
    .from("friendship")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id, requester_id, addressee_id, status, updated_at")
    .single()

  if (updateError || !updated) {
    return json({ error: updateError?.message || "Impossible de mettre à jour la demande." }, { status: 500 })
  }

  return json({ friendship: updated })
}
