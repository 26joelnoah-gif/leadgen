import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

// Demo users for mock mode
const DEMO_USERS = {
  'employee@demo.nl': { id: '1', email: 'employee@demo.nl', full_name: 'Jan de Vries', role: 'employee', show_appointments_in_earnings: true, show_deals_in_earnings: true },
  'admin@demo.nl': { id: '2', email: 'admin@demo.nl', full_name: 'Maria Admin', role: 'admin', show_appointments_in_earnings: true, show_deals_in_earnings: true }
}


function sanitizeText(str) {
  return String(str || '').replace(/[<>"'&]/g, c => ({'<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#x27;','&':'&amp;'}[c]))
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isDemoMode, setIsDemoMode] = useState(false)
  const [isWorking, setIsWorking] = useState(false) // Whether global work modal is open
  const [workingListId, setWorkingListId] = useState(null) // Which list they selected
  const [workingLead, setWorkingLead] = useState(null) // For calling a single lead (e.g. from TBA)
  const [sessionCallCount, setSessionCallCount] = useState(0)
  const pingClickCountRef = useRef(0) // v43: klik-teller voor intensiteit/ingelogde-tijd (Admin)

  // Check if Supabase is configured, otherwise use demo mode
  useEffect(() => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey || supabaseUrl === 'your_supabase_url') {
      // Demo mode - use mock authentication
      setIsDemoMode(true)
      setLoading(false)
      return
    }

    // Real Supabase mode
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
      
      if (error) {
        console.error('fetchProfile error:', error.message)
      }
      // v31: inactieve accounts komen er niet in - sessie direct beëindigen
      if (data && data.is_active === false) {
        await supabase.auth.signOut()
        setUser(null)
        setProfile(null)
        return
      }
      setProfile(data || null)
    } catch (err) {
      console.error('fetchProfile catch:', err)
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }

  async function signIn(email, password) {
    // Check for demo mode login
    if (isDemoMode) {
      if (DEMO_USERS[email] && password === 'demo123') {
        const demoUser = DEMO_USERS[email]
        setUser({ id: demoUser.id, email: demoUser.email })
        setProfile(demoUser)
        return { data: { user: demoUser }, error: null }
      }
      throw new Error('Ongeldige demo inloggegevens. Gebruik admin@demo.nl of employee@demo.nl met demo123')
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    // v31: inactief gezette accounts mogen niet meer inloggen
    if (data?.user?.id) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('is_active')
        .eq('id', data.user.id)
        .single()
      if (prof && prof.is_active === false) {
        await supabase.auth.signOut()
        setUser(null)
        setProfile(null)
        throw new Error('Dit account is inactief gezet. Vraag je beheerder om je weer te activeren.')
      }
    }
    return data
  }

  async function signOut() {
    if (isDemoMode) {
      setUser(null)
      setProfile(null)
      return
    }
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  function toggleWorkingMode(lead = null) {
    setIsWorking(prev => {
      if (prev) {
        setWorkingListId(null)
        setWorkingLead(null)
      } else if (lead) {
        setWorkingLead(lead)
      }
      return !prev
    })
  }

  function startWorkingWithList(listId) {
    setWorkingListId(listId)
    setWorkingLead(null)
    setIsWorking(true)
  }

  async function logCall(leadId, leadName) {
    setSessionCallCount(prev => prev + 1)
    
    if (!isDemoMode && user) {
      await supabase.from('activities').insert({
        user_id: user.id,
        lead_id: leadId,
        action: 'call',
        notes: `Gebeld naar ${sanitizeText(leadName)}`
      })
    }
  }

  // v43: lichte "heartbeat" voor het intensiteit/ingelogde-tijd-overzicht in
  // Admin > Team. Telt clicks lokaal (geen DB-round-trip per klik) en
  // schrijft elke 60s (en bij het verbergen van het tabblad) 1 rij weg met
  // het aantal clicks in dat venster - alleen als er ook echt geklikt is,
  // zodat een vergeten openstaand tabblad de tabel niet vervuilt.
  // Admin bepaalt zelf de drempel ("minimaal X acties per Y minuten") bij
  // het bekijken van het overzicht - hier wordt alleen ruwe data verzameld.
  useEffect(() => {
    if (isDemoMode || !user?.id) return

    const onClick = () => { pingClickCountRef.current += 1 }
    window.addEventListener('click', onClick, true)

    const flushPing = async () => {
      if (document.visibilityState !== 'visible') return
      const count = pingClickCountRef.current
      if (count <= 0) return
      pingClickCountRef.current = 0
      try {
        await supabase.from('activity_pings').insert({
          user_id: user.id,
          organization_id: profile?.organization_id ?? null,
          click_count: count
        })
      } catch (err) {
        console.error('activity_pings insert mislukt:', err)
      }
    }

    const interval = setInterval(flushPing, 60000)
    const onVisibilityChange = () => { if (document.visibilityState === 'hidden') flushPing() }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      window.removeEventListener('click', onClick, true)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      clearInterval(interval)
    }
  }, [isDemoMode, user?.id, profile?.organization_id])

  return (
    <AuthContext.Provider value={{ 
      user, profile, loading, signIn, signOut, isDemoMode, 
      isWorking, toggleWorkingMode, startWorkingWithList, workingListId, setWorkingListId, workingLead, setWorkingLead, sessionCallCount, logCall
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)