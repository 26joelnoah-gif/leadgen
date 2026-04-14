import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envFile = fs.readFileSync(path.resolve(__dirname, '.env'), 'utf8')
const env = {}
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.+)$/)
  if (match) env[match[1].trim()] = match[2].trim()
})

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

async function test() {
  console.log('Logging in as werk@nemer.com...')
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'werk@nemer.com',
    password: 'werk123nemer'
  })
  
  if (authError) {
    console.error('Login Failed:', authError)
    return
  }
  
  console.log('Login Success! User ID:', authData.user.id)
  
  console.log('\nFetching profile...')
  const { data: profile, error: profileErr } = await supabase.from('profiles').select('*').eq('id', authData.user.id).single()
  console.log('Profile:', profileErr ? profileErr : profile)
  
  console.log('\nFetching lead lists (simulating Dashboard load)...')
  const { data: lists, error: listsErr } = await supabase.from('lead_lists').select('*')
  if (listsErr) {
    console.error('Error fetching lead lists:', listsErr)
  } else {
    console.log(`Found ${lists.length} lists.`)
    const assignedLists = lists.filter(l => l.assigned_to === authData.user.id || l.created_by === authData.user.id)
    console.log(`Assigned to werk@nemer.com: ${assignedLists.length}`)
    assignedLists.forEach(l => console.log(' - ' + l.name))
  }

  console.log('\nFetching leads...')
  const { data: leads, error: leadsErr } = await supabase.from('leads').select('*').eq('assigned_to', authData.user.id)
  console.log('Leads fetched:', leadsErr ? leadsErr : leads.length + ' leads found.')
  
}

test()
