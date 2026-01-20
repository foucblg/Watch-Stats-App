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

type SleepPhase = {
  type: string
  duration: number // en secondes
}

type MemberSleepPhases = {
  user_id: string
  email: string | null
  display_name: string | null
  sleepData: Array<{
    date: string
    phases: SleepPhase[]
    totalDuration: number // durée totale en secondes
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

  // Récupérer les données de sommeil avec les phases des 7 derniers jours
  const { data: sleepData, error: sleepError } = await supabase
    .from("sleep")
    .select("local_user_id, date, phase_type, phase_duration")
    .in("local_user_id", userIds)
    .gte("date", sevenDaysAgoStr)
    .order("date", { ascending: false })

  if (sleepError) {
    return json({ error: sleepError.message }, { status: 500 })
  }

  // Récupérer les informations des utilisateurs
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

  const usersMap = new Map<string, { email: string | null; display_name: string | null }>()

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

    if (usersMap.size >= userIds.length) {
      hasMore = false
    }
  }

  // Organiser les données par utilisateur et par date
  const membersPhases: MemberSleepPhases[] = userIds.map((userId) => {
    const userInfo = usersMap.get(userId) || { email: null, display_name: null }
    const userSleepData = (sleepData ?? []).filter((s: any) => s.local_user_id === userId)

    // Créer un Map pour organiser par date
    const sleepByDate = new Map<string, { phases: SleepPhase[]; totalDuration: number }>()

    // Initialiser les 7 derniers jours
    for (let i = 0; i < 7; i++) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      const dateStr = date.toISOString().split("T")[0]
      sleepByDate.set(dateStr, { phases: [], totalDuration: 0 })
    }

    // Remplir avec les données réelles
    userSleepData.forEach((s: any) => {
      if (s.date && s.phase_type && s.phase_duration) {
        const phaseTypes = Array.isArray(s.phase_type) ? s.phase_type : []
        const phaseDurations = Array.isArray(s.phase_duration) ? s.phase_duration : []
        
        const phases: SleepPhase[] = []
        let totalDuration = 0

        for (let i = 0; i < Math.min(phaseTypes.length, phaseDurations.length); i++) {
          const type = String(phaseTypes[i])
          const duration = Number(phaseDurations[i]) || 0
          phases.push({ type, duration })
          totalDuration += duration
        }

        sleepByDate.set(s.date, { phases, totalDuration })
      }
    })

    // Convertir en tableau trié par date (du plus récent au plus ancien)
    const sleepDataArray = Array.from(sleepByDate.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, data]) => ({
        date,
        phases: data.phases,
        totalDuration: data.totalDuration,
      }))

    return {
      user_id: userId,
      email: userInfo.email,
      display_name: userInfo.display_name,
      sleepData: sleepDataArray,
    }
  })

  return json({ members: membersPhases })
}
