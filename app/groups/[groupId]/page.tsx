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

type YearlyScore = {
  date: string
  user_id: string
  score: number | null
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
    totalDuration: number
  }>
}

type SearchUser = {
  id: string
  email: string | null
  display_name: string | null
}

// Générer une couleur unique pour chaque utilisateur basée sur son ID
function getUserColor(userId: string, members: MemberScore[]): string {
  const index = members.findIndex(m => m.user_id === userId)
  if (index === -1) return '#e5e7eb'
  
  // Palette de couleurs vives et distinctes
  const colors = [
    '#3b82f6', // blue
    '#ef4444', // red
    '#10b981', // green
    '#f59e0b', // amber
    '#8b5cf6', // purple
    '#ec4899', // pink
    '#06b6d4', // cyan
    '#f97316', // orange
    '#6366f1', // indigo
    '#14b8a6', // teal
    '#84cc16', // lime
    '#eab308', // yellow
  ]
  
  return colors[index % colors.length]
}

// Couleurs pour les phases de sommeil
function getPhaseColor(phaseType: string): string {
  const colors: Record<string, string> = {
    awake: '#ef4444', // red
    light: '#fbbf24', // amber
    deep: '#3b82f6', // blue
    rem: '#8b5cf6', // purple
  }
  return colors[phaseType.toLowerCase()] || '#9ca3af' // gray par défaut
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) {
    return `${hours}h${minutes > 0 ? ` ${minutes}min` : ''}`
  }
  return `${minutes}min`
}

