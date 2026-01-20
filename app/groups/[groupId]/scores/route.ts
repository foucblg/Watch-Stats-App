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

type MemberScore = {
  user_id: string
  email: string | null
  display_name: string | null
  scores: Array<{
    date: string
    score: number | null
  }>
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ groupId: string }> }
): Promise<Response> {
  const { groupId } = await params
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

  // Vérifier que l'utilisateur appartient au groupe
  const { data: groupMembership, error: membershipError } = await supabase
    .from("group_users")
    .select("group_id")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .single()

  if (membershipError || !groupMembership) {
    return json({ error: "Vous n'appartenez pas à ce groupe." }, { status: 403 })
  }

  // Récupérer tous les membres du groupe
  const { data: groupMembers, error: membersError } = await supabase
    .from("group_users")
    .select("user_id")
    .eq("group_id", groupId)

  if (membersError) {
    return json({ error: membersError.message }, { status: 500 })
  }

  const userIds = (groupMembers ?? []).map((m: any) => m.user_id)

  if (userIds.length === 0) {
    return json({ members: [] })
  }

  // Calculer la date d'il y a 7 jours
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0]

  // Récupérer les scores de sommeil des 7 derniers jours pour tous les membres
  const { data: sleepData, error: sleepError } = await supabase
    .from("sleep")
    .select("local_user_id, date, score")
    .in("local_user_id", userIds)
    .gte("date", sevenDaysAgoStr)
    .order("date", { ascending: false })

  if (sleepError) {
    return json({ error: sleepError.message }, { status: 500 })
  }

  // Récupérer les informations des utilisateurs (email, display_name)
  // On utilise auth.admin.listUsers avec serviceRoleKey pour accéder aux infos utilisateur
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    return json(
      { error: "Configuration Supabase manquante (SUPABASE_SERVICE_ROLE_KEY)." },
      { status: 500 },
    )
  }

  const supabaseAdmin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  // Récupérer les infos utilisateurs
  const usersMap = new Map<string, { email: string | null; display_name: string | null }>()

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
        const email = (u.email ?? null) as string | null
        const dn = ((u.user_metadata as any)?.display_name ?? null) as string | null
        usersMap.set(u.id, {
          email,
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

  // Organiser les données par utilisateur
  const membersScores: MemberScore[] = userIds.map((userId) => {
    const userInfo = usersMap.get(userId) || { email: null, display_name: null }
    const userSleepData = (sleepData ?? []).filter((s: any) => s.local_user_id === userId)

    // Créer un tableau avec les 7 derniers jours
    const scoresByDate = new Map<string, number | null>()
    for (let i = 0; i < 7; i++) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      const dateStr = date.toISOString().split("T")[0]
      scoresByDate.set(dateStr, null)
    }

    // Remplir avec les données réelles
    userSleepData.forEach((s: any) => {
      if (s.date) {
        scoresByDate.set(s.date, s.score)
      }
    })

    // Convertir en tableau trié par date (du plus récent au plus ancien)
    const scores = Array.from(scoresByDate.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, score]) => ({ date, score }))

    return {
      user_id: userId,
      email: userInfo.email,
      display_name: userInfo.display_name,
      scores,
    }
  })

  return json({ members: membersScores })
}
