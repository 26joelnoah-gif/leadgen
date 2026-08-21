// Helpers om website-links schoon en kort te houden.

// Normaliseert een ruwe website-waarde uit een import:
// - voegt https:// toe als het schema mist
// - verwijdert tracking-parameters (utm_*, fbclid, gclid, etc.)
// - verwijdert onnodige rommel zodat het veld kort en klikbaar blijft
export function normalizeWebsite(raw) {
  if (!raw) return null
  let value = String(raw).trim()
  if (!value) return null

  // Soms plakt er tekst omheen ("zie www.site.nl!") — pak het url-achtige deel
  const match = value.match(/(?:https?:\/\/)?(?:www\.)?[\w-]+(?:\.[\w-]+)+[^\s"'<>]*/i)
  if (!match) return null // geen url-achtige waarde -> niet opslaan als website
  value = match[0].replace(/[!,.;:)\]}>]+$/, '')

  if (!/^https?:\/\//i.test(value)) value = `https://${value}`

  try {
    const url = new URL(value)
    // Tracking-parameters weg
    const junk = []
    url.searchParams.forEach((_, key) => {
      if (/^(utm_|fbclid|gclid|gad_|gbraid|wbraid|msclkid|mc_|_hs|ref)/i.test(key)) junk.push(key)
    })
    junk.forEach(k => url.searchParams.delete(k))

    let clean = url.toString().replace(/\/$/, '')
    // Extreem lange urls: alleen domein + pad bewaren, query eraf
    if (clean.length > 120) clean = `${url.origin}${url.pathname}`.replace(/\/$/, '')
    return clean
  } catch {
    return value.slice(0, 120)
  }
}

// Korte weergave voor in tabellen en kaarten: alleen de domeinnaam
export function displayWebsite(url) {
  if (!url) return ''
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`)
    return u.hostname.replace(/^www\./i, '')
  } catch {
    return String(url).replace(/^https?:\/\/(www\.)?/i, '').split(/[/?#]/)[0].slice(0, 40)
  }
}
