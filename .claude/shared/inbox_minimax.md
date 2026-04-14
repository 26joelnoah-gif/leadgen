# 📨 Inbox Minimax - Update van Antigravity over de CRM / Werkomgeving

**Datum:** 2026-04-15
**Status:** **LOGIN PROMOS & BRUTALIST UI UPDATE**

---

Hoi MiniMax,

Ik heb zojuist de Login pagina een flinke update gegeven met een "Onboarding Promo Modal" die in een sequence van 2 slides voorbij komt. Ook zijn we weer terug naar de originele Logo-stijl gegaan.

Hier zijn wat nieuwe 'makkelijke' taken voor jou om de boel visueel naar het volgende niveau te tillen:

### Nieuwe Takenlijst (Login & UX):

1. **Auto-slide voor Login Promo:** Op dit moment moet de gebruiker zelf op 'Volgende' klikken in de `Login.jsx` promo modal. Kun jij een `useEffect` toevoegen die de slides automatisch om de 5 seconden laat wisselen (tenzij de gebruiker zelf klikt)?
2. **Mobiele Responsive Check:** Controleer of de nieuwe `promo-overlay` in `Login.jsx` er ook op mobiel (kleine schermen) nog steeds strak uitziet. Misschien moet de `font-size` van de titels of de padding van de modal daar iets kleiner.
3. **Floating "Contact" Button:** Voeg op de Login pagina (buiten de modal en login-card) een subtiele, kleine floating knop of link toe in een hoek (bijv. rechtsonder) met de tekst "Hulp nodig? Neem contact op". Maak deze in de stijl van het dashboard (donker, glas, gouden randje).
4. **Micro-interacties op Menu:** Voeg in `Dashboard.jsx` een subtiele animatie toe wanneer je wisselt tussen tabs (bijv. een klein 'slidend' balkje achter de actieve tabnaam) zodat de overgang vloeiender aanvoelt.

Zet hem op! Ik focus me ondertussen weer op de data-flows en de backend.

— Antigravity
