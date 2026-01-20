'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type MemberScore = {
  user_id: string
  email: string | null
  display_name: string | null
  scores: Array<{
    date: string
    score: number | null
  }>
}

type Group = {
  id: string
  name: string
}

export default function GroupScoresPage() {
  const router = useRouter()
  const params = useParams()
  const groupId = params?.groupId as string

  const [group, setGroup] = useState<Group | null>(null)
  const [members, setMembers] = useState<MemberScore[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!groupId) {
      router.replace('/')
      return
    }

    let cancelled = false

    async function loadData() {
      setLoading(true)
      setError('')

      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const session = sessionData.session
        const token = session?.access_token

        if (!token) {
          router.replace('/login')
          return
        }

        // Charger les informations du groupe
        const groupsRes = await fetch('/groups', {
          headers: { Authorization: `Bearer ${token}` },
        })

        const groupsBody = await groupsRes.json().catch(() => ({}))
        if (!groupsRes.ok) {
          throw new Error(groupsBody?.error || `Erreur API (${groupsRes.status})`)
        }

        const groups = Array.isArray(groupsBody?.groups) ? groupsBody.groups : []
        const foundGroup = groups.find((g: Group) => g.id === groupId)

        if (!foundGroup) {
          throw new Error('Groupe introuvable ou accès non autorisé.')
        }

        if (!cancelled) {
          setGroup(foundGroup)
        }

        // Charger les scores
        const scoresRes = await fetch(`/groups/${groupId}/scores`, {
          headers: { Authorization: `Bearer ${token}` },
        })

        const scoresBody = await scoresRes.json().catch(() => ({}))
        if (!scoresRes.ok) {
          throw new Error(scoresBody?.error || `Erreur API (${scoresRes.status})`)
        }

        if (!cancelled) {
          setMembers(Array.isArray(scoresBody?.members) ? scoresBody.members : [])
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Impossible de charger les données.')
          setMembers([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadData()

    return () => {
      cancelled = true
    }
  }, [groupId, router])

  // Générer les dates des 7 derniers jours (du plus récent au plus ancien)
  const dates: string[] = []
  for (let i = 0; i < 7; i++) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    dates.push(date.toISOString().split('T')[0])
  }
  dates.sort((a, b) => b.localeCompare(a))

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
  }

  return (
    <main className="p-6">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <button
            onClick={() => router.push('/')}
            className="mb-2 px-3 py-2 rounded border hover:bg-gray-50 dark:hover:bg-gray-800 inline-flex items-center gap-2 text-sm"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M19 12H5M12 19l-7-7 7-7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Retour
          </button>
          <h1 className="text-2xl font-bold">
            {group ? `Scores du groupe : ${group.name}` : 'Chargement...'}
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Scores de sommeil des 7 derniers jours
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 border border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200 p-3 rounded">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-gray-600 dark:text-gray-300">Chargement des scores…</div>
      ) : members.length === 0 ? (
        <div className="text-gray-600 dark:text-gray-300">Aucun membre dans ce groupe.</div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                  <th className="text-left p-4 font-semibold sticky left-0 bg-gray-50 dark:bg-gray-800 z-10 min-w-[200px]">
                    Membre
                  </th>
                  {dates.map(date => (
                    <th key={date} className="text-center p-4 font-semibold min-w-[120px]">
                      <div className="text-sm">{formatDate(date)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((member, idx) => (
                  <tr
                    key={member.user_id}
                    className={`border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 ${
                      idx % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50/50 dark:bg-gray-800/50'
                    }`}
                  >
                    <td className="p-4 sticky left-0 bg-inherit z-10">
                      <div className="font-medium">
                        {member.display_name || member.email || member.user_id}
                      </div>
                      {member.display_name && member.email && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{member.email}</div>
                      )}
                    </td>
                    {dates.map(date => {
                      const scoreData = member.scores.find(s => s.date === date)
                      const score = scoreData?.score
                      return (
                        <td key={date} className="text-center p-4">
                          {score !== null && score !== undefined ? (
                            <div className="font-semibold text-lg">{score}</div>
                          ) : (
                            <div className="text-gray-400 dark:text-gray-600">—</div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  )
}
