import { createContext, useContext, useEffect, useState } from 'react'

// Thema-schakelaar (RESTYLE_PLAN.md fase 1).
// data-theme op <html> stuurt de tokens in src/styles/tokens.css aan.
// Voorkeur wordt onthouden in localStorage; standaard = donker,
// zodat bestaande gebruikers niets merken.

const STORAGE_KEY = 'leadgen-theme'
const ThemeContext = createContext({ theme: 'dark', toggleTheme: () => {} })

export function getStoredTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch (e) { /* localStorage niet beschikbaar */ }
  return 'dark'
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getStoredTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try { localStorage.setItem(STORAGE_KEY, theme) } catch (e) { /* noop */ }
  }, [theme])

  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'))

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
