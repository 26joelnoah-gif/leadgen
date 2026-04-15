# LEADGEN — Project Visie & Context

## Eigenaar
Noah Ando — noah.ando1@icloud.com
Bouwt zonder programmeerervaring, dag 3-4 op moment van documenteren.
Gebruikt Minimax (Claude terminal in Antigravity), Gemini 2.0 Flash (apart venster in Antigravity), en Claude (Cowork) parallel.

## Huidige Status
Werkend CRM/belsysteem voor eigen gebruik:
- Lead management + dialer (WorkInterface)
- Supabase backend (auth, realtime, PostgreSQL)
- Netlify deploy
- Multi-user met rollen (admin/employee)
- Teams, lijsten, flows, payouts

## Visie — Waar naartoe

### Fase 1 (Nu): Intern werkend CRM
Stabiel en betrouwbaar systeem voor eigen sales team.
Prioriteit: bugs fixen, core flows werkend, data betrouwbaar.

### Fase 2: SaaS — Bedrijven als klanten
LeadGen wordt een platform waar **bedrijven zich aanmelden**.
- Elk bedrijf krijgt eigen omgeving (multi-tenant)
- Eigen leads, eigen team, eigen flows
- Maandelijks abonnement

### Fase 3: Marketplace
Twee-zijdig platform:
- **Bedrijven** plaatsen klussen (lead lijsten die gebeld moeten worden)
- **Freelance appointment setters / sales freelancers** schrijven in op klussen
- Freelancers verdienen **per lead** (deal/afspraak = uitbetaling)
- Platform verdient commissie op elke transactie

### Fase 4: Data Verrijking
- Integraties: Apollo, LinkedIn, KVK, scrapers
- Bedrijven kunnen ruwe data uploaden → platform verrijkt automatisch
- Verrijkte data direct inzetbaar voor bellers

## Kernwaarden van het Platform
- Snelheid voor bellers (minimale clicks per dispositie)
- Transparantie voor opdrachtgevers (realtime stats)
- Eerlijke uitbetaling voor freelancers (per resultaat)

## Tech Stack
- Frontend: React + Vite + Framer Motion
- Backend: Supabase (PostgreSQL + Auth + Realtime)
- Deploy: Netlify
- Styling: Custom CSS dark theme (--bg-dark: #0F1117, --primary: #3B82F6, --secondary: #F59E0B)

## Agent Taakverdeling
- **Minimax** (Claude terminal Antigravity): complexe refactors, hooks, logica
- **Gemini Flash** (apart venster Antigravity): snelle targeted fixes, CSS, simpele wijzigingen
- **Claude (Cowork)**: architectuur, bugs vinden, directe fixes, visie bewaken

## Belangrijke Beslissingen
- WorkInterface = globale overlay via AuthContext (niet prop-based)
- Calling mode = WorkInterface met listId, itereert door leads
- Disposities matchen exact met STATUS_MAP keys
- Lijstnamen in flow_settings zijn nu bewerkbaar (geen auto-concatenatie meer)
