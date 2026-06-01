import { useLocation, useNavigate } from 'react-router-dom'
import { Home, Dumbbell, ClipboardList, History } from 'lucide-react'

const navItems = [
  { path: '/', icon: Home, label: '首页' },
  { path: '/exercises', icon: Dumbbell, label: '动作库' },
  { path: '/templates', icon: ClipboardList, label: '模板' },
  { path: '/history', icon: History, label: '历史' },
]

export default function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around h-16 bg-surface-0/80 backdrop-blur-xl border-t border-border">
      {navItems.map(({ path, icon: Icon, label }) => {
        const active = location.pathname === path
        return (
          <button
            key={path}
            onClick={() => navigate(path)}
            className={`flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-all duration-200 ${
              active ? 'text-accent-light' : 'text-muted active:text-secondary'
            }`}
          >
            <div className="relative">
              <Icon size={22} strokeWidth={active ? 2.2 : 1.8} />
              {active && (
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-accent-light" />
              )}
            </div>
            <span className={`text-[10px] mt-0.5 ${active ? 'font-medium' : ''}`}>{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
