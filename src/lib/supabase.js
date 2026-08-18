import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Zonder geldige configuratie draait de app in demo-modus (zie AuthContext).
// createClient gooit alleen een lege url er direct uit, waardoor de hele app
// op een wit scherm bleef staan in plaats van demo-modus te starten.
export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabaseAnonKey && supabaseUrl !== 'your_supabase_url'
)

export const supabase = createClient(
  isSupabaseConfigured ? supabaseUrl : 'http://demo.invalid',
  isSupabaseConfigured ? supabaseAnonKey : 'demo-anon-key'
)
