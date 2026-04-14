# 📨 Inbox Minimax - UI Redesign Briefing (Focus Mode)

**Datum:** 2026-04-14
**Van:** Noah (via Antigravity)
**Aan:** MiniMax
**Status:** **DESIGN UPDATE VEREIST**

---

Hoi MiniMax,

Noah heeft zojuist een referentie-afbeelding gedeeld van hoe de **Beller-weergave (Focus Mode / Lead Weergave)** er exact uit moet komen te zien voor de medewerkers. Je missie is om de huidige werknemers-weergave van een lead (`LeadCard.jsx` of de Focus Mode in `Dashboard.jsx`) volledig te verbouwen naar dit nieuwe design.

Hier is de snoeiharde briefing van het nieuwe design dat je moet bouwen:

### Algemene Layout & Structuur
Het design wijkt af van onze huidige "simpele" cards en gaat naar een zéér gestructureerde CRM-layout met blokken. Het gebruikt een systeem van uitklapbare secties (of in ieder geval visueel gescheiden balken die starten met een `>`).

#### 1. Top Header (Meteen onder de navigatie)
- **Groot en vet:** [Bedrijfsnaam] (bijv. "Bedrijf Marleen en Jasper")
- **Daaronder:** "Tel: [Telefoonnummer]"
- **Rechts:** Een pill/badge met tag informatie (bijv. "> Klant Auto verhuur").

#### 2. Sectie: > Bedrijfsgegevens
Dit is het belangrijkste blok. Het bevat een **3-kolommen grid** met drie losse "Cards". 
*Elke card heeft een dikke donkerblauwe/paarse top-headerbalk met witte tekst.*
- **Kolom 1: "Adres"**
  - Inputs: Naam, Straat, Huisnummer (naast elkaar), Postcode, Plaats (naast elkaar).
- **Kolom 2: "Contactpersoon"**
  - Inputs: Contact personen, Geslacht (dropdown), Functie.
- **Kolom 3: "Contact"**
  - Inputs: Email, Telefoonnummer, Website.

#### 3. Sectie: Extra velden
Een brede sectie (over de hele breedte), eveneens met een paars/blauwe titelbalk "Extra velden".
- Bevat verticale blokken met inputs voor specifieke lead data zoals: Datum, Doel, etc. (Dit kunnen we mappen op onze bestaande of nieuwe "notes" / custom fields).
- **Korte knop eronder:** "Bedrijf bewerken" (paarse/blauwe knop).

#### 4. Sectie: > Uploads
Een brede sectie met een tabel-interface.
- **Tabel Headers:** BESTANDSNAAM, DATUM UPLOAD, ACTIES
- Een "Bestand kiezen" input met een "Upload" knop ernaast.

#### 5. Sectie: > Belactiviteiten
- Hier komt de huidige Activity Feed van de lead (de log van bel-acties en notities).

### Styling & CSS Instructies voor MiniMax
- Gebruik een lichtgrijze achtergrond voor de pagina.
- De cards ("Adres", "Contactpersoon", "Contact", "Extra velden") hebben scherpe of licht afgeronde hoeken, een witte basis, en een solide, kleurrijke (paars/donkerblauw) header. 
- Inputs hebben heldere outlines (borders) en labels staan duidelijk aan de top-left van elke input box (inset of floating style).
- Het contrast moet hoog zijn zodat bellers razendsnel velden kunnen vinden en aflezen.

**Jouw Actie:**
Bouw dit nieuwe layout-grid. Je mag de bestaande velden in de database (`leads` tabel) re-mappen naar deze weergave. Als bepaalde velden (zoals straat, huisnummer, website, geslacht) nog niet bestaan in onze Supabase DB, voeg deze dan toe aan de Supabase schema's of sla ze voorlopig op in een JSONB `metadata` kolom op de lead.

Succes met het verbouwen!
— Namens Noah
