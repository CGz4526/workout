import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import ThemeToggle from './ThemeToggle'

interface HeaderProps {
  title: string
  showBack?: boolean
  rightAction?: React.ReactNode
}

export default function Header({ title, showBack, rightAction }: HeaderProps) {
  const navigate = useNavigate()

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between px-4 h-14 bg-surface-0/80 backdrop-blur-xl border-b border-border">
      <div className="flex items-center gap-1 w-16">
        {showBack && (
          <button onClick={() => navigate(-1)} className="p-1 -ml-1 rounded-lg active:bg-surface-2 transition-colors">
            <ArrowLeft size={22} className="text-secondary" />
          </button>
        )}
      </div>
      <h1 className="text-base font-semibold text-primary tracking-wide">{title}</h1>
      <div className="flex items-center gap-1 w-16 justify-end">
        {rightAction}
        <ThemeToggle />
      </div>
    </header>
  )
}
