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
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !anonKey || !serviceRoleKey) {
    return json(
      { error: "Configuration Supabase manquante." },
      { status: 500 },
    )
  }

  const token = getBearerToken(req)
  if (!token) {
    return json({ error: "Non autorisé: token Bearer manquant." }, { status: 401 })
  }

  // L'utilisateur lié à Garmin est celui du JWT, jamais celui envoyé dans le body
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

  let body: { code: string; code_verifier: string; local_user_id?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: "Body JSON invalide." }, { status: 400 })
  }

  const { code, code_verifier } = body
  const local_user_id = user.id

  if (!code || !code_verifier) {
    return json({ error: "Paramètres manquants (code, code_verifier)." }, { status: 400 })
  }

  if (body.local_user_id && body.local_user_id !== local_user_id) {
    return json({ error: "Le compte connecté ne correspond pas à la demande Garmin." }, { status: 403 })
  }

  // Vérifier les variables d'environnement Garmin
  const garminClientId = process.env.GARMIN_CLIENT_ID
  const garminClientSecret = process.env.GARMIN_CLIENT_SECRET

  if (!garminClientId || !garminClientSecret) {
    return json(
      { error: "Configuration Garmin manquante (GARMIN_CLIENT_ID / GARMIN_CLIENT_SECRET)." },
      { status: 500 },
    )
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/garmin/oauth/callback`

  try {
    // Échanger le code d'autorisation contre un access token
    const tokenResponse = await fetch("https://diauth.garmin.com/di-oauth2-service/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: garminClientId,
        client_secret: garminClientSecret,
        code: code,
        code_verifier: code_verifier,
        redirect_uri: redirectUri,
      }),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error("Garmin token error:", errorText)
      return json({ error: "Erreur lors de l'échange du token Garmin." }, { status: 500 })
    }

    const tokenData = await tokenResponse.json()
    const { access_token, refresh_token } = tokenData

    if (!access_token || !refresh_token) {
      return json({ error: "Tokens Garmin manquants dans la réponse." }, { status: 500 })
    }

    // Récupérer le Garmin User ID
    const userResponse = await fetch("https://apis.garmin.com/wellness-api/rest/user/id", {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    })

    if (!userResponse.ok) {
      return json({ error: "Erreur lors de la récupération du User ID Garmin." }, { status: 500 })
    }

    const userData = await userResponse.json()
    const garminUserId = userData.userId

    if (!garminUserId) {
      return json({ error: "User ID Garmin manquant dans la réponse." }, { status: 500 })
    }

    // Vérifier que l'utilisateur local existe
    const supabaseAdmin = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })

    const { data: localUserData } = await supabaseAdmin.auth.admin.getUserById(local_user_id)

    if (!localUserData?.user) {
      return json({ error: "Utilisateur local introuvable." }, { status: 404 })
    }

    // Insérer ou mettre à jour les tokens dans garmin_users
    const supabase = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })

    // Vérifier si l'utilisateur Garmin existe déjà
    const { data: existingGarminUser } = await supabase
      .from("garmin_users")
      .select("id")
      .eq("local_user_id", local_user_id)
      .single()

    if (existingGarminUser) {
      // Mettre à jour
      const { error: updateError } = await supabase
        .from("garmin_users")
        .update({
          garmin_user_id: garminUserId,
          garmin_access_token: access_token,
          garmin_refresh_token: refresh_token,
          updated_at: new Date().toISOString(),
        })
        .eq("local_user_id", local_user_id)

      if (updateError) {
        console.error("Error updating Garmin user:", updateError)
        return json({ error: "Erreur lors de la mise à jour de la connexion Garmin." }, { status: 500 })
      }
    } else {
      // Insérer
      const { error: insertError } = await supabase
        .from("garmin_users")
        .insert({
          local_user_id: local_user_id,
          garmin_user_id: garminUserId,
          garmin_access_token: access_token,
          garmin_refresh_token: refresh_token,
        })

      if (insertError) {
        console.error("Error inserting Garmin user:", insertError)
        return json({ error: "Erreur lors de l'insertion de la connexion Garmin." }, { status: 500 })
      }
    }

    return json({ success: true })
  } catch (e: any) {
    console.error("Garmin OAuth exchange error:", e)
    return json({ error: e?.message || "Erreur inconnue lors de l'échange OAuth." }, { status: 500 })
  }
}
