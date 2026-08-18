import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// Tarieven stonden eerder in localStorage. Die zijn per browser, dus een
// beller kon andere bedragen zien dan de admin, en na het wissen van de
// browsergegevens vielen ze terug op de standaardwaarde. Ze horen op één
// plek te staan waar iedereen hetzelfde ziet: de database.

export const DEFAULT_SETTINGS = {
  dealValue: 50,
  appointmentValue: 15,
  monthlyTarget: 10,
}

function fromRow(row) {
  if (!row) return DEFAULT_SETTINGS
  return {
    dealValue: Number(row.deal_value),
    appointmentValue: Number(row.appointment_value),
    monthlyTarget: Number(row.monthly_target),
  }
}

export function useSettings() {
  const { user, profile, isDemoMode } = useAuth()
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const orgId = profile?.organization_id ?? null
  const isAdmin = profile?.role === 'admin'

  const fetchSettings = useCallback(async () => {
    if (isDemoMode) {
      setSettings(DEFAULT_SETTINGS)
      setLoading(false)
      return
    }
    if (!user?.id) {
      setLoading(false)
      return
    }

    // RLS levert alleen de rij van je eigen organisatie, dus geen filter nodig.
    const { data, error } = await supabase
      .from('org_settings')
      .select('*')
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('useSettings fetch error:', error.message)
      setError(error.message)
    } else {
      setSettings(fromRow(data))
    }
    setLoading(false)
  }, [user?.id, isDemoMode])

  useEffect(() => { fetchSettings() }, [fetchSettings])

  async function updateSettings(next) {
    if (isDemoMode) {
      setSettings(prev => ({ ...prev, ...next }))
      return { error: null }
    }
    if (!isAdmin) {
      return { error: { message: 'Alleen een admin kan tarieven wijzigen' } }
    }

    const payload = {
      organization_id: orgId,
      deal_value: next.dealValue,
      appointment_value: next.appointmentValue,
      monthly_target: next.monthlyTarget,
      updated_by: user?.id ?? null,
    }

    // organization_id is NULL zolang er nog geen organisaties zijn, en in
    // Postgres matcht NULL nergens op. onConflict werkt daar niet, dus
    // eerst kijken of de rij er al is.
    const { data: existing } = await supabase
      .from('org_settings')
      .select('id')
      .limit(1)
      .maybeSingle()

    const { data, error } = existing
      ? await supabase.from('org_settings').update(payload).eq('id', existing.id).select().single()
      : await supabase.from('org_settings').insert(payload).select().single()

    if (error) {
      console.error('useSettings update error:', error.message)
      return { error }
    }

    setSettings(fromRow(data))
    return { error: null }
  }

  return { settings, loading, error, isAdmin, updateSettings, refetch: fetchSettings }
}
