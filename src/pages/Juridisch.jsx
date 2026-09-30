// ReachConnect - publieke pagina's /privacy en /voorwaarden.
// Bewust buiten ProtectedRoute: Google vraagt deze links voor het
// OAuth-toestemmingsscherm en ze moeten zonder inloggen te openen zijn.
import { Link } from 'react-router-dom'
import Logo from '../components/Logo'

const BIJGEWERKT = '30 september 2026'

function Kader({ titel, children }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-dark, #0F1117)', color: 'var(--text-main, #E5E7EB)' }}>
      <div style={{ maxWidth: 780, margin: '0 auto', padding: '32px 20px 80px' }}>
        <div style={{ marginBottom: 28 }}>
          <Link to="/" style={{ textDecoration: 'none' }}><Logo /></Link>
        </div>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: 6 }}>{titel}</h1>
        <p style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: 28 }}>Laatst bijgewerkt: {BIJGEWERKT}</p>
        <div style={{ lineHeight: 1.7, fontSize: '0.95rem' }}>{children}</div>
        <p style={{ marginTop: 40, fontSize: '0.8rem', opacity: 0.6 }}>
          <Link to="/privacy" style={{ color: 'var(--primary, #22C55E)' }}>Privacybeleid</Link>
          {' · '}
          <Link to="/voorwaarden" style={{ color: 'var(--primary, #22C55E)' }}>Algemene voorwaarden</Link>
          {' · '}
          <Link to="/" style={{ color: 'var(--primary, #22C55E)' }}>Inloggen</Link>
        </p>
      </div>
    </div>
  )
}

const kop = { fontSize: '1.05rem', fontWeight: 800, marginTop: 26, marginBottom: 8 }

export function Privacy() {
  return (
    <Kader titel="Privacybeleid">
      <p>
        ReachConnect is het CRM- en belsysteem van ReachConnect, gevestigd in Nederland.
        Contact: <a href="mailto:noah@reachconnect.nl" style={{ color: 'var(--primary, #22C55E)' }}>noah@reachconnect.nl</a>.
        Dit beleid legt uit welke gegevens ReachConnect verwerkt en waarom.
      </p>

      <h2 style={kop}>Voor wie is dit</h2>
      <p>
        ReachConnect is een werksysteem. De gebruikers zijn medewerkers en
        opdrachtgevers die een account van ons krijgen. Het is geen dienst waar
        je je zomaar voor aanmeldt.
      </p>

      <h2 style={kop}>Welke gegevens we verwerken</h2>
      <p>
        Van gebruikers: naam, e-mailadres, rol en rechten, roosters, en wat je in
        het systeem doet (gesprekken, afboekingen, notities, ingelogde tijd).
        Dat hebben we nodig om het werk te verdelen, te rapporteren en uit te betalen.
      </p>
      <p>
        Van leads en klanten van onze opdrachtgevers: bedrijfsnaam, contactpersoon,
        telefoonnummer, e-mailadres, adres, en wat er in een gesprek is afgesproken.
        Die gegevens zijn van de opdrachtgever; wij verwerken ze voor hem.
      </p>

      <h2 style={kop}>Gegevens uit je Google-account</h2>
      <p>
        Koppel je je Google Agenda, dan vraagt ReachConnect twee rechten en niet meer:
      </p>
      <ul style={{ paddingLeft: 22, marginTop: 8 }}>
        <li style={{ marginBottom: 6 }}>
          Een eigen agenda aanmaken en beheren. ReachConnect maakt in je account de
          agenda &quot;ReachConnect afspraken&quot; en zet daar jouw afspraken in.
          Andere agenda&apos;s in je account kan ReachConnect met dit recht niet lezen
          of wijzigen.
        </li>
        <li>
          Je beschikbaarheid bekijken. ReachConnect ziet alleen begin- en eindtijden
          van momenten waarop je bezet bent. Geen titels, geen omschrijvingen, geen
          deelnemers, geen locaties.
        </li>
      </ul>
      <p style={{ marginTop: 10 }}>
        Die bezette tijden gebruiken we voor één ding: voorkomen dat een collega een
        afspraak inplant op een moment dat je al bezet bent. We slaan ze maximaal
        vier weken vooruit op en overschrijven ze bij elke synchronisatie.
      </p>
      <p>
        ReachConnect gebruikt gegevens uit je Google-account niet voor advertenties,
        verkoopt ze niet, deelt ze niet met anderen, en gebruikt ze niet om modellen
        te trainen. Het gebruik van gegevens uit Google Workspace API&apos;s voldoet aan
        het Google API Services User Data Policy, inclusief de Limited Use-eisen.
      </p>
      <p>
        Je kunt de koppeling op elk moment weghalen met de knop &quot;Ontkoppelen&quot;
        in ReachConnect, of via je Google-account bij Beveiliging en apps van derden.
        Bij ontkoppelen verwijderen we de agenda die we hebben aangemaakt, trekken we
        de toegang in en wissen we de bewaarde tokens en bezette tijden.
      </p>

      <h2 style={kop}>Hoe lang we gegevens bewaren</h2>
      <p>
        Gegevens van gebruikers bewaren we zolang het account bestaat, en daarna nog
        kort voor de administratie. Leads waar twaalf maanden niets mee is gebeurd
        worden automatisch gewist. Meldt iemand zich af voor bellen of mailen, dan
        wissen we zijn gegevens binnen 48 uur en houden we alleen het feit van de
        afmelding over, zodat we hem niet opnieuw benaderen.
      </p>

      <h2 style={kop}>Beveiliging</h2>
      <p>
        De gegevens staan bij Supabase (servers in de EU). Toegang loopt via een
        persoonlijk account en is per rol beperkt. Sleutels en tokens staan
        versleuteld op de server en komen nooit in de browser.
      </p>

      <h2 style={kop}>Jouw rechten</h2>
      <p>
        Je mag opvragen welke gegevens we van je hebben, ze laten corrigeren of laten
        wissen, en bezwaar maken tegen het gebruik. Stuur een mail naar
        noah@reachconnect.nl en we reageren binnen vier weken. Kom je er met ons niet
        uit, dan kun je klagen bij de Autoriteit Persoonsgegevens.
      </p>

      <h2 style={kop}>Wijzigingen</h2>
      <p>
        Verandert er iets wezenlijks, dan passen we deze pagina aan en veranderen we
        de datum bovenaan.
      </p>
    </Kader>
  )
}

