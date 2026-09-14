/**
 * Gezondheidscheck LEADGEN (betrouwbaarheid v71)
 *
 * Draai dit na elke deploy. In een paar seconden weet je of de kernpaden
 * het nog doen, in plaats van dat je het hoort van een beller die niet kan
 * werken.
 *
 * Gebruik:   node scripts/smoketest.mjs
 *
 * Nodig in .env (naast VITE_SUPABASE_URL en VITE_SUPABASE_ANON_KEY):
 *   SMOKE_EMAIL=...       een gewoon beller-account dat alleen hiervoor is
 *   SMOKE_PASSWORD=...
 *   SMOKE_URL=https://leadgendash.netlify.app   (optioneel)
 *
 * Zonder SMOKE_EMAIL doet het script alleen de checks die geen login nodig
 * hebben, en zegt het welke checks het overslaat.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// .env inlezen zonder extra pakket
function env() {
  const uit = { ...process.env }
  try {
    for (const regel of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
      const m = regel.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !uit[m[1]]) uit[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* geen .env, dan alleen echte omgevingsvariabelen */ }
  return uit
}

const E = env()
const URL_APP = E.SMOKE_URL || 'https://leadgendash.netlify.app'
const resultaten = []

async function check(naam, fn, { verplicht = true } = {}) {
  const start = Date.now()
  try {
    const bericht = await fn()
    resultaten.push({ naam, ok: true, ms: Date.now() - start, bericht })
  } catch (err) {
    resultaten.push({ naam, ok: false, ms: Date.now() - start, bericht: err.message, verplicht })
  }
}

