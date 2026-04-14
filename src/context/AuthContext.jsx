import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

// Demo users for mock mode
const DEMO_USERS = {
  'employee@demo.nl': { id: '1', email: 'employee@demo.nl', full_name: 'Jan de Vries', role: 'employee', show_appointments_in_earnings: true, show_deals_in_earnings: true },
  'admin@demo.nl': { id: '2', email: 'admin@demo.nl', full_name: 'Maria Admin', role: 'admin', show_appointments_in_earnings: true, show_deals_in_earnings: true }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isDemoMode, setIsDemoMode] = useState(false)
  const [isWorking, setIsWorking] = useState(false) // Whether global work modal is open
  const [workingListId, setWorkingListId] = useState(null) // Which list they selected
  const [sessionCallCount, setSessionCallCount] = useState(0)

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
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data)
    setLoading(false)
  }

  async function signIn(email, password) {
    // Check for demo mode login
    if (isDemoMode) {
      if (DEMO_USERS[email] && password === 'demo123') {
        const demoUser = DEMO_USERS[email]
        setUser({ id: demoUser.id, email: demoUser.email })
        setProfile(demoUser)
        return { user: demoUser }
      }
      throw new Error('Ongeldige demo inloggegevens. Gebruik employee@demo.nl of admin@demo.nl met wachtwoord: demo123')
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
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

  function toggleWorkingMode() {
    setIsWorking(prev => {
      if (prev) setWorkingListId(null) // Reset list when closing
      return !prev
    })
  }

  async function logCall(leadId, leadName) {
    setSessionCallCount(prev => prev + 1)
    
    if (!isDemoMode && user) {
      await supabase.from('activities').insert({
        user_id: user.id,
        lead_id: leadId,
        action: 'call',
        notes: `Gebeld naar ${leadName}`
      })
    }
  }

  return (
    <AuthContext.Provider value={{ 
      user, profile, loading, signIn, signOut, isDemoMode, 
      isWorking, toggleWorkingMode, workingListId, setWorkingListId, sessionCallCount, logCall 
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)