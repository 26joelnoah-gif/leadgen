// v159: Settertool (v160: live, teksten bijgewerkt met kennisbank 23-11 + prijsanker)
// v159: Settertool - ALLE teksten die een setter ziet staan in dit ene bestand.
// Script, haken, bezwaren, eisen en onboarding aanpassen = alleen hier.
// Een project gebruikt een tool via campaigns.setter_tool (bijv. 'prosell').
//
// Placeholders in teksten: [naam] [naam setter] [bedrijf] [branche]
// [wat viel op] [kanaal] [moment 1] [moment 2] [dag] [tijd].
// De tool vult ze in vanuit de lead en de velden van de setter; wat niet
// bekend is blijft als [..] staan, zodat de setter ziet wat hij zelf zegt.

export const SETTERTOOLS = {
  prosell: {
    naam: 'ProSell',
    rolCloser: 'adviseur',

    // ---------- Belscript (brief 5) ----------
    stappen: [
      {
        id: 'opening',
        titel: 'Opening',
        duur: '5 sec',
        tekst: ['Hoi [naam], met [naam setter] van ProSell. Ik bel je met een reden.'],
        varianten: [
          {
            label: 'Met context (alleen als het echt waar is)',
            tekst: 'Hoi [naam], met [naam setter] van ProSell. We werken voor een paar [branche] hier in de regio. Heb je onze naam weleens horen vallen?',
          },
          {
            label: 'Niet de eigenaar aan de lijn',
            tekst: 'Ik wil graag de eigenaar spreken over jullie marketing. Wanneer is hij of zij er?',
          },
        ],
        tips: [
          'Voor je belt: kijk 30 seconden naar de site en socials. Vul "Wat viel op" in.',
          'Nee (meestal): door naar het probleem.',
          'Ja: "Wat heb je gehoord?" en luisteren.',
          'Zeg nooit "Stoor ik?" of "Heb je 2 minuten?"',
        ],
      },
      {
        id: 'probleem',
        titel: 'Het probleem',
        duur: '20 sec',
        haakStap: true, // hier komt de tekst van de gekozen haak
        tips: [],
      },
      {
        id: 'interesse',
        titel: 'Interesse checken',
        duur: '5 sec',
        tekst: ['Herken je dat, of loopt het bij jullie goed?'],
        tips: [
          'Ja of "een beetje": door naar de vragen.',
          'Nee: "Mooi om te horen. Wat werkt bij jullie het best?" Anders netjes afsluiten.',
        ],
      },
      {
        id: 'vragen',
        titel: 'Vragen (2 tot 3, geen verhoor)',
        duur: '',
        tekst: [
          'Hoe komen nieuwe klanten nu bij jullie binnen?',
          'Wie doet nu jullie socials of advertenties?',
          'Als iemand jullie vindt, wat gebeurt er dan?',
          'Waar zou je het eerst mee aan de slag willen: social media, advertenties, je website, of iets anders?',
          'Beslis jij hierover, of doe je dat samen met iemand?',
          'Ik hoor van de meeste [branche] dat ze nu ongeveer tussen de 1.500 en 3.500 euro per maand betalen voor marketing. Komt dat bekend voor? Hoeveel is dat nu ongeveer bij jullie?',
        ],
        eisenStap: true,
        tips: [
          'Geen interesse: niet aandringen. Vraag of je over 3 maanden mag terugbellen.',
          'De vraag over 1.500 tot 3.500 euro gaat over wat ze NU uitgeven. Het is niet onze prijs. Onze prijs noemt de adviseur.',
        ],
      },
      {
        id: 'afspraak',
        titel: 'Afspraak (CTA)',
        duur: '',
        tekst: [
          'Dan is een audit zinvol voor je. Een adviseur van ons kijkt naar je huidige opzet en laat in 30 minuten zien wat beter kan en wat wij daarin kunnen doen. Daarna krijg je een aanbod, en dan beslis jij.',
          'Wil je dat de adviseur bij je langskomt, of liever online via video?',
          'Past [moment 1] of [moment 2] beter?',
        ],
        tips: ['Kies zelf 2 momenten. Gebruik "Zet in agenda" bij Afspraak om te zien wanneer de adviseur vrij is.'],
      },
      {
        id: 'vastzetten',
        titel: 'Vastzetten',
        duur: '',
        tekst: [
          'Dus [dag] om [tijd] uur, [op adres / online]. Is er iemand die mee beslist? Kan die er ook bij zijn?',
          'Ik stuur je zo een WhatsApp met de afspraak. Wil je die bevestigen?',
        ],
        tips: [
          'Leg daarna de afspraak vast met de knop Afspraak.',
          'Elke "nee" eindigt met een terugbelmoment of een uitkomst in de CRM. Nooit met niets.',
          'Voicemail: gebruik de voicemailtekst die in ReachConnect staat.',
        ],
      },
    ],

    // ---------- Haken (stap 2) ----------
    haken: [
      {
        id: 'standaard',
        label: 'Standaard',
        wanneer: 'Altijd te gebruiken',
        tekst: [
          'De reden dat ik bel: veel eigenaren van [branche] die ik spreek, geven elke maand geld uit aan marketing. Aan socials, advertenties of een bureau. Maar ze weten niet precies wat het oplevert. Ze zien likes en views, maar niet hoeveel klanten erbij komen. En ze twijfelen of ze op de goede kanalen zitten.',
          'Daarom maken wij een marketingaudit van je huidige opzet: wat het kost, wat het oplevert en waar het lekt.',
        ],
      },
      {
        id: 'opgevallen',
        label: 'Iets dat opviel',
        wanneer: 'Je zag iets bij de check',
        tekst: ['Ik keek net naar [bedrijf] en zag [wat viel op]. Waren jullie daar al mee bezig?'],
      },
      {
        id: 'een_kanaal',
        label: 'Eén kanaal',
        wanneer: 'Klant zit vooral op 1 kanaal',
        tekst: ['Veel [branche] zitten alleen op [kanaal]. Ze weten niet of andere kanalen meer opleveren.'],
      },
      {
        id: 'weinig_online',
        label: 'Doet weinig online',
        wanneer: 'Geen socials, oude site',
        tekst: ['Veel [branche] krijgen alles via mond-tot-mond. Dat werkt, tot het stil wordt. Dan is er online niets om op terug te vallen.'],
      },
      {
        id: 'bureau',
        label: 'Heeft al een bureau',
        wanneer: 'Klant werkt met een bureau',
        tekst: ['Veel ondernemers met een bureau krijgen elke maand een rapport, maar weten niet wat het in klanten oplevert.'],
      },
    ],

    // ---------- 4 eisen voor een afspraak ----------
    eisen: [
      { id: 'beslisser', label: 'Beslisser', door: 'Eigenaar, of de mede-beslisser is bij de afspraak' },
      { id: 'interesse', label: 'Interesse', door: 'Klant noemt minstens 1 onderwerp' },
      { id: 'tijd', label: 'Tijd', door: 'Er staat een dag en tijd' },
      { id: 'beeld', label: 'Beeld (alleen bij social media)', door: 'Klant staat open voor video met zichzelf of het team: ja of "misschien"' },
    ],

    interesseOpties: [
      { id: 'social_media', label: 'Social media' },
      { id: 'advertenties', label: 'Advertenties' },
      { id: 'website', label: 'Website' },
      { id: 'anders', label: 'Anders' },
    ],

    // ---------- Bezwaren ----------
    bezwarenUitleg: 'Eerst meegaan ("Snap ik", "Klopt"), niet tegenpraten. Dan een vraag terug, daarna weer een keuzevraag. Na 2 keer nee: netjes afsluiten.',
    bezwaren: [
      { id: 'geen_tijd', label: 'Geen tijd', antwoord: 'Snap ik, je bent druk met je zaak. Daarom is het maar 30 minuten, bij jou op locatie of online. Wanneer is het rustig: begin van de week of eind van de week?' },
      { id: 'mail', label: 'Stuur maar een mail', antwoord: 'Doe ik. Alleen: een mail is voor iedereen hetzelfde. In de audit kijkt onze adviseur echt naar jouw bedrijf. Zal ik de mail sturen en ook alvast een moment vastzetten?' },
      { id: 'kosten', label: 'Wat kost het?', antwoord: 'Dat hangt af van wat je nodig hebt. Dat hoor je in de audit, en daarna krijg je een aanbod op maat.' },
      { id: 'budget', label: 'Te duur / geen budget', antwoord: 'Helder, dan is het nu misschien niet het moment. Mag ik je over 3 maanden nog eens bellen?' },
      { id: 'bureau', label: 'Al een bureau / doen het zelf', antwoord: 'Mooi. Wat gaat goed, en wat mag beter? Een audit van je huidige opzet is een tweede blik. Het kost je 30 minuten, en je hoeft niets.' },
      { id: 'werkt_het', label: 'Werkt dat wel?', antwoord: 'Goede vraag. Je mag het nummer van een van onze klanten krijgen, dan hoor je het van hen zelf.', actie: 'referentie' },
      { id: 'overleggen', label: 'Ik moet het overleggen', antwoord: 'Logisch. Kan diegene er ook bij zijn op de afspraak? Dan hoort iedereen hetzelfde.' },
      { id: 'volgende_maand', label: 'Bel volgende maand maar', antwoord: 'Doe ik. Welke dag en welk uur is goed?', actie: 'terugbellen' },
      { id: 'vast', label: 'Zit ik dan ergens aan vast?', antwoord: 'Nee. We werken per maand en je kunt altijd stoppen.' },
      { id: 'camera', label: 'Ik wil zelf niet voor de camera', antwoord: "Hoeft niet. We werken ook met UGC-creators of met productvideo's zonder gezicht." },
    ],

    // ---------- Onboarding (brief 6) ----------
    onboarding: [
      {
        titel: 'Wie is ProSell',
        alinea: ['ProSell is een marketingbureau, gevestigd in Zevenaar, Arnhem en Duiven. We bedenken marketing en voeren die ook zelf uit. Website: prosellmarketing.nl.'],
      },
      {
        titel: 'Wat we doen',
        alinea: ['Kort gezegd: we zorgen dat bedrijven gevonden worden, dat bezoekers klant worden en dat klanten terugkomen.'],
        tabel: {
          kop: ['Stap', 'Wat'],
          rijen: [
            ['Gevonden worden', "Video's, social media en advertenties"],
            ['Klant maken', 'Websites en goed vindbaar in Google'],
            ['Klant houden', 'Opvolgen en contact houden met klanten'],
          ],
        },
        naTabel: ['Meer hoef je niet te weten. In het gesprek vraag je waar de klant het eerst mee aan de slag wil. De details bespreekt de adviseur.'],
      },
      {
        titel: 'Voor wie',
        alinea: [
          "Je belt de bedrijven op je belijst. Kom je toch een van deze tegen? Sla die over: kappers, barbers, nagelsalons, zzp'ers zonder personeel en franchises.",
          'Wie past goed: bedrijven met een hoge waarde per klant en een product dat goed in beeld werkt. Bijvoorbeeld keukenzaken en showrooms, webshops, hotels en restaurants. Regio: eerst Gelderland.',
        ],
      },
      {
        titel: 'Cases (hooguit 1 per gesprek, precies zo zeggen)',
        lijst: [
          'Van Baal Circulair: "We maken hun video\'s. Meer dan 5 miljoen views."',
          'Een dakdekker in Arnhem: "Nieuwe website live in 1 dag, en van 0 naar 7 reviews."',
          'Een recruitmentbedrijf: "Van 1 op de 100 bezoekers die solliciteert naar ruim 1 op de 4."',
        ],
        naTabel: ['Twijfelt de klant? Zeg: "Je mag het nummer van een van onze klanten krijgen." Zet het verzoek bij de lead.'],
      },
      {
        titel: 'Jouw taak',
        genummerd: [
          'Bel volgens het belscript.',
          'Plan de afspraak in de agenda van de adviseur. Online: videocall van 30 minuten. Langskomen: bezoek van 1 uur.',
          'Bevestig via je eigen WhatsApp en leg de uitkomst vast in de CRM.',
        ],
        naTabel: ['De adviseur doet de rest.'],
      },
      {
        titel: 'Na de afspraak',
        lijst: [
          'Binnen 24 uur geen bevestiging via WhatsApp? Bel 1 keer.',
          '1 dag voor de afspraak: stuur de klant een herinnering.',
          'Je terugbelmomenten staan op die dag in je lijst.',
          'De uitkomst van de afspraak zie je in Mijn afspraken.',
          'Je vergoeding staat in je verklaring, niet in deze tool.',
        ],
      },
      {
        titel: 'Afmelden',
        alinea: ['Wil iemand niet meer gebeld worden? Zet de lead op "bel me niet" (knop Blacklist).'],
      },
      {
        titel: 'Wel en niet zeggen',
        tabel: {
          kop: ['Wel', 'Niet'],
          rijen: [
            ['"We doen marketing en de uitvoering."', 'Prijzen noemen. Dat doet de adviseur.'],
            ['"Je krijgt een marketingaudit van je huidige opzet."', 'Iets gratis beloven, zoals een gratis shoot.'],
            ['De cases, precies zoals ze hierboven staan', 'Beloven dat de klant bovenaan in Google komt of meer klanten krijgt'],
            ['"Dat weet ik niet, dat vraag ik voor je na."', 'Iets verzinnen als je het antwoord niet weet'],
            ['"We werken per maand. Je zit niet jaren vast."', 'Cijfers noemen die niet bij de cases staan'],
            ['"Je weet vooraf wat het kost."', 'Aandringen bij geen interesse'],
            ['"De meeste [branche] betalen nu ongeveer 1.500 tot 3.500 euro per maand voor marketing." (als vraag, zie belscript)', 'Werving in de techniek gebruiken als haak'],
          ],
        },
      },
      {
        titel: 'Veelgestelde vragen van klanten',
        tabel: {
          kop: ['Vraag', 'Kort antwoord'],
          rijen: [
            ['Wie zijn jullie?', 'Een marketingbureau uit Zevenaar, Arnhem en Duiven. We bedenken marketing en voeren die ook zelf uit.'],
            ['Wat doen jullie precies?', 'We zorgen dat je gevonden wordt, dat bezoekers klant worden en dat klanten terugkomen.'],
            ['Wat gebeurt er in de afspraak?', 'Een adviseur kijkt naar je huidige opzet en laat in 30 minuten zien wat beter kan. Daarna krijg je een aanbod, en dan beslis jij.'],
            ['Moet ik al weten welke dienst ik wil?', 'Nee. Vertel wat je wilt bereiken. Wij zoeken uit wat daarbij past.'],
            ['Wat kost het?', 'Dat hangt af van wat je nodig hebt. Dat hoor je in de audit.'],
            ['Zit ik ergens aan vast?', 'Nee. We werken per maand.'],
            ['Hoe snel zie ik resultaat met SEO?', 'Technische fixes werken vaak binnen weken. Nieuwe content heeft 3 tot 6 maanden nodig.'],
            ['Moet ik zelf voor de camera?', "Hoeft niet. Het kan ook met UGC-creators of productvideo's zonder gezicht."],
            ['Werken jullie door heel Nederland?', 'Ja. Buiten de regio rekenen we alleen reiskosten.'],
            ['Kan ik een klant van jullie spreken?', 'Ja, je mag het nummer van een van onze klanten krijgen. (Vastleggen bij de lead.)'],
            ['Kan ik zelf teksten op mijn site aanpassen?', 'Ja, via een simpel beheer. Of wij doen het voor je.'],
          ],
        },
      },
    ],

    // Afvinklijst eerste week. id's niet wijzigen (staan per setter in de database).
    weekChecklist: [
      { id: 'd1_lezen', tekst: 'Dag 1: lees deze onboarding en het belscript. Kijk rond op prosellmarketing.nl, vooral bij de cases.' },
      { id: 'd1_toegang', tekst: 'Dag 1: krijg toegang tot de CRM (project ProSell) en de agenda van de adviseur.' },
      { id: 'd2_oefenen', tekst: 'Dag 2: oefen het belscript 3 keer hardop met een collega. Wissel van rol.' },
      { id: 'd2_meeluisteren', tekst: 'Dag 2: luister mee met 5 gesprekken van een ervaren setter.' },
      { id: 'd3_bellen_mee', tekst: 'Dag 3: bel zelf, met iemand die meeluistert. Bespreek na elk uur wat goed ging.' },
      { id: 'd45_zelf', tekst: 'Dag 4 en 5: bel zelfstandig. Doel: je eerste afspraak.' },
      { id: 'eind_gesprek', tekst: 'Eind van de week: kort gesprek met Noah. Wat werkt, waar loop je tegenaan?' },
    ],
  },
}

export function setterTool(key) {
  return (key && SETTERTOOLS[key]) || null
}

// Vult [placeholders] in. Onbekende of lege waarden blijven als [..] staan.
export function vulScript(tekst, waarden) {
  return String(tekst || '').replace(/\[([^\]]+)\]/g, (heel, sleutel) => {
    const w = waarden?.[sleutel.trim().toLowerCase()]
    return (w && String(w).trim()) ? String(w).trim() : heel
  })
}

// Welke uitkomst van de settertool hoort bij een gewone leadstatus.
// 'niet_eigenaar' kiest de setter zelf (vinkje in het paneel) bij een terugbelafspraak.
export function uitkomstVoorStatus(status, nietEigenaar) {
  if (status === 'afspraak_gemaakt') return 'afspraak'
  if (status === 'terugbelafspraak' || status === 'later_bellen' || status === 'onjuiste_timing') {
    return nietEigenaar ? 'niet_eigenaar' : 'terugbellen'
  }
  if (status === 'geen_interesse' || status === 'blacklist') return 'geen_interesse'
  if (status === 'geen_gehoor' || status === 'voicemail' || status === 'verkeerd_nummer') return 'niet_bereikt'
  return 'anders'
}
