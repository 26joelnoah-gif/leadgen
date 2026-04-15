import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export function useOrganization() {
  const { user, profile, isDemoMode } = useAuth()
  const [organization, setOrganization] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const isOwner = organization && user && organization.owner_id === user.id
  const plan = organization?.plan || 'free'

  const fetchOrganization = useCallback(async () => {
    if (!user || isDemoMode) {
      setLoading(false)
      return
    }

    const orgId = profile?.organization_id
    if (!orgId) {
      setOrganization(null)
      setLoading(false)
      return
    }

    try {
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', orgId)
        .single()

      if (error) throw error
      setOrganization(data)
    } catch (err) {
      console.error('useOrganization fetch error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [user, profile?.organization_id, isDemoMode])

  useEffect(() => {
    fetchOrganization()
  }, [fetchOrganization])

  async function createOrganization(name) {
    if (!user) throw new Error('Niet ingelogd')

    // Generate slug from name
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50)

    // Check uniqueness, append random suffix if taken
    const finalSlug = slug + '-' + Math.random().toString(36).substring(2, 6)

    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({ name, slug: finalSlug, owner_id: user.id })
      .select()
      .single()

    if (orgError) throw orgError

    // Link profile to org
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ organization_id: org.id })
      .eq('id', user.id)

    if (profileError) throw profileError

    setOrganization(org)
    return org
  }

  async function updateOrganization(updates) {
    if (!organization || !isOwner) throw new Error('Geen rechten')

    const { data, error } = await supabase
      .from('organizations')
      .update(updates)
      .eq('id', organization.id)
      .select()
      .single()

    if (error) throw error
    setOrganization(data)
    return data
  }

  // Plan limits helper
  const limits = {
    free:       { max_users: 5,   max_leads: 1000,  features: [] },
    starter:    { max_users: 15,  max_leads: 10000, features: ['reports', 'exports'] },
    pro:        { max_users: 50,  max_leads: 100000,features: ['reports', 'exports', 'api', 'flows'] },
    enterprise: { max_users: 999, max_leads: 999999,features: ['all'] },
  }

  const planLimits = limits[plan] || limits.free

  function hasFeature(feature) {
    if (isDemoMode) return true
    const f = limits[plan]?.features || []
    return f.includes('all') || f.includes(feature)
  }

  return {
    organization,
    loading,
    error,
    isOwner,
    plan,
    planLimits,
    hasFeature,
    createOrganization,
    updateOrganization,
    refetch: fetchOrganization,
  }
}
