// v68: productmerken waaronder accountmanagers verkopen (BRIEF-leadgen).
// Klanten zien alleen het productmerk, nooit "LEADGEN" of "Reachconnect".
// Wordt later de tabel `products` (met eigen Mollie-key, branding, webhook);
// tot die tijd staan de plannen hier zodat de "Offerte sturen"-popup werkt.
// Prijzen ex btw (DECISIONS.md 2026-09-07). Bedragen als getallen in euro's,
// zoals de rest van public.offertes (eenmalig_ex, maandbedrag_ex).

export const PRODUCTS = {
  mk: {
    code: 'mk',
    naam: 'MarketingKiezer',
    prijsmodelVersie: 'mk-2026-09',
    // interval-codes volgen contracts.interval uit de brief
    plans: [
      {
        id: 'year_upfront',
        label: 'Jaar vooruit',
        omschrijving: '€799 per jaar, in één keer vooraf (standaard)',
        regelNaam: 'MarketingKiezer jaarabonnement (12 maanden, vooruitbetaald)',
        eenmalig: 799,
        maand: 0,
        betaling: 'Betaling van het jaarbedrag vooraf via iDEAL.',
      },
      {
        id: 'month_on_year',
        label: 'Maandelijks op jaarcontract',
        omschrijving: '€79 per maand, jaarcontract, automatische incasso',
        regelNaam: 'MarketingKiezer abonnement (jaarcontract, maandelijkse incasso)',
        eenmalig: 0,
        maand: 79,
        betaling: 'Betaling per maand via automatische incasso (SEPA-machtiging na eerste iDEAL-betaling).',
      },
    ],
    akkoordTekst: (plan) =>
      `Door te ondertekenen gaat u namens uw bureau akkoord met een vermelding op MarketingKiezer voor 12 maanden tegen het genoemde tarief (excl. btw) en met de algemene voorwaarden van MarketingKiezer. ${plan.betaling} De overeenkomst wordt na 12 maanden stilzwijgend met 12 maanden verlengd en is tot 1 maand voor het einde van de looptijd opzegbaar.`,
  },
}

export const DEFAULT_PRODUCT_CODE = 'mk'

export function getProduct(code) {
  return PRODUCTS[code] || PRODUCTS[DEFAULT_PRODUCT_CODE]
}

// Offertenummer per product: MK-2026-48213 (uniek per organisatie, bij een
// botsing gewoon opnieuw proberen - zie OfferteSturenModal).
export function nieuwOfferteNummer(product) {
  const jaar = new Date().getFullYear()
  const n = Math.floor(10000 + Math.random() * 90000)
  return `${(product?.code || 'mk').toUpperCase()}-${jaar}-${n}`
}
