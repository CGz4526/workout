import { useLocation, useNavigate } from 'react-router-dom'
import { Home, Dumbbell, History, BarChart3 } from 'lucide-react'

const navItems = [
  { path: '/', icon: Home, label: '首页' },
  { path: '/exercises', icon: Dumbbell, label: '动作库' },
  { path: '/stats', icon: BarChart3, label: '统计' },
  { path: '/history', icon: History, label: '历史' },
]

export default function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 mx-auto flex h-16 max-w-lg items-stretch justify-around border-t border-border bg-surface-0/80 px-2 backdrop-blur-xl">
      {navItems.map(({ path, icon: Icon, label }) => {
        const active = location.pathname === path
        return (
          <button
            key={path}
            onClick={() => navigate(path)}
            aria-current={active ? 'page' : undefined}
            className={`flex flex-1 flex-col items-center justify-center gap-1 rounded-xl transition-colors duration-200 ${
              active ? 'text-accent-dark dark:text-accent-light' : 'text-muted active:text-secondary'
            }`}
          >
            {/* 选中态用一枚淡色药丸托住图标，比原来的小圆点更容易一眼定位 */}
            <span className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-200 ${active ? 'bg-accent-soft' : ''}`}>
              <Icon size={19} strokeWidth={active ? 2.3 : 1.8} />
            </span>
            <span className={`text-[10px] leading-none ${active ? 'font-semibold' : ''}`}>{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