// ---------------------------------------------------------------- checks
async function main() {
  if (!E.VITE_SUPABASE_URL || !E.VITE_SUPABASE_ANON_KEY) {
    console.error('Geen VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY gevonden. Stop.')
    process.exit(2)
  }

  await check('Site laadt', async () => {
    const res = await fetch(URL_APP, { headers: { 'cache-control': 'no-cache' } })
    if (!res.ok) throw new Error(`status ${res.status}`)
    const html = await res.text()
    if (!html.includes('<div id="root"')) throw new Error('geen app-html gevonden')
    const script = html.match(/src="(\/assets\/[^"]+\.js)"/)
    if (!script) throw new Error('geen javascript-bundel in de pagina')
    const bundel = await fetch(`${URL_APP}${script[1]}`)
    if (!bundel.ok) throw new Error(`bundel niet bereikbaar (status ${bundel.status})`)
    return 'html en javascript staan klaar'
  })

  await check('Versiebestand', async () => {
    const res = await fetch(`${URL_APP}/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) throw new Error(`status ${res.status}`)
    const data = await res.json()
    if (!data?.build) throw new Error('geen build-nummer')
    return `versie ${data.build}`
  })

  const anon = createClient(E.VITE_SUPABASE_URL, E.VITE_SUPABASE_ANON_KEY)

  await check('Database bereikbaar', async () => {
    const { error } = await anon.from('leads').select('id').limit(1)
    // een RLS-weigering is prima: dat betekent dat de database antwoordt en dicht staat
    if (error && !/row-level security|permission/i.test(error.message)) throw new Error(error.message)
    return 'antwoordt'
  })

  await check('Leads afgeschermd voor buitenstaanders', async () => {
    const { data, error } = await anon.from('leads').select('id').limit(1)
    // een netwerkfout is geen bewijs dat het dicht staat, dus die telt als fout
    if (error && /fetch failed|network|timeout/i.test(error.message)) throw new Error(error.message)
    if (error) return 'dicht (geweigerd)'
    if (data && data.length > 0) throw new Error('LEK: niet-ingelogd ziet leads')
    return 'dicht (geen rijen)'
  })

  if (!E.SMOKE_EMAIL || !E.SMOKE_PASSWORD) {
    console.log('\nLet op: SMOKE_EMAIL/SMOKE_PASSWORD ontbreken, de checks met login worden overgeslagen.\n')
    return rapport()
  }

  const client = createClient(E.VITE_SUPABASE_URL, E.VITE_SUPABASE_ANON_KEY)
  let gebruiker = null

  await check('Inloggen', async () => {
    const { data, error } = await client.auth.signInWithPassword({ email: E.SMOKE_EMAIL, password: E.SMOKE_PASSWORD })
    if (error) throw new Error(error.message)
    gebruiker = data.user
    return `ingelogd als ${data.user.email}`
  })

  if (!gebruiker) return rapport()

  await check('Profiel laden', async () => {
    const { data, error } = await client.from('profiles').select('id, role, organization_id').eq('id', gebruiker.id).maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) throw new Error('geen profielrij, dit account kan niet werken')
    return `rol ${data.role}`
  })

  await check('Projecten en lijsten laden', async () => {
    const { data, error } = await client.from('lead_lists').select('id, name').limit(20)
    if (error) throw new Error(error.message)
    return `${data.length} lijst(en) zichtbaar`
  })

  await check('Leads laden', async () => {
    const { data, error } = await client.from('leads').select('id, status').limit(20)
    if (error) throw new Error(error.message)
    return `${data.length} lead(s) zichtbaar`
  })

  await check('Belgeschiedenis laden', async () => {
    const { error } = await client.from('call_logs').select('id').limit(5)
    if (error) throw new Error(error.message)
    return 'ok'
  })

  await check('Toegangsfuncties werken', async () => {
    const [tools, lists] = await Promise.all([
      client.rpc('my_tool_keys'),
      client.rpc('my_list_ids')
    ])
    if (tools.error) throw new Error(`my_tool_keys: ${tools.error.message}`)
    if (lists.error) throw new Error(`my_list_ids: ${lists.error.message}`)
    return 'my_tool_keys en my_list_ids antwoorden'
  })

  await check('Foutlogboek schrijfbaar', async () => {
    const { error } = await client.from('app_errors').insert({
      user_id: gebruiker.id, context: 'smoketest', message: 'gezondheidscheck'
    })
    if (error) throw new Error(error.message)
    return 'melding weggeschreven'
  })

  await check('Afboeken mogelijk (proef op een eigen testrij)', async () => {
    const { data: lijst } = await client.from('lead_lists').select('id').limit(1).maybeSingle()
    if (!lijst) return 'overgeslagen: dit account heeft geen lijst'
    const { data: lead, error } = await client.from('leads').select('id, status').eq('lead_list_id', lijst.id).limit(1).maybeSingle()
    if (error) throw new Error(error.message)
    if (!lead) return 'overgeslagen: geen lead in de lijst'
    // we schrijven de status terug naar exact wat hij was: niets verandert,
    // maar we weten wel of schrijven mag
    const { error: schrijfFout } = await client.from('leads').update({ status: lead.status }).eq('id', lead.id)
    if (schrijfFout) throw new Error(`schrijven mag niet: ${schrijfFout.message}`)
    return 'schrijfrecht op leads werkt'
  })

  await client.auth.signOut()
  rapport()
}

function rapport() {
  const mislukt = resultaten.filter(r => !r.ok)
  console.log('\nGezondheidscheck LEADGEN')
  console.log('='.repeat(50))
  for (const r of resultaten) {
    console.log(`${r.ok ? 'OK  ' : 'FOUT'}  ${r.naam.padEnd(38)} ${String(r.ms).padStart(5)}ms  ${r.bericht}`)
  }
  console.log('='.repeat(50))
  if (mislukt.length === 0) {
    console.log('Alles werkt.\n')
    process.exit(0)
  }
  console.log(`${mislukt.length} check(s) mislukt. Niet deployen of meteen terugdraaien.\n`)
  process.exit(1)
}

main().catch(err => { console.error('Gezondheidscheck zelf klapte:', err); process.exit(2) })
