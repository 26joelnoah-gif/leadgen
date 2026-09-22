# Briefing voor Gemini Flash — LeadGen Project

**Datum:** 2026-04-16
**Van:** Claude (Cowork)

---

## Huidige Status
App is functioneel stabiel. Kritieke bugs zijn opgelost. Zie CLAUDE.md voor volledige context.

## Jouw Takenpakket (Gemini = snelle targeted fixes)

### Nu te doen — UX & CSS fixes:

1. **WorkInterface disposition knoppen** — Check `src/components/WorkInterface.jsx`. Zorg dat de 7 disposities visueel duidelijk zijn (kleur-coded). Deal = groen, Geen interesse = rood, Terugbel = oranje, etc.

2. **Loading states** — Voeg een spinner toe aan knoppen die async acties uitvoeren (disposition submit, lead laden). Gebruik de CSS variabelen: `--primary: #3B82F6`.

3. **Empty states** — Als er geen leads zijn in een lijst, toon een duidelijke melding in WorkInterface en Dashboard.

4. **Mobile responsiveness check** — Basis check of het op mobiel niet breekt. Geen volledige mobile build nodig, maar niets mag horizontaal overflow.

5. **Reports.jsx datum filters** — Als er nog geen datum range pickers zijn in Reports, voeg ze toe. Simpele `<input type="date">` is voldoende.

## NIET aanraken (al gefixed door andere agents):
- `src/hooks/useLeads.js` — stale closures al gefixed
- `src/context/AuthContext.jsx` — startWorkingWithList al toegevoegd
- `src/components/WorkInterface.jsx` — complete rewrite al gedaan
- `src/components/Toast.jsx` — nieuwe toast system, gebruik `useToast` hook
- `src/pages/Dashboard.jsx` — filter bug al gefixed, calling mode unified

## Regels:
- Gebruik altijd `useToast()` ipv `alert()` of `confirm()`
- Gebruik altijd `setLeads(prev => prev.map(...))` nooit `setLeads(leads.map(...))`
- CSS variabelen in `/src/index.css` — gebruik die, geen hardcoded kleuren
- Commit na elke fix: `git add -A && git commit -m "fix: [beschrijving]"`

— Claude

---
## TAAK: SEO (Prioriteit: Hoog)

Pas `index.html` aan voor SEO + social sharing:

```html
<\!-- In <head>: -->
<meta name="description" content="LeadGen — Het slimste CRM en belsysteem voor sales teams. Leads beheren, bellen, deals sluiten." />
<meta name="keywords" content="CRM, leadgeneratie, belsysteem, sales software, appointment setting, lead management" />
<meta property="og:title" content="LeadGen — Premium Sales CRM" />
<meta property="og:description" content="Leads beheren, bellen en deals sluiten in één platform." />
<meta property="og:type" content="website" />
<meta name="robots" content="index, follow" />
<link rel="canonical" href="https://jouw-leadgen-url.netlify.app/" />
```

Voeg ook toe aan `index.html` net voor `</body>`:
```html
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"SoftwareApplication","name":"LeadGen","applicationCategory":"BusinessApplication","description":"CRM en belsysteem voor sales teams","offers":{"@type":"Offer","price":"0","priceCurrency":"EUR"}}
</script>
```

Commit: `git commit -m "seo: meta tags, og, structured data"`
