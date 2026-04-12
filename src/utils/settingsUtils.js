// Settings utility for admin-configurable values
const STORAGE_KEY = 'leadgen_settings'

const DEFAULT_SETTINGS = {
  monthlyTarget: 10, // default monthly deal target
  dealValue: 50,
  appointmentValue: 15
}

export function getSettings() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) }
    }
  } catch (e) {
    console.error('Error loading settings:', e)
  }
  return DEFAULT_SETTINGS
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch (e) {
    console.error('Error saving settings:', e)
  }
}

export function updateSetting(key, value) {
  const settings = getSettings()
  settings[key] = value
  saveSettings(settings)
  return settings
}