export function Voorwaarden() {
  return (
    <Kader titel="Algemene voorwaarden">
      <p>
        Deze voorwaarden gelden voor het gebruik van ReachConnect, het CRM- en
        belsysteem van ReachConnect. Door in te loggen ga je ermee akkoord.
      </p>

      <h2 style={kop}>Wat ReachConnect is</h2>
      <p>
        Een werksysteem voor sales: leads beheren, bellen, afspraken plannen,
        offertes maken en rapporteren. Toegang krijg je via een account dat wij
        aanmaken of goedkeuren.
      </p>

      <h2 style={kop}>Je account</h2>
      <p>
        Je account is persoonlijk. Je deelt je wachtwoord met niemand en je gebruikt
        het systeem alleen voor het werk waarvoor je toegang hebt gekregen. Merk je
        dat iemand anders bij je account kan, meld dat dan meteen.
      </p>

      <h2 style={kop}>Kosten</h2>
      <p>
        Gebruik van ReachConnect kost &euro;50 per maand per account, elke maand
        opzegbaar. Je betaalt per maand vooruit via Mollie. Stopt de betaling, dan
        stopt de toegang tot je account. Voor accounts die wij zelf aanmaken binnen
        een samenwerking kan een andere afspraak gelden; die staat dan in die
        samenwerking.
      </p>

      <h2 style={kop}>Wat je niet doet</h2>
      <p>
        Gegevens uit het systeem halen voor jezelf of voor een ander, leads bellen of
        mailen buiten de afspraken om, of proberen bij gegevens te komen waar je geen
        recht op hebt. Je houdt je aan de regels voor telemarketing en aan de AVG.
        Het systeem helpt daarbij, maar de verantwoordelijkheid ligt bij jou.
      </p>

      <h2 style={kop}>Beschikbaarheid</h2>
      <p>
        We doen ons best om het systeem draaiend te houden, maar we beloven geen
        ononderbroken beschikbaarheid. Onderhoud, storingen bij leveranciers of
        fouten kunnen het tijdelijk plat leggen.
      </p>

      <h2 style={kop}>Aansprakelijkheid</h2>
      <p>
        We zijn niet aansprakelijk voor schade door gebruik van het systeem, behalve
        wanneer die schade komt door opzet of grove nalatigheid van onze kant.
      </p>

      <h2 style={kop}>Koppelingen met andere diensten</h2>
      <p>
        Koppel je een andere dienst, zoals je Google Agenda, dan gelden daarnaast de
        voorwaarden van die dienst. Wat ReachConnect met die gegevens doet, staat in
        het <Link to="/privacy" style={{ color: 'var(--primary, #22C55E)' }}>privacybeleid</Link>.
      </p>

      <h2 style={kop}>Beëindigen</h2>
      <p>
        We kunnen een account sluiten als iemand zich niet aan deze voorwaarden houdt
        of als de samenwerking stopt. Je kunt zelf altijd vragen om je account te
        laten sluiten.
      </p>

      <h2 style={kop}>Toepasselijk recht</h2>
      <p>
        Op deze voorwaarden is Nederlands recht van toepassing.
      </p>

      <h2 style={kop}>Bedrijfsgegevens</h2>
      <p>
        ReachConnect<br />
        E-mail: <a href="mailto:noah@reachconnect.nl" style={{ color: 'var(--primary, #22C55E)' }}>noah@reachconnect.nl</a><br />
        Website: <a href="https://leadgendash.netlify.app" style={{ color: 'var(--primary, #22C55E)' }}>leadgendash.netlify.app</a>
      </p>
    </Kader>
  )
}
