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

type LeaderboardEntry = {
  user_id: string
  display_name: string | null
  score: number | null
  date: string
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

  const supabaseAdmin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  // Récupérer les amis de l'utilisateur connecté
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

  // Récupérer la date d'aujourd'hui au format YYYY-MM-DD
  const today = new Date()
  const todayStr = today.toISOString().split("T")[0]

  // Récupérer tous les scores de sommeil d'aujourd'hui
  const { data: sleepData, error: sleepError } = await supabaseAdmin
    .from("sleep")
    .select("local_user_id, date, score")
    .eq("date", todayStr)
    .not("score", "is", null)
    .order("score", { ascending: false })

  if (sleepError) {
    return json({ error: sleepError.message }, { status: 500 })
  }

  if (!sleepData || sleepData.length === 0) {
    return json({ leaderboard: [] })
  }

  // Récupérer les IDs uniques des utilisateurs qui ont un score aujourd'hui
  const userIds = Array.from(new Set(sleepData.map((s: any) => s.local_user_id)))

  // Récupérer les informations des utilisateurs
  const usersMap = new Map<string, { display_name: string | null }>()

  // Parcourir les utilisateurs par pages si nécessaire
  const perPage = 1000
  let page = 1
  let hasMore = true

  while (hasMore) {
    const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    })

    if (usersError) {
      return json({ error: usersError.message }, { status: 500 })
    }

    const users = usersData?.users ?? []
    for (const u of users) {
      if (userIds.includes(u.id)) {
        const dn = ((u.user_metadata as any)?.display_name ?? null) as string | null
        usersMap.set(u.id, {
          display_name: typeof dn === "string" ? dn : null,
        })
      }
    }

    if (users.length < perPage) {
      hasMore = false
    } else {
      page++
    }

    // Si on a trouvé tous les utilisateurs, on peut arrêter
    if (usersMap.size >= userIds.length) {
      hasMore = false
    }
  }

  // Construire le classement
  const leaderboard: LeaderboardEntry[] = sleepData.map((s: any) => {
    const userInfo = usersMap.get(s.local_user_id)
    const isFriend = friendIds.has(s.local_user_id)
    const isCurrentUser = s.local_user_id === user.id
    
    // Si c'est l'utilisateur connecté ou un ami, on retourne le display_name, sinon null (on affichera l'id)
    const displayName = (isCurrentUser || isFriend) ? (userInfo?.display_name || null) : null

    return {
      user_id: s.local_user_id,
      display_name: displayName,
      score: s.score,
      date: s.date,
    }
  })

  return json({ leaderboard })
}
