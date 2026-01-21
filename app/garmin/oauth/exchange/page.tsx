'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function GarminOAuthExchangeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState<string>('')

  useEffect(() => {
    const code = searchParams.get('code')
    const localUserId = searchParams.get('local_user_id')
    const state = searchParams.get('state')

    if (!code || !localUserId) {
      setStatus('error')
      setErrorMessage('Paramètres manquants')
      return
    }

    // Récupérer le code_verifier depuis sessionStorage
    const codeVerifier = sessionStorage.getItem('garmin_code_verifier')
    const storedState = sessionStorage.getItem('garmin_state')

    if (!codeVerifier) {
      setStatus('error')
      setErrorMessage('Code verifier introuvable. Veuillez réessayer.')
      return
    }

    // Vérifier que le state correspond
    // Le state peut être encodé dans l'URL, donc on décode d'abord
    const decodedState = state ? decodeURIComponent(state) : null
    if (decodedState !== storedState) {
      // Pour le debug, on peut logger les valeurs
      console.log('State mismatch:', { decodedState, storedState, state })
      setStatus('error')
      setErrorMessage('State mismatch. Veuillez réessayer.')
      return
    }

    // Faire l'échange du code contre le token
    async function exchangeToken() {
      try {
        const response = await fetch('/api/garmin/oauth/exchange', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            code,
            code_verifier: codeVerifier,
            local_user_id: localUserId,
          }),
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Erreur lors de l\'échange du token')
        }

        // Nettoyer sessionStorage
        sessionStorage.removeItem('garmin_code_verifier')
        sessionStorage.removeItem('garmin_state')

        // Rediriger vers la page d'accueil avec succès
        router.push('/?garmin_connected=success')
      } catch (e: any) {
        setStatus('error')
        setErrorMessage(e?.message || 'Erreur lors de la connexion à Garmin')
      }
    }

    exchangeToken()
  }, [searchParams, router])

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-semibold mb-2">Connexion à Garmin en cours...</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Veuillez patienter</div>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">
            Erreur lors de la connexion
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">{errorMessage}</div>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 rounded border hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Retour à l'accueil
          </button>
        </div>
      </div>
    )
  }

  return null
}

export default function GarminOAuthExchange() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="text-lg font-semibold mb-2">Chargement...</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Veuillez patienter</div>
          </div>
        </div>
      }
    >
      <GarminOAuthExchangeContent />
    </Suspense>
  )
}
