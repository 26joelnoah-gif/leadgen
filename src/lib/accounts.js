// v107: een account aanmaken vanuit de app, ook door iemand zonder adminrol.
//
// Waarom een apart bestand: het aanmaken gebeurt op drie plekken (Admin,
// Mijn Projecten en het Dashboard/Recruitment voor iedereen met het recht
// "Accounts aanmaken"). De twee stappen zijn overal hetzelfde:
//   1. auth.signUp via een TIJDELIJKE client - anders vervangt de signUp de
//      sessie van degene die het account aanmaakt en zit hij ineens ingelogd
//      als de nieuwe medewerker.
//   2. RPC nieuw_account_afronden zet rol + organisatie. Dat kan niet met een
//      gewone update op profiles: die policy laat alleen een admin andermans
//      profiel aanpassen. De RPC controleert zelf of je het mag (admin,
//      manager of can_create_users) en welke rollen je mag uitdelen.
import { createClient } from '@supabase/supabase-js'
import { supabase } from './supabase'

// Rollen die iemand zonder adminrol mag aanmaken. Dezelfde lijst staat in de
// RPC; die is de echte bewaking, dit is alleen wat de app laat zien.
export const ROLLEN_ZONDER_ADMIN = ['employee', 'backoffice', 'accountmanager']

// Mag deze persoon accounts aanmaken?
export function magAccountsAanmaken(profile) {
  if (!profile) return false
  if (profile.is_active === false) return false
  return profile.role === 'admin' || profile.role === 'manager' || profile.can_create_users === true
}

// Maakt het account aan en zet rol + organisatie.
// Geeft { id, waarschuwing } terug. Een waarschuwing betekent: het account
// staat er wel, maar de rol/organisatie is niet gezet (bijv. geen recht).
// Gooit alleen als het account zelf niet aangemaakt kon worden.
export async function maakAccount({ naam, email, wachtwoord, rol = 'employee' }) {
  const tempClient = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
  const { data, error } = await tempClient.auth.signUp({
    email,
    password: wachtwoord,
    options: { data: { full_name: naam } }
  })
  if (error) throw error

  const id = data?.user?.id || null
  if (!id) {
    // Kan gebeuren als e-mailbevestiging aanstaat; dan is er nog geen profiel
    // om bij te werken. Account bestaat wel.
    return { id: null, waarschuwing: 'Account aangemaakt, maar de rol kon niet worden gezet (nog geen profiel).' }
  }

  const { error: rpcError } = await supabase.rpc('nieuw_account_afronden', { p_user: id, p_role: rol || 'employee' })
  if (rpcError) {
    return { id, waarschuwing: `Account aangemaakt, maar rol/organisatie instellen mislukte: ${rpcError.message}` }
  }
  return { id, waarschuwing: null }
}
