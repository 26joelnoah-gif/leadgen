# LEADGEN - Lead Management System

Een lead management systeem voor verkoopteams.

## Stack
- **Frontend**: React + Vite
- **Backend**: Supabase (Auth + Database)
- **Hosting**: Netlify

## Installatie

```bash
npm install
npm run dev
```

## Supabase Setup

1. Maak een project aan op [supabase.com](https://supabase.com)
2. Open de SQL Editor en run `supabase-setup.sql`
3. Kopieer de URL en anon key naar je `.env` bestand:

```
VITE_SUPABASE_URL=your_url
VITE_SUPABASE_ANON_KEY=your_key
```

## Deploy naar Netlify

1. Push naar GitHub
2. Connect repo in Netlify
3. Voeg environment variables toe in Netlify dashboard:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy!

## Gebruik

- **Medewerker**: inloggen, leads bekijken, bellen, statussen bijwerken
- **Admin**: alle leads beheren, toewijzen, rapportages bekijken

## Rollen

- `employee` - normale gebruiker
- `admin` - volledige toegang