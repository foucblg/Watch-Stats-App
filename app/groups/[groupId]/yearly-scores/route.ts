import { createClient } from "@supabase/supabase-js"
import type { SleepScoreRow } from "@/lib/types/sleep"

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

type YearlyScore = {
  date: string
  user_id: string
  score: number | null
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
    return json({ scores: [] })
  }

  // Calculer les dates du début et de la fin de l'année (1er janvier au 31 décembre de l'année en cours)
  const now = new Date()
  const year = now.getFullYear()
  const startOfYear = new Date(year, 0, 1)
  const endOfYear = new Date(year, 11, 31)
  const startOfYearStr = startOfYear.toISOString().split("T")[0]
  const endOfYearStr = endOfYear.toISOString().split("T")[0]

  // Récupérer les scores de sommeil de toute l'année pour tous les membres
  const { data: sleepData, error: sleepError } = await supabase
    .from("sleep")
    .select("local_user_id, date, score")
    .in("local_user_id", userIds)
    .gte("date", startOfYearStr)
    .lte("date", endOfYearStr)
    .order("date", { ascending: true })

  if (sleepError) {
    return json({ error: sleepError.message }, { status: 500 })
  }

  // Organiser les données par date et utilisateur
  const scoresByDate: Map<string, YearlyScore[]> = new Map()

  // Initialiser toutes les dates de l'année complète (du 1er janvier au 31 décembre)
  const currentDate = new Date(startOfYear)
  while (currentDate <= endOfYear) {
    const dateStr = currentDate.toISOString().split("T")[0]
    scoresByDate.set(dateStr, userIds.map(userId => ({
      date: dateStr,
      user_id: userId,
      score: null,
    })))
    currentDate.setDate(currentDate.getDate() + 1)
  }

  // Remplir avec les données réelles
  ;(sleepData ?? []).forEach((s: SleepScoreRow) => {
    if (s.date && s.local_user_id) {
      const existing = scoresByDate.get(s.date)
      if (existing) {
        const userScore = existing.find(score => score.user_id === s.local_user_id)
        if (userScore) {
          userScore.score = s.score
        }
      }
    }
  })

  // Convertir en tableau
  const scores: YearlyScore[] = Array.from(scoresByDate.values()).flat()

  return json({ scores })
}