// Composant de graphique des phases de sommeil
function SleepPhasesChart({ 
  membersPhases 
}: { 
  membersPhases: MemberSleepPhases[]
}) {
  // Générer la date d'aujourd'hui par défaut
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  
  // État pour la date sélectionnée
  const [selectedDate, setSelectedDate] = useState<string>(todayStr)

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  }

  return (
    <div className="border rounded-lg p-6 bg-white dark:bg-gray-900">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Phases de sommeil</h2>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-gray-200"
        />
      </div>

      {/* Graphiques par personne */}
      <div className="space-y-8">
        {membersPhases.map(member => {
          const dayData = member.sleepData.find(d => d.date === selectedDate)
          
          if (!dayData || dayData.phases.length === 0) {
            return (
              <div key={member.user_id} className="border-b dark:border-gray-700 pb-6 last:border-b-0 last:pb-0">
                <h3 className="text-lg font-semibold mb-4">
                  {member.display_name || member.email || member.user_id}
                </h3>
                <div className="flex items-center gap-4">
                  <div className="w-32 text-sm text-gray-500 dark:text-gray-400">
                    {formatDate(selectedDate)}
                  </div>
                  <div className="flex-1 text-sm text-gray-400 dark:text-gray-600">
                    Aucune donnée
                  </div>
                </div>
              </div>
            )
          }

          const totalDuration = dayData.totalDuration
          const phases = dayData.phases // Phases dans l'ordre chronologique
          
          // Calculer la somme par type pour la légende
          const phasesByType: Record<string, number> = {
            awake: 0,
            light: 0,
            deep: 0,
            rem: 0,
          }
          phases.forEach(phase => {
            const type = phase.type.toLowerCase()
            if (phasesByType.hasOwnProperty(type)) {
              phasesByType[type] += phase.duration
            }
          })

          return (
            <div key={member.user_id} className="border-b dark:border-gray-700 pb-6 last:border-b-0 last:pb-0">
              <h3 className="text-lg font-semibold mb-4">
                {member.display_name || member.email || member.user_id}
              </h3>
              
              <div className="flex items-center gap-4">
                <div className="w-32 text-sm text-gray-700 dark:text-gray-300">
                  {formatDate(selectedDate)}
                </div>
                <div className="flex-1 relative">
                  {/* Barre de progression - phases dans l'ordre chronologique */}
                  <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden flex relative">
                    {phases.map((phase, index) => {
                      const duration = phase.duration
                      const percentageOfTotal = totalDuration > 0 ? (duration / totalDuration) * 100 : 0
                      
                      if (duration === 0) return null
                      
                      return (
                        <div
                          key={index}
                          className="h-full flex items-center justify-center text-xs font-medium text-white relative"
                          style={{
                            width: `${percentageOfTotal}%`,
                            backgroundColor: getPhaseColor(phase.type),
                            minWidth: duration > 0 ? '2px' : '0',
                          }}
                          title={`${phase.type}: ${formatDuration(duration)} (${percentageOfTotal.toFixed(1)}% de la nuit)`}
                        >
                          {percentageOfTotal > 5 && (
                            <span className="text-[10px] px-1 truncate">
                              {formatDuration(duration)}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  {/* Durée totale */}
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    <span>Total: {formatDuration(totalDuration)}</span>
                  </div>
                </div>
                {/* Détails des phases - somme par type */}
                <div className="w-48 text-xs text-gray-600 dark:text-gray-400">
                  {Object.entries(phasesByType)
                    .filter(([_, duration]) => duration > 0)
                    .map(([type, duration]) => (
                      <div key={type} className="flex items-center gap-1">
                        <div
                          className="w-2 h-2 rounded"
                          style={{ backgroundColor: getPhaseColor(type) }}
                        />
                        <span className="capitalize">{type}:</span>
                        <span className="font-medium">{formatDuration(duration)}</span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Composant de grille de contributions
function ContributionGrid({ 
  yearlyScores, 
  members 
}: { 
  yearlyScores: YearlyScore[]
  members: MemberScore[]
}) {
  // Organiser les scores par date
  const scoresByDate = new Map<string, Map<string, number | null>>()
  
  yearlyScores.forEach(score => {
    if (!scoresByDate.has(score.date)) {
      scoresByDate.set(score.date, new Map())
    }
    scoresByDate.get(score.date)!.set(score.user_id, score.score)
  })
  
  // Trouver le meilleur score pour chaque jour
  const bestScoresByDate = new Map<string, { user_id: string; score: number }>()
  
  scoresByDate.forEach((userScores, date) => {
    let bestUserId: string | null = null
    let bestScore: number | null = null
    
    userScores.forEach((score, userId) => {
      if (score !== null && (bestScore === null || score > bestScore)) {
        bestScore = score
        bestUserId = userId
      }
    })
    
    if (bestUserId && bestScore !== null) {
      bestScoresByDate.set(date, { user_id: bestUserId, score: bestScore })
    }
  })
  
  // Générer toutes les dates de l'année (du 1er janvier au 31 décembre)
  const year = new Date().getFullYear()
  const startOfYear = new Date(year, 0, 1)
  const endOfYear = new Date(year, 11, 31)
  const dates: string[] = []
  
  const currentDate = new Date(startOfYear)
  while (currentDate <= endOfYear) {
    dates.push(currentDate.toISOString().split('T')[0])
    currentDate.setDate(currentDate.getDate() + 1)
  }
  
  // Organiser les dates par semaine (colonnes = semaines, lignes = jours de la semaine)
  // getDay() retourne 0=dimanche, 1=lundi, ..., 6=samedi
  // On veut lundi=0, mardi=1, ..., dimanche=6
  const getDayOfWeek = (date: Date) => {
    const day = date.getDay()
    return day === 0 ? 6 : day - 1 // Convertir dimanche (0) en 6, lundi (1) en 0, etc.
  }
  
  const weeks: string[][] = []
  const firstDate = new Date(dates[0])
  const firstDayOfWeek = getDayOfWeek(firstDate)
  
  // Créer un tableau pour chaque jour de la semaine (7 lignes)
  const weekRows: string[][] = [[], [], [], [], [], [], []]
  
  // Remplir les jours manquants au début de la première semaine
  for (let i = 0; i < firstDayOfWeek; i++) {
    weekRows[i].push('')
  }
  
  // Remplir avec les dates réelles
  dates.forEach(date => {
    const dateObj = new Date(date)
    const dayOfWeek = getDayOfWeek(dateObj)
    weekRows[dayOfWeek].push(date)
  })
  
  // Remplir les jours manquants à la fin de la dernière semaine
  const lastDate = new Date(dates[dates.length - 1])
  const lastDayOfWeek = getDayOfWeek(lastDate)
  for (let i = lastDayOfWeek + 1; i < 7; i++) {
    weekRows[i].push('')
  }
  
  // Trouver le nombre maximum de semaines
  const maxWeeks = Math.max(...weekRows.map(row => row.length))
  
  // Organiser en semaines (colonnes)
  for (let weekIndex = 0; weekIndex < maxWeeks; weekIndex++) {
    const week: string[] = []
    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      week.push(weekRows[dayIndex][weekIndex] || '')
    }
    weeks.push(week)
  }
  
  const formatTooltipDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('fr-FR', { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long',
      year: 'numeric'
    })
  }
  
  const getMemberName = (userId: string) => {
    const member = members.find(m => m.user_id === userId)
    return member?.display_name || member?.email || userId
  }
  
  return (
    <div className="border rounded-lg p-6 bg-white dark:bg-gray-900">
      <h2 className="text-xl font-bold mb-4">Meilleurs scores de l'année</h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Chaque carré représente un jour. La couleur indique qui a eu le meilleur score ce jour-là.
      </p>
      
      {/* Légende */}
      <div className="mb-4 flex flex-wrap gap-4 text-sm">
        {members.map(member => (
          <div key={member.user_id} className="flex items-center gap-2">
            <div 
              className="w-4 h-4 rounded border border-gray-300 dark:border-gray-600"
              style={{ backgroundColor: getUserColor(member.user_id, members) }}
            />
            <span>{member.display_name || member.email || member.user_id}</span>
          </div>
        ))}
      </div>
      
      {/* Grille */}
      <div className="overflow-x-auto">
        <div className="inline-flex gap-1">
          {/* Labels des jours de la semaine */}
          <div className="flex flex-col gap-1 pr-2">
            <div className="h-4"></div>
            {['Lun', 'Mer', 'Ven'].map(day => (
              <div key={day} className="h-3 text-xs text-gray-500 dark:text-gray-400">
                {day}
              </div>
            ))}
            <div className="h-3"></div>
            {['Dim'].map(day => (
              <div key={day} className="h-3 text-xs text-gray-500 dark:text-gray-400">
                {day}
              </div>
            ))}
          </div>
          
          {/* Grille des semaines (colonnes) */}
          <div className="flex gap-1">
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="flex flex-col gap-1">
                {week.map((date, dayIndex) => {
                  if (!date) {
                    return <div key={`${weekIndex}-${dayIndex}`} className="w-3 h-3" />
                  }
                  
                  const bestScore = bestScoresByDate.get(date)
                  const color = bestScore 
                    ? getUserColor(bestScore.user_id, members)
                    : '#e5e7eb'
                  
                  const memberName = bestScore ? getMemberName(bestScore.user_id) : 'Aucun score'
                  const score = bestScore ? bestScore.score : null
                  
                  return (
                    <div
                      key={date}
                      className="w-3 h-3 rounded-sm border border-gray-200 dark:border-gray-700 cursor-pointer hover:ring-2 hover:ring-gray-400 dark:hover:ring-gray-500 transition-all"
                      style={{ backgroundColor: color }}
                      title={score !== null 
                        ? `${formatTooltipDate(date)}\n${memberName}: ${score}`
                        : formatTooltipDate(date)
                      }
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* Labels des mois */}
      <div className="mt-2 flex gap-1 pl-8">
        {Array.from({ length: 12 }, (_, i) => {
          const monthDate = new Date(new Date().getFullYear(), i, 1)
          const monthStart = monthDate.toISOString().split('T')[0]
          const dateIndex = dates.findIndex(d => d >= monthStart)
          
          if (dateIndex === -1) return null
          
          // Calculer dans quelle semaine se trouve cette date
          const firstDate = new Date(dates[0])
          const firstDayOfWeek = getDayOfWeek(firstDate)
          const weekIndex = Math.floor((dateIndex + firstDayOfWeek) / 7)
          
          return (
            <div 
              key={i} 
              className="text-xs text-gray-500 dark:text-gray-400"
              style={{ marginLeft: i === 0 ? '0' : `${weekIndex * 4}px` }}
            >
              {monthDate.toLocaleDateString('fr-FR', { month: 'short' })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Modal pour ajouter des membres au groupe
function AddMembersModal(props: {
  open: boolean
  onClose: () => void
  onAdded: () => void
  groupId: string
  existingMemberIds: string[]
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchUser[]>([])
  const [selected, setSelected] = useState<SearchUser[]>([])
  const [friends, setFriends] = useState<SearchUser[]>([])
  const [busy, setBusy] = useState<null | 'search' | 'add' | 'loadFriends'>(null)
  const [message, setMessage] = useState('')
  const [modalError, setModalError] = useState('')

  useEffect(() => {
    if (props.open) {
      setQuery('')
      setResults([])
      setSelected([])
      setBusy(null)
      setMessage('')
      setModalError('')
      loadFriends()
    }
  }, [props.open])

  async function loadFriends() {
    setBusy('loadFriends')
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error('Non connecté.')

      const res = await fetch('/friendships', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || `Erreur API (${res.status})`)

      const friendsList = Array.isArray(body?.friends) ? body.friends : []
      // Filtrer pour exclure les membres déjà dans le groupe
      const existingIds = new Set(props.existingMemberIds)
      const filteredFriends = friendsList
        .filter((f: any) => !existingIds.has(f.id))
        .map((f: any) => ({
          id: f.id,
          email: f.email,
          display_name: f.display_name,
        }))
      setFriends(filteredFriends)
    } catch (e: any) {
      setModalError(e?.message || 'Impossible de charger la liste des amis.')
      setFriends([])
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
        // Filtrer pour ne garder que les amis qui ne sont pas déjà dans le groupe
        const friendIds = new Set(friends.map(f => f.id))
        const existingIds = new Set(props.existingMemberIds)
        const filteredUsers = users.filter(
          (u: SearchUser) => friendIds.has(u.id) && !existingIds.has(u.id)
        )
        setResults(filteredUsers)
      } catch (e: any) {
        setModalError(e?.message || 'Impossible de rechercher des utilisateurs.')
        setResults([])
      } finally {
        setBusy(null)
      }
    }, 300)

    return () => window.clearTimeout(t)
  }, [props.open, query, friends, props.existingMemberIds])

  function addUser(u: SearchUser) {
    if (selected.some(s => s.id === u.id)) return
    setSelected(prev => [...prev, u])
  }

  function removeUser(id: string) {
    setSelected(prev => prev.filter(u => u.id !== id))
  }

  async function addMembers() {
    setBusy('add')
    setModalError('')
    setMessage('')
    try {
      if (selected.length === 0) {
        throw new Error('Veuillez sélectionner au moins un membre à ajouter.')
      }

      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error('Non connecté.')

      const res = await fetch(`/groups/${props.groupId}/members`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'content-type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          member_user_ids: selected.map(u => u.id),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || `Erreur API (${res.status})`)

      setMessage(`${body.added_count || selected.length} membre(s) ajouté(s).`)
      setTimeout(() => {
        props.onAdded()
        props.onClose()
      }, 1000)
    } catch (e: any) {
      setModalError(e?.message || 'Impossible d\'ajouter les membres.')
    } finally {
      setBusy(null)
    }
  }

  if (!props.open) return null

  const canAdd = selected.length > 0 && busy === null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-black/40" aria-label="Fermer" onClick={props.onClose} />

      <div className="relative w-full max-w-2xl mx-4 rounded-2xl bg-white dark:bg-gray-900 border dark:border-gray-800 shadow-xl p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="text-lg font-semibold">Ajouter des membres</div>
            <div className="text-sm text-gray-600 dark:text-gray-300">
              Sélectionnez des amis à ajouter au groupe.
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
            <div className="font-semibold mb-2">Rechercher des amis</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Vous ne pouvez ajouter que vos amis dans un groupe.
            </div>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Rechercher par email ou display name…"
              className="w-full px-3 py-2 rounded border bg-white dark:bg-gray-800 mb-3"
              disabled={busy !== null}
            />

            {busy === 'search' || busy === 'loadFriends' ? (
              <div className="text-sm text-gray-600 dark:text-gray-300">Recherche…</div>
            ) : results.length === 0 ? (
              <div className="text-sm text-gray-600 dark:text-gray-300">
                {query.trim().length >= 2
                  ? 'Aucun ami trouvé correspondant à votre recherche.'
                  : 'Tapez au moins 2 caractères pour rechercher parmi vos amis.'}
              </div>
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
              <div className="text-sm text-gray-600 dark:text-gray-300">Aucun membre sélectionné.</div>
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
              onClick={addMembers}
              className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-400"
              disabled={!canAdd}
            >
              Ajouter les membres
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function GroupScoresPage() {
  const router = useRouter()
  const params = useParams()
  const groupId = params?.groupId as string

  const [group, setGroup] = useState<Group | null>(null)
  const [members, setMembers] = useState<MemberScore[]>([])
  const [yearlyScores, setYearlyScores] = useState<YearlyScore[]>([])
  const [membersPhases, setMembersPhases] = useState<MemberSleepPhases[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingYearly, setLoadingYearly] = useState(true)
  const [loadingPhases, setLoadingPhases] = useState(true)
  const [error, setError] = useState('')
  const [addMembersModalOpen, setAddMembersModalOpen] = useState(false)

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
        
        // Charger les scores de l'année
        const yearlyRes = await fetch(`/groups/${groupId}/yearly-scores`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        
        const yearlyBody = await yearlyRes.json().catch(() => ({}))
        if (yearlyRes.ok) {
          if (!cancelled) {
            setYearlyScores(Array.isArray(yearlyBody?.scores) ? yearlyBody.scores : [])
          }
        }
        
        // Charger les phases de sommeil
        const phasesRes = await fetch(`/groups/${groupId}/sleep-phases`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        
        const phasesBody = await phasesRes.json().catch(() => ({}))
        if (phasesRes.ok) {
          if (!cancelled) {
            setMembersPhases(Array.isArray(phasesBody?.members) ? phasesBody.members : [])
          }
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Impossible de charger les données.')
          setMembers([])
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
          setLoadingYearly(false)
          setLoadingPhases(false)
        }
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
        {!loading && group && (
          <button
            onClick={() => setAddMembersModalOpen(true)}
            className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 inline-flex items-center gap-2 text-sm"
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
                d="M12 5v14M5 12h14"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Ajouter des membres
          </button>
        )}
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
        <div className="space-y-6">
          {/* Widget de grille de contributions */}
          {!loadingYearly && yearlyScores.length > 0 && (
            <ContributionGrid yearlyScores={yearlyScores} members={members} />
          )}
          
          {/* Widget des phases de sommeil */}
          {!loadingPhases && membersPhases.length > 0 && (
            <SleepPhasesChart membersPhases={membersPhases} />
          )}
          
          {/* Widget des scores de la semaine */}
          <div className="border rounded-lg overflow-hidden">
            <div className="p-4 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
              <h2 className="text-lg font-semibold">Scores de la semaine</h2>
            </div>
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
        </div>
      )}

      <AddMembersModal
        open={addMembersModalOpen}
        onClose={() => setAddMembersModalOpen(false)}
        onAdded={() => {
          // Recharger les données du groupe
          const loadData = async () => {
            try {
              const { data: sessionData } = await supabase.auth.getSession()
              const token = sessionData.session?.access_token
              if (!token) return

              const scoresRes = await fetch(`/groups/${groupId}/scores`, {
                headers: { Authorization: `Bearer ${token}` },
              })
              const scoresBody = await scoresRes.json().catch(() => ({}))
              if (scoresRes.ok) {
                setMembers(Array.isArray(scoresBody?.members) ? scoresBody.members : [])
              }
            } catch (e) {
              console.error('Erreur lors du rechargement:', e)
            }
          }
          loadData()
        }}
        groupId={groupId}
        existingMemberIds={members.map(m => m.user_id)}
      />
    </main>
  )
}
