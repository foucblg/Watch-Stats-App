'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Group = {
  id: string
  name: string
}

export default function Home() {
  const router = useRouter()
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')

      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token

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
  }, [router])

  return (
    <main className="p-6">
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold">Mes groupes</h1>
        <button
          onClick={() => router.refresh()}
          className="px-3 py-2 rounded border hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          Rafraîchir
        </button>
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
            <div key={g.id} className="border p-4 rounded">
              <div className="font-semibold">{g.name}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">{g.id}</div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}