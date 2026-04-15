import { createClient } from '@supabase/supabase-js'

export const handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const { email, password, full_name, role } = JSON.parse(event.body)

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceRoleKey) {
    return { 
      statusCode: 500, 
      body: JSON.stringify({ error: 'Missing SUPABASE_SERVICE_ROLE_KEY environment variable. Add it in Netlify settings.' }) 
    }
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })

  try {
    // 1. Create the user in Auth
    const { data: userData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto confirm so they can login immediately!
      user_metadata: { full_name, role }
    })

    if (authError) throw authError

    // 2. Clear existing profile if it exists (trigger might have created one)
    // and upsert the correct data
    const { error: profileError } = await supabase.from('profiles').upsert({
      id: userData.user.id,
      email,
      full_name,
      role,
      show_appointments_in_earnings: true,
      show_deals_in_earnings: true
    })

    if (profileError) throw profileError

    return {
      statusCode: 200,
      body: JSON.stringify({ message: `Medewerker ${full_name} succesvol aangemaakt.`, user: userData.user })
    }
  } catch (error) {
    console.error('Error creating user:', error)
    return {
      statusCode: 400,
      body: JSON.stringify({ error: error.message })
    }
  }
}
