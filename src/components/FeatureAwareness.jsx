import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { getFeaturesForProfile } from '../utils/featureRegistry'
import OnboardingTutorial from './OnboardingTutorial'
import NewFeatureNotice from './NewFeatureNotice'

// v44: laat elk account (backoffice/beller/recruiter/manager/admin) bij de
// eerste keer inloggen een tutorial zien met ALLEEN de functies die voor dat
// account echt aan staan (featureRegistry.js leest o.a. de manager-rechten
// en welke afboekredenen actief zijn). Zet admin later een extra functie aan
// voor iemand (bijv. can_edit_flows voor een manager), dan ziet die persoon
// bij de eerstvolgende profielverversing een "nieuwe functie beschikbaar"-
// melding i.p.v. de hele tutorial opnieuw.
//
// Losstaand gehouden van Header.jsx: het "?"-icoon daar stuurt alleen een
// DOM-event ('leadgen:open-tutorial') zodat dit component ook handmatig te
// heropenen is zonder een aparte context/prop-keten door de hele app heen.
export default function FeatureAwareness() {
  const { profile, isDemoMode, user, updateProfileLocal } = useAuth()
  const [dispositionData, setDispositionData] = useState(null)
  const [manualOpen, setManualOpen] = useState(false)

  const needsDispositions = !!profile && ['employee', 'backoffice', 'recruiter'].includes(profile.role)

  useEffect(() => {
    if (isDemoMode || !needsDispositions) { setDispositionData(null); return }
    let cancelled = false
    Promise.all([
      supabase.from('flow_settings').select('disposition_type, is_active'),
      supabase.from('custom_dispositions').select('id, label, base_status, is_active')
    ]).then(([flows, customs]) => {
      if (cancelled) return
      const active = (flows.data || []).filter(f => f.is_active !== false).map(f => f.disposition_type)
      setDispositionData({ activeDispositionTypes: active, customDispositions: customs.data || [] })
    })
    return () => { cancelled = true }
  }, [isDemoMode, needsDispositions, profile?.role])

  useEffect(() => {
    const handler = () => setManualOpen(true)
    window.addEventListener('leadgen:open-tutorial', handler)
    return () => window.removeEventListener('leadgen:open-tutorial', handler)
  }, [])

  const persistSeen = useCallback(async (keys, tutorialSeenAt) => {
    if (isDemoMode || !user?.id) return
    // Optimistisch lokaal bijwerken zodat de modal niet opnieuw opent nog
    // voordat de DB-call terug is - dit is de eigen actie van de gebruiker.
    updateProfileLocal({ tutorial_seen_at: tutorialSeenAt, seen_features: keys })
    try {
      await supabase.from('profiles').update({
        tutorial_seen_at: tutorialSeenAt,
        seen_features: keys
      }).eq('id', user.id)
    } catch { /* best-effort - een mislukte save toont de melding hooguit nog een keer */ }
  }, [isDemoMode, user?.id, updateProfileLocal])

  if (!profile || isDemoMode) return null
  if (needsDispositions && dispositionData === null) return null // wacht op fetch, anders "0 redenen" als gezien markeren

  const features = getFeaturesForProfile(profile, dispositionData || {})
  const allKeys = features.map(f => f.key)
  const seen = Array.isArray(profile.seen_features) ? profile.seen_features : []
  const isFirstTime = !profile.tutorial_seen_at

  if (manualOpen) {
    return (
      <OnboardingTutorial
        profile={profile}
        features={features}
        onClose={() => setManualOpen(false)}
      />
    )
  }

  if (isFirstTime) {
    return (
      <OnboardingTutorial
        profile={profile}
        features={features}
        onClose={() => persistSeen(allKeys, new Date().toISOString())}
      />
    )
  }

  const newKeys = allKeys.filter(k => !seen.includes(k))
  if (newKeys.length > 0) {
    const newFeatures = features.filter(f => newKeys.includes(f.key))
    return (
      <NewFeatureNotice
        features={newFeatures}
        onClose={() => persistSeen(allKeys, profile.tutorial_seen_at)}
        onOpenTutorial={() => { persistSeen(allKeys, profile.tutorial_seen_at); setManualOpen(true) }}
      />
    )
  }

  return null
}
