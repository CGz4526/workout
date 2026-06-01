import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { Play, Clock, Zap, ChevronRight, Shield, Heart, ArrowBigUp, Footprints, Target, Flame } from 'lucide-react'
import { db } from '../db'
import Header from '../components/Header'

const BODY_PART_META: Record<string, { gradient: string; icon: React.ElementType }> = {
  '肩':   { gradient: 'from-orange-500 to-amber-500', icon: Shield },
  '胸':   { gradient: 'from-red-500 to-rose-500',     icon: Heart },
  '背':   { gradient: 'from-blue-500 to-cyan-500',    icon: ArrowBigUp },
  '腿':   { gradient: 'from-purple-500 to-violet-500', icon: Footprints },
  '二头': { gradient: 'from-pink-500 to-fuchsia-500',  icon: Target },
  '三头': { gradient: 'from-teal-500 to-emerald-500',  icon: Zap },
  '核心': { gradient: 'from-yellow-500 to-orange-500', icon: Flame },
}

export default function Home() {
  const navigate = useNavigate()
  const templates = useLiveQuery(() => db.templates.toArray()) ?? []
  const activeSession = useLiveQuery(() =>
    db.sessions.filter((s) => !s.finished).first()
  )
  const recentSessions = useLiveQuery(() =>
    db.sessions.orderBy('date').reverse().toArray().then(
      (all) => all.filter((s) => s.finished)
    )
  ) ?? []
  const allExercises = useLiveQuery(() => db.exercises.toArray()) ?? []

  const today = new Date().toLocaleDateString('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })

  const startWorkout = async (templateId?: string) => {
    const template = templateId
      ? await db.templates.get(templateId)
      : undefined

    const session = {
      id: crypto.randomUUID(),
      templateId: template?.id,
      templateName: template?.name ?? '自由训练',
      date: new Date().toISOString(),
      duration: 0,
      exercises: [] as any[],
      finished: false,
      startTime: Date.now(),
    }

    await db.sessions.add(session)
    navigate(`/session/${session.id}`)
  }

  const clearAllSessions = async () => {
    if (!confirm('确定清除所有训练记录？此操作不可撤销。')) return
    await db.sessions.clear()
  }

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const getTemplateBodyPart = (template: typeof templates[0]) => {
    const bodyPartCounts: Record<string, number> = {}
    for (const item of template.items) {
      const ex = allExercises.find((e) => e.id === item.exerciseId)
      if (ex) {
        bodyPartCounts[ex.bodyPart] = (bodyPartCounts[ex.bodyPart] || 0) + 1
      }
    }
    const sorted = Object.entries(bodyPartCounts).sort((a, b) => b[1] - a[1])
    return sorted[0]?.[0] ?? '肩'
  }

  return (
    <div className="min-h-screen bg-surface-0 pb-20">
      <Header title="健身记录" />

      <div className="px-4 pt-5 pb-6">
        <div className="mb-6 animate-fade-in">
          <p className="text-muted text-xs uppercase tracking-widest mb-1">{today}</p>
          <h2 className="text-2xl font-bold text-primary">
            今日训练<span className="text-accent-light">.</span>
          </h2>
        </div>

        {/* Continue active workout */}
        {activeSession && (
          <button
            onClick={() => navigate(`/session/${activeSession.id}`)}
            className="w-full group relative overflow-hidden flex items-center justify-center gap-2.5 py-4 mb-4 bg-gradient-to-r from-amber-600 to-orange-500 active:from-amber-700 active:to-orange-600 text-white font-semibold rounded-2xl transition-all duration-200 shadow-lg shadow-amber-500/20 animate-fade-in"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-active:translate-x-[100%] transition-transform duration-700" />
            继续训练：{activeSession.templateName}
          </button>
        )}

        {/* New workout */}
        <button
          onClick={() => startWorkout()}
          className="w-full group relative overflow-hidden flex items-center justify-center gap-2.5 py-4 mb-8 bg-gradient-to-r from-emerald-600 to-emerald-500 active:from-emerald-700 active:to-emerald-600 text-white font-semibold rounded-2xl transition-all duration-200 shadow-lg shadow-emerald-500/20 animate-fade-in"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-active:translate-x-[100%] transition-transform duration-700" />
          <Play size={20} fill="currentColor" />
          开始空白训练
        </button>

        {/* Templates */}
        {templates.length > 0 && (
          <section className="mb-8 animate-fade-in" style={{ animationDelay: '0.1s' }}>
            <div className="flex items-center gap-2 mb-4">
              <Zap size={16} className="text-accent-light" />
              <h3 className="text-primary text-sm font-semibold tracking-wide">快速开始</h3>
            </div>
            <div className="grid gap-2.5">
              {templates.map((t) => {
                const bp = getTemplateBodyPart(t)
                const meta = BODY_PART_META[bp] ?? BODY_PART_META['肩']
                const Icon = meta.icon
                return (
                  <button
                    key={t.id}
                    onClick={() => startWorkout(t.id)}
                    className="group flex items-center gap-3.5 p-4 bg-surface-1 rounded-2xl border border-border active:bg-surface-2 transition-all duration-200"
                  >
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${meta.gradient} flex items-center justify-center shrink-0 shadow-lg`}>
                      <Icon size={18} className="text-white" />
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-primary font-semibold text-sm">{t.name}</p>
                      <p className="text-muted text-xs mt-0.5">
                        {t.items.map((item) => item.exerciseName).slice(0, 3).join('、')}
                        {t.items.length > 3 ? ` +${t.items.length - 3}` : ''}
                      </p>
                    </div>
                    <ChevronRight size={18} className="text-surface-3 group-active:text-secondary transition-colors shrink-0" />
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {/* Recent sessions */}
        {recentSessions.length > 0 && (
          <section className="animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <div className="flex items-center gap-2 mb-4">
              <Clock size={16} className="text-secondary" />
              <h3 className="text-primary text-sm font-semibold tracking-wide">最近训练</h3>
            </div>
            <div className="grid gap-2.5">
              {recentSessions.slice(0, 5).map((s) => {
                const completedSets = s.exercises.reduce(
                  (sum, ex) => sum + ex.sets.filter((st) => st.completed).length, 0
                )
                return (
                  <button
                    key={s.id}
                    onClick={() => navigate(`/session/${s.id}`)}
                    className="group flex items-center gap-3.5 p-4 bg-surface-1 rounded-2xl border border-border active:bg-surface-2 transition-all duration-200"
                  >
                    <div className="w-10 h-10 rounded-xl bg-surface-2 flex items-center justify-center shrink-0">
                      <Clock size={18} className="text-secondary" />
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-primary font-medium text-sm">
                        {s.templateName ?? '自由训练'}
                      </p>
                      <p className="text-muted text-xs mt-0.5">
                        {new Date(s.date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                        {' · '}
                        {completedSets} 组 · {formatDuration(s.duration)}
                      </p>
                    </div>
                    <ChevronRight size={18} className="text-surface-3 group-active:text-secondary transition-colors shrink-0" />
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {/* Clear all data */}
        <div className="mt-8 text-center">
          <button
            onClick={clearAllSessions}
            className="text-muted text-xs active:text-red-400 transition-colors"
          >
            清除所有训练记录
          </button>
        </div>
      </div>
    </div>
  )
}
