import { Check } from 'lucide-react'

interface CheckButtonProps {
  checked: boolean
  onClick: () => void
}

export default function CheckButton({ checked, onClick }: CheckButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 ${
        checked
          ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-lg shadow-emerald-500/25 animate-check-pop'
          : 'bg-surface-2 text-muted border border-surface-3 active:border-secondary'
      }`}
    >
      {checked && <Check size={18} strokeWidth={3} />}
    </button>
  )
}
