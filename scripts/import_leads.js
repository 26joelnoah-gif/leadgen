// scripts/import_leads.js
// Standalone script om massa's leads (bijv. van LeadInsight scraper) te importeren in Supabase.
// Geschreven zonder zware dependencies - gebruikt standaard Node functionaliteiten (Node 18+ ivm fetch).
// Run-instructie: node scripts/import_leads.js /pad/naar/leads.csv

import fs from 'fs'
import readline from 'readline'
import path from 'path'
import { fileURLToPath } from 'url'

// Environment variabelen uitlezen (Zonder 'dotenv' package dependency)
function loadEnv() {
  try {
    const __dirname = path.dirname(fileURLToPath(import.meta.url))
    const envPath = path.resolve(__dirname, '../.env')
    const envFile = fs.readFileSync(envPath, 'utf8')
    
    const env = {}
    envFile.split('\n').forEach(line => {
      const match = line.match(/^([^#=]+)=(.+)$/)
      if (match) env[match[1].trim()] = match[2].trim()
    })
    return env
  } catch (error) {
    console.error('Kon .env bestand niet vinden of lezen. Zorg dat je een .env bestand in de root hebt staan.')
    process.exit(1)
  }
}

const env = loadEnv()
const SUPABASE_URL = env.VITE_SUPABASE_URL
const SUPABASE_KEY = env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('VITE_SUPABASE_URL of VITE_SUPABASE_ANON_KEY ontbreekt in je .env')
  process.exit(1)
}

// Haal pad op uit commando: `node import_leads.js /pad/naar/leads.csv`
const csvFilePath = process.argv[2]

if (!csvFilePath) {
  console.log('Gebruik: node scripts/import_leads.js <path-naar-je-csv-bestand.csv>')
  process.exit(1)
}

if (!fs.existsSync(csvFilePath)) {
  console.error(`Het bestand "${csvFilePath}" kon niet gevonden worden.`)
  process.exit(1)
}

function parseCSVLine(line) {
  // Simpele parser (houdt rekening met simpele comma's)
  return line.split(',').map(s => s.trim())
}

async function startImport() {
  console.log('🚀 Start Lead Import naar Supabase...')
  
  const fileStream = fs.createReadStream(csvFilePath)
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity })

  let headers = []
  let totalImported = 0
  let isFirstLine = true

  for await (const line of rl) {
    if (!line.trim()) continue
    
    if (isFirstLine) {
      headers = parseCSVLine(line).map(h => h.toLowerCase()) // bijv: ['name', 'phone', 'email', 'company_size']
      console.log('Kolommen herkend:', headers)
      isFirstLine = false
      continue
    }

    const values = parseCSVLine(line)
    const leadData = {}
    
    headers.forEach((header, index) => {
      if (values[index]) leadData[header] = values[index]
    })

    // Standaard waarden forceren als ze missen in de CSV
    if (!leadData.name) leadData.name = 'Onbekende Lead'
    if (!leadData.phone) leadData.phone = 'Geen Nummer'
    if (!leadData.status) leadData.status = 'new'
    if (!leadData.lead_source) leadData.lead_source = 'cold'

    // REST API call naar Supabase (auth via anon_key)
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/leads`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(leadData)
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`❌ Fout bij importeren lead ${leadData.name}:`, errorText)
      } else {
        totalImported++
        process.stdout.write(`✅ Geïmporteerd: ${leadData.name}\r`)
      }
    } catch (e) {
      console.error(`❌ Netwerkfout bij ${leadData.name}:`, e.message)
    }
  }

  console.log(`\n🎉 Import voltooid! ${totalImported} leads succesvol toegevoegd aan de database.`)
  console.log('Let op: De leads zijn nu zichtbaar voor Admins. Ze moeten mogelijk nog worden gerouteerd naar medewerkers.')
}

startImport()
