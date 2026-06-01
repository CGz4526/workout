import { useState, useEffect } from 'react'
import { Sun, Moon } from 'lucide-react'

export default function ThemeToggle() {
  const [dark, setDark] = useState(() => {
    return document.documentElement.classList.contains('dark')
  })

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }, [dark])

  return (
    <button
      onClick={() => setDark(!dark)}
      className="p-1.5 rounded-lg active:bg-surface-2 transition-colors"
      aria-label="切换主题"
    >
      {dark ? (
        <Sun size={18} className="text-muted" />
      ) : (
        <Moon size={18} className="text-muted" />
      )}
    </button>
  )
}
