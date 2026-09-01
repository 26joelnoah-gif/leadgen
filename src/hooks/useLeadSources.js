import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// v56: beheerde bronnen (tabel lead_sources). leads.lead_source blijft een los
// tekstveld; deze lijst voedt de dropdowns (nieuwe lead/sollicitant, import) en
// het bron-filter. Iedereen die een lead mag aanmaken mag ook een bron aanmaken
// (RLS volgt leads_insert); hernoemen/verwijderen: maker zelf, admin, manager,
// recruiter.
const DEMO_SOURCES = ['Cold Call', 'LinkedIn', 'Referral', 'Indeed', 'Website']

export function useLeadSources() {
  const { user, isDemoMode } = useAuth()
  const [sources, setSources] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchSources = useCallback(async () => {
    if (isDemoMode) {
      setSources(DEMO_SOURCES.map((name, i) => ({ id: `demo-src-${i}`, name })))
      setLoading(false)
      return
    }
    const { data, error } = await supabase
      .from('lead_sources')
      .select('id, name, created_by, created_at')
      .order('name')
    if (!error) setSources(data || [])
    setLoading(false)
  }, [isDemoMode])

  useEffect(() => { fetchSources() }, [fetchSources])

  function findByName(name) {
    const key = (name || '').trim().toLowerCase()
    return sources.find(s => s.name.trim().toLowerCase() === key) || null
  }

  // Geeft de (bestaande of nieuwe) bron terug. Bestaat de naam al (hoofdletter-
  // ongevoelig), dan wordt die hergebruikt in plaats van een dubbele te maken.
  async function addSource(rawName) {
    const name = (rawName || '').trim()
    if (!name) throw new Error('Geef een naam op voor de bron.')
    if (name.length > 60) throw new Error('Een bronnaam mag maximaal 60 tekens zijn.')
    const existing = findByName(name)
    if (existing) return existing
    if (isDemoMode) {
      const s = { id: `demo-src-${Date.now()}`, name }
      setSources(prev => [...prev, s].sort((a, b) => a.name.localeCompare(b.name)))
      return s
    }
    const { data, error } = await supabase
      .from('lead_sources')
      .insert({ name, created_by: user?.id })
      .select('id, name, created_by, created_at')
      .single()
    if (error) {
      // Unieke index: iemand anders was net eerder - haal de lijst opnieuw op.
      if (error.code === '23505') { await fetchSources(); return findByName(name) }
      throw error
    }
    setSources(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    return data
  }

  async function renameSource(id, rawName) {
    const name = (rawName || '').trim()
    if (!name) throw new Error('Geef een naam op voor de bron.')
    const clash = findByName(name)
    if (clash && clash.id !== id) throw new Error(`De bron "${clash.name}" bestaat al.`)
    const old = sources.find(s => s.id === id)
    if (!isDemoMode) {
      const { error } = await supabase.from('lead_sources').update({ name }).eq('id', id)
      if (error) throw error
      // Leads die deze bron dragen gaan mee (best effort: RLS beperkt dit tot de
      // leads die jij mag bewerken; de rest houdt de oude tekst).
      if (old && old.name.trim().toLowerCase() !== name.toLowerCase()) {
        const pattern = old.name.trim().replace(/[\\%_]/g, m => `\\${m}`)
        await supabase.from('leads').update({ lead_source: name }).ilike('lead_source', pattern)
      }
    }
    setSources(prev => prev.map(s => (s.id === id ? { ...s, name } : s)).sort((a, b) => a.name.localeCompare(b.name)))
    return old?.name || null
  }

  async function removeSource(id) {
    if (!isDemoMode) {
      const { error } = await supabase.from('lead_sources').delete().eq('id', id)
      if (error) throw error
    }
    setSources(prev => prev.filter(s => s.id !== id))
  }

  return { sources, loading, fetchSources, addSource, renameSource, removeSource, findByName }
}
