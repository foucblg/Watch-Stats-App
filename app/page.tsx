'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Group = {
  id: string
  name: string
}

type SearchUser = {
  id: string
  email: string | null
  display_name: string | null
}

export default function Home() {
  const router = useRouter()
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [accountOpen, setAccountOpen] = useState(false)
  const [createGroupOpen, setCreateGroupOpen] = useState(false)
  const [userEmail, setUserEmail] = useState<string>('')
  const [displayName, setDisplayName] = useState<string>('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false

    // Vérifier les paramètres de retour OAuth Garmin
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const garminConnected = params.get('garmin_connected')
      const oauthError = params.get('error')
      
      if (garminConnected === 'success') {
        setError('')
        // Nettoyer l'URL
        window.history.replaceState({}, '', window.location.pathname)
        // Ouvrir le modal de compte pour montrer le statut
        setAccountOpen(true)
      } else if (oauthError && oauthError.startsWith('garmin_')) {
        const errorMessage = params.get('message') || 'Erreur lors de la connexion à Garmin'
        setError(`Garmin: ${errorMessage}`)
        // Nettoyer l'URL
        window.history.replaceState({}, '', window.location.pathname)
      }
    }

    async function load() {
      setLoading(true)
      setError('')

      const { data: sessionData } = await supabase.auth.getSession()
      const session = sessionData.session
      const token = session?.access_token

      const email = session?.user?.email ?? ''
      const dn = (session?.user?.user_metadata as any)?.display_name ?? ''
      if (!cancelled) {
        setUserEmail(email)
        setDisplayName(typeof dn === 'string' ? dn : '')
      }

      if (!token) {
        router.replace('/login')
        return
      }

      try {
        const res = await fetch('/groups', {
          headers: { Authorization: `Bearer ${token}` },
        })

        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(body?.error || `Erreur API (${res.status})`)
        }

        if (!cancelled) {
          setGroups(Array.isArray(body?.groups) ? body.groups : [])
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Une erreur est survenue.')
          setGroups([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [router, reloadKey])

  return (
    <main className="p-6">
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold">Mes groupes</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCreateGroupOpen(true)}
            className="px-3 py-2 rounded border hover:bg-gray-50 dark:hover:bg-gray-800 inline-flex items-center gap-2"
            aria-label="Créer un groupe"
            title="Créer un groupe"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M12 5v14M5 12h14"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Créer un groupe
          </button>

          <button
            onClick={() => setAccountOpen(true)}
            className="px-3 py-2 rounded border hover:bg-gray-50 dark:hover:bg-gray-800 inline-flex items-center gap-2"
            aria-label="Gestion de compte"
            title="Gestion de compte"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Gestion de compte
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 border border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200 p-3 rounded">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-gray-600 dark:text-gray-300">Chargement…</div>
      ) : groups.length === 0 ? (
        <div className="text-gray-600 dark:text-gray-300">Aucun groupe.</div>
      ) : (
        <div className="grid gap-3">
          {groups.map(g => (
            <button
              key={g.id}
              onClick={() => router.push(`/groups/${g.id}`)}
              className="border p-4 rounded hover:bg-gray-50 dark:hover:bg-gray-800 text-left transition-colors"
            >
              <div className="font-semibold">{g.name}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Voir les scores</div>
            </button>
          ))}
        </div>
      )}

      <AccountModal
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        userEmail={userEmail}
        displayName={displayName}
        onDisplayNameChanged={setDisplayName}
      />

      <CreateGroupModal
        open={createGroupOpen}
        onClose={() => setCreateGroupOpen(false)}
        onCreated={() => setReloadKey(k => k + 1)}
      />
    </main>
  )
}

function CreateGroupModal(props: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const [groupName, setGroupName] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchUser[]>([])
  const [selected, setSelected] = useState<SearchUser[]>([])
  const [busy, setBusy] = useState<null | 'search' | 'create'>(null)
  const [message, setMessage] = useState('')
  const [modalError, setModalError] = useState('')

  useEffect(() => {
    if (props.open) {
      setGroupName('')
      setQuery('')
      setResults([])
      setSelected([])
      setBusy(null)
      setMessage('')
      setModalError('')
    }
  }, [props.open])

  useEffect(() => {
    if (!props.open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [props.open, props.onClose])

  useEffect(() => {
    if (!props.open) return
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      return
    }

    const t = window.setTimeout(async () => {
      setBusy('search')
      setModalError('')
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        if (!token) throw new Error('Non connecté.')

        const res = await fetch(`/users/search?q=${encodeURIComponent(q)}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body?.error || `Erreur API (${res.status})`)

        const users = Array.isArray(body?.users) ? body.users : []
        setResults(users)
      } catch (e: any) {
        setModalError(e?.message || 'Impossible de rechercher des utilisateurs.')
        setResults([])
      } finally {
        setBusy(null)
      }
    }, 300)

    return () => window.clearTimeout(t)
  }, [props.open, query])

  function addUser(u: SearchUser) {
    if (selected.some(s => s.id === u.id)) return
    setSelected(prev => [...prev, u])
  }

  function removeUser(id: string) {
    setSelected(prev => prev.filter(u => u.id !== id))
  }

  async function createGroup() {
    setBusy('create')
    setModalError('')
    setMessage('')
    try {
      const name = groupName.trim()
      if (!name) throw new Error('Le nom du groupe est requis.')

      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error('Non connecté.')

      const res = await fetch('/groups', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'content-type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          name,
          member_user_ids: selected.map(u => u.id),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || `Erreur API (${res.status})`)

      setMessage('Groupe créé.')
      props.onCreated()
      props.onClose()
    } catch (e: any) {
      setModalError(e?.message || 'Impossible de créer le groupe.')
    } finally {
      setBusy(null)
    }
  }

  if (!props.open) return null

  const canCreate = groupName.trim().length > 0 && busy === null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-black/40" aria-label="Fermer" onClick={props.onClose} />

      <div className="relative w-full max-w-2xl mx-4 rounded-2xl bg-white dark:bg-gray-900 border dark:border-gray-800 shadow-xl p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="text-lg font-semibold">Créer un groupe</div>
            <div className="text-sm text-gray-600 dark:text-gray-300">
              Donne un nom puis ajoute des membres.
            </div>
          </div>
          <button onClick={props.onClose} className="px-3 py-2 rounded border hover:bg-gray-50 dark:hover:bg-gray-800">
            Fermer
          </button>
        </div>

        {modalError && (
          <div className="mb-4 border border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200 p-3 rounded">
            {modalError}
          </div>
        )}
        {message && (
          <div className="mb-4 border border-green-200 bg-green-50 text-green-800 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-200 p-3 rounded">
            {message}
          </div>
        )}

        <div className="grid gap-4">
          <div className="border rounded-xl p-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nom du groupe</label>
            <input
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              placeholder="Ex: Coloc, Famille, Team…"
              className="w-full px-3 py-2 rounded border bg-white dark:bg-gray-800"
              disabled={busy !== null}
            />
          </div>

          <div className="border rounded-xl p-4">
            <div className="font-semibold mb-2">Ajouter des membres</div>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Rechercher par email ou display name…"
              className="w-full px-3 py-2 rounded border bg-white dark:bg-gray-800 mb-3"
              disabled={busy !== null}
            />

            {busy === 'search' ? (
              <div className="text-sm text-gray-600 dark:text-gray-300">Recherche…</div>
            ) : results.length === 0 ? (
              <div className="text-sm text-gray-600 dark:text-gray-300">Aucun résultat.</div>
            ) : (
              <div className="grid gap-2">
                {results.map(u => {
                  const already = selected.some(s => s.id === u.id)
                  return (
                    <div key={u.id} className="flex items-center justify-between gap-3 border rounded-lg p-3">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{u.display_name || u.email || u.id}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {u.email || '—'} {u.display_name ? `· ${u.display_name}` : ''}
                        </div>
                      </div>
                      <button
                        onClick={() => addUser(u)}
                        className="px-3 py-2 rounded border hover:bg-gray-50 dark:hover:bg-gray-800"
                        disabled={busy !== null || already}
                      >
                        {already ? 'Ajouté' : 'Ajouter'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="border rounded-xl p-4">
            <div className="font-semibold mb-2">Membres sélectionnés</div>
            {selected.length === 0 ? (
              <div className="text-sm text-gray-600 dark:text-gray-300">Aucun membre ajouté.</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {selected.map(u => (
                  <button
                    key={u.id}
                    onClick={() => removeUser(u.id)}
                    className="text-sm px-3 py-2 rounded-full border hover:bg-gray-50 dark:hover:bg-gray-800"
                    disabled={busy !== null}
                    title="Retirer"
                  >
                    {u.display_name || u.email || u.id} ×
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              onClick={props.onClose}
              className="px-3 py-2 rounded border hover:bg-gray-50 dark:hover:bg-gray-800"
              disabled={busy !== null}
            >
              Annuler
            </button>
            <button
              onClick={createGroup}
              className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-400"
              disabled={!canCreate}
            >
              Créer le groupe
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function AccountModal(props: {
  open: boolean
  onClose: () => void
  userEmail: string
  displayName: string
  onDisplayNameChanged: (name: string) => void
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<null | 'signout' | 'reset' | 'update_name' | 'delete' | 'garmin' | 'garmin_disconnect'>(null)
  const [message, setMessage] = useState<string>('')
  const [modalError, setModalError] = useState<string>('')
  const [newDisplayName, setNewDisplayName] = useState<string>(props.displayName || '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [garminConnected, setGarminConnected] = useState<boolean | null>(null)

  useEffect(() => {
    if (props.open) {
      setMessage('')
      setModalError('')
      setBusy(null)
      setConfirmDelete(false)
      setNewDisplayName(props.displayName || '')
      checkGarminStatus()
    }
  }, [props.open, props.displayName])

  async function checkGarminStatus() {
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) return

      const res = await fetch('/garmin/status', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const body = await res.json().catch(() => ({}))
      if (res.ok) {
        setGarminConnected(body.connected || false)
      }
    } catch (e) {
      // Ignore errors
    }
  }

  async function connectGarmin() {
    setBusy('garmin')
    setModalError('')
    setMessage('')
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error('Non connecté.')

      const { data: { user } } = await supabase.auth.getUser(token)
      if (!user) throw new Error('Utilisateur introuvable.')

      // Initier le flux OAuth
      const res = await fetch('/garmin/oauth/initiate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || `Erreur API (${res.status})`)

      const { authUrl, codeVerifier, state } = body

      // Stocker le code_verifier dans sessionStorage pour le récupérer dans le callback
      // (dans un vrai cas de production, il faudrait stocker cela de manière sécurisée côté serveur)
      sessionStorage.setItem('garmin_code_verifier', codeVerifier)
      sessionStorage.setItem('garmin_state', state)

      // Rediriger vers Garmin
      window.location.href = authUrl
    } catch (e: any) {
      setModalError(e?.message || 'Impossible de se connecter à Garmin.')
      setBusy(null)
    }
  }

  async function disconnectGarmin() {
    if (!confirm('Êtes-vous sûr de vouloir déconnecter votre montre Garmin ?')) {
      return
    }

    setBusy('garmin_disconnect')
    setModalError('')
    setMessage('')
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error('Non connecté.')

      const res = await fetch('/garmin/disconnect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || `Erreur API (${res.status})`)

      setMessage('Montre Garmin déconnectée avec succès.')
      setGarminConnected(false)
    } catch (e: any) {
      setModalError(e?.message || 'Impossible de déconnecter Garmin.')
    } finally {
      setBusy(null)
    }
  }

  useEffect(() => {
    if (!props.open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [props.open, props.onClose])

  async function signOut() {
    setBusy('signout')
    setModalError('')
    setMessage('')
    try {
      await supabase.auth.signOut()
      router.replace('/login')
      router.refresh()
    } catch (e: any) {
      setModalError(e?.message || 'Impossible de se déconnecter.')
    } finally {
      setBusy(null)
    }
  }

  async function requestPasswordReset() {
    setBusy('reset')
    setModalError('')
    setMessage('')
    try {
      const email = props.userEmail
      if (!email) throw new Error("Email introuvable pour demander la réinitialisation.")

      const redirectTo = `${window.location.origin}/reset-password`
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
      if (error) throw error

      setMessage('Email de réinitialisation envoyé (si un compte existe pour cet email).')
    } catch (e: any) {
      setModalError(e?.message || 'Impossible de demander la réinitialisation.')
    } finally {
      setBusy(null)
    }
  }

  async function updateDisplayName() {
    setBusy('update_name')
    setModalError('')
    setMessage('')
    try {
      const name = newDisplayName.trim()
      if (!name) throw new Error('Le display name est requis.')

      const { error } = await supabase.auth.updateUser({
        data: { display_name: name },
      })
      if (error) throw error

      props.onDisplayNameChanged(name)
      setMessage('Display name mis à jour.')
    } catch (e: any) {
      setModalError(e?.message || 'Impossible de mettre à jour le display name.')
    } finally {
      setBusy(null)
    }
  }

  async function deleteAccount() {
    setBusy('delete')
    setModalError('')
    setMessage('')
    try {
      if (!confirmDelete) throw new Error('Veuillez cocher la confirmation avant de supprimer le compte.')

      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error('Non connecté.')

      const res = await fetch('/account/delete', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || `Erreur API (${res.status})`)

      await supabase.auth.signOut()
      router.replace('/login')
      router.refresh()
    } catch (e: any) {
      setModalError(e?.message || 'Impossible de supprimer le compte.')
    } finally {
      setBusy(null)
    }
  }

  if (!props.open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      <button
        className="absolute inset-0 bg-black/40"
        aria-label="Fermer"
        onClick={props.onClose}
      />

      <div className="relative w-full max-w-lg mx-4 rounded-2xl bg-white dark:bg-gray-900 border dark:border-gray-800 shadow-xl p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="text-lg font-semibold">Gestion de compte</div>
            <div className="text-sm text-gray-600 dark:text-gray-300">
              {props.displayName ? (
                <span>
                  {props.displayName} · {props.userEmail || '—'}
                </span>
              ) : (
                <span>{props.userEmail || '—'}</span>
              )}
            </div>
          </div>
          <button
            onClick={props.onClose}
            className="px-3 py-2 rounded border hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Fermer
          </button>
        </div>

        {modalError && (
          <div className="mb-4 border border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200 p-3 rounded">
            {modalError}
          </div>
        )}
        {message && (
          <div className="mb-4 border border-green-200 bg-green-50 text-green-800 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-200 p-3 rounded">
            {message}
          </div>
        )}

        <div className="grid gap-4">
          <div className="border rounded-xl p-4">
            <div className="font-semibold mb-2">Display name</div>
            <div className="flex gap-2">
              <input
                value={newDisplayName}
                onChange={e => setNewDisplayName(e.target.value)}
                placeholder="Ton display name"
                className="flex-1 px-3 py-2 rounded border bg-white dark:bg-gray-800"
                disabled={busy !== null}
              />
              <button
                onClick={updateDisplayName}
                className="px-3 py-2 rounded border hover:bg-gray-50 dark:hover:bg-gray-800"
                disabled={busy !== null}
              >
                Enregistrer
              </button>
            </div>
          </div>

          <div className="border rounded-xl p-4">
            <div className="font-semibold mb-2">Mot de passe</div>
            <button
              onClick={requestPasswordReset}
              className="px-3 py-2 rounded border hover:bg-gray-50 dark:hover:bg-gray-800"
              disabled={busy !== null}
            >
              Demander une réinitialisation
            </button>
          </div>

          <div className="border rounded-xl p-4">
            <div className="font-semibold mb-2">Montre Garmin</div>
            {garminConnected ? (
              <div className="space-y-2">
                <div className="text-sm text-green-600 dark:text-green-400">
                  ✓ Connectée
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={checkGarminStatus}
                    className="px-3 py-2 rounded border hover:bg-gray-50 dark:hover:bg-gray-800 text-sm"
                    disabled={busy !== null}
                  >
                    Actualiser le statut
                  </button>
                  <button
                    onClick={disconnectGarmin}
                    className="px-3 py-2 rounded border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:text-red-200 dark:hover:bg-red-900/20 text-sm"
                    disabled={busy !== null}
                  >
                    {busy === 'garmin_disconnect' ? 'Déconnexion...' : 'Se déconnecter'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={connectGarmin}
                className="px-3 py-2 rounded border hover:bg-gray-50 dark:hover:bg-gray-800"
                disabled={busy !== null}
              >
                {busy === 'garmin' ? 'Connexion en cours...' : 'Connecter sa montre Garmin'}
              </button>
            )}
          </div>

          <div className="border rounded-xl p-4">
            <div className="font-semibold mb-2">Session</div>
            <button
              onClick={signOut}
              className="px-3 py-2 rounded border hover:bg-gray-50 dark:hover:bg-gray-800"
              disabled={busy !== null}
            >
              Se déconnecter
            </button>
          </div>

          <div className="border rounded-xl p-4">
            <div className="font-semibold mb-2 text-red-700 dark:text-red-300">Suppression</div>
            <label className="flex items-center gap-2 text-sm mb-3">
              <input
                type="checkbox"
                checked={confirmDelete}
                onChange={e => setConfirmDelete(e.target.checked)}
                disabled={busy !== null}
              />
              Je confirme vouloir supprimer définitivement mon compte
            </label>
            <button
              onClick={deleteAccount}
              className="px-3 py-2 rounded border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:text-red-200 dark:hover:bg-red-900/20"
              disabled={busy !== null}
            >
              Supprimer le compte
            </button>
            <div className="text-xs text-gray-600 dark:text-gray-400 mt-2">
              Cette action est irréversible.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
