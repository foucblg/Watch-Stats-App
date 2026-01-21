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

  try {
    // Récupérer les informations de connexion Garmin pour appeler l'API de désinscription
    const { data: garminUser, error: fetchError } = await supabase
      .from("garmin_users")
      .select("garmin_access_token, garmin_user_id")
      .eq("local_user_id", user.id)
      .single()

    if (fetchError && fetchError.code !== "PGRST116") {
      // PGRST116 = no rows returned, ce qui est OK
      return json({ error: fetchError.message }, { status: 500 })
    }

    // Si une connexion existe, appeler l'API Garmin pour supprimer l'enregistrement
    if (garminUser?.garmin_access_token) {
      try {
        const deleteResponse = await fetch("https://apis.garmin.com/wellness-api/rest/user/registration", {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${garminUser.garmin_access_token}`,
          },
        })

        // On continue même si l'API Garmin retourne une erreur (la connexion peut déjà être supprimée)
        if (!deleteResponse.ok) {
          console.warn("Garmin delete registration API returned:", deleteResponse.status)
        }
      } catch (e) {
        // Ignorer les erreurs de l'API Garmin, on supprime quand même localement
        console.warn("Error calling Garmin delete API:", e)
      }
    }

    // Supprimer l'enregistrement de la base de données locale
    const { error: deleteError } = await supabase
      .from("garmin_users")
      .delete()
      .eq("local_user_id", user.id)

    if (deleteError) {
      return json({ error: deleteError.message }, { status: 500 })
    }

    return json({ success: true })
  } catch (e: any) {
    console.error("Garmin disconnect error:", e)
    return json({ error: e?.message || "Erreur lors de la déconnexion de Garmin." }, { status: 500 })
  }
}
