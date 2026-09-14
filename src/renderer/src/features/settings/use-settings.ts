import { useEffect, useState } from 'react'
import { defaultSettings, type AppSettings } from '../../../../shared/contracts'
export function useSettings() {
  const [settings, setSettings] = useState(defaultSettings)
  const [loading, setLoading] = useState(true)
  const [recovered, setRecovered] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let current = true
    void window.studentIde.settings.get().then(r => {
      if (!current) return
      if (r.ok) { setSettings(r.value.settings); setRecovered(r.value.recovered) }
      else setError(r.error.message)
    }).catch(() => { if (current) setError('Settings could not be loaded. Defaults remain active.') }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [])
  async function update(next: AppSettings): Promise<boolean> {
    try {
      const r = await window.studentIde.settings.update(next)
      if (!r.ok) { setError(r.error.message); return false }
      setSettings(r.value.settings); setError(null); return true
    } catch { setError('Settings could not be saved. Try again.'); return false }
  }
  return { settings, recovered, error, update, loading }
}
export function useTheme(theme: AppSettings['theme']) {
  const [dark, setDark] = useState(true)
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const value = theme === 'dark' || theme === 'system' && media.matches
      document.documentElement.dataset.theme = value ? 'dark' : 'light'
      setDark(value)
    }
    apply(); media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])
  return dark
}